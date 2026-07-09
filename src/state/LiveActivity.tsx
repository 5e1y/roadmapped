import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Toast } from '@base-ui/react/toast'
import { useTree } from './TreeContext'
import { ToastViewport } from '../components/ui'
import type { TreeDiff } from '../lib/treeDiff'

/*
 * État du live « Activity » (#205, Live updates V2). La logique V1 de
 * LiveConsoleInner (#147, Live 6) LEVÉE dans un provider au niveau App :
 * ViewHeader est remonté à chaque changement de vue (4 instances), le log et
 * le compteur de non-lus doivent lui survivre. Le déclencheur + Popover
 * (LiveActivityMenu) n'est plus qu'une feuille présentationnelle qui lit ce
 * contexte depuis le cluster droit du header.
 *
 * Le fond ne change pas : diff prev/next du resync SSE (TreeContext
 * lastChange) → log horodaté, session seulement (l'historique hors-session,
 * c'est `git log` sur docs/tasks/ — chaque done = un commit). Un toast salue
 * chaque « Task finished! ». Le Toast.Provider vit ici : global, une seule
 * file quelle que soit la vue affichée.
 */

export type LiveVerb = 'created' | 'started' | 'finished' | 'reopened' | 'moved to todo' | 'edited' | 'removed'

/** Événement pur, tel que dérivé du diff (testé dans LiveActivity.test.ts). */
export interface LiveEvent {
  at: string
  verb: LiveVerb
  id: number
  /** Vide pour `removed` : le titre n'existe plus dans le tree — l'UI n'affiche que #id. */
  title: string
}

/** Entrée du log : l'événement décoré d'une clé stable et de son heure d'arrivée. */
export interface LiveEntry extends LiveEvent {
  /** Clé monotone (ordre d'arrivée) — clé React stable, le flash ne rejoue pas. */
  key: number
  /** Epoch ms — les entrées fraîches (<2s) s'allument brièvement à l'ouverture. */
  receivedAt: number
}

function clock(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function verbForStatus(from: string, to: string): LiveVerb {
  if (to === 'done') return 'finished'
  if (to === 'in_progress') return from === 'done' ? 'reopened' : 'started'
  return 'moved to todo'
}

/** Diff → événements horodatés, dans l'ordre du diff (le provider inverse pour l'affichage). */
export function eventsFromDiff(diff: TreeDiff, at: string = clock()): LiveEvent[] {
  return [
    ...diff.appeared.map((t) => ({ at, verb: 'created' as const, id: t.id, title: t.title })),
    ...diff.statusChanges.map((c) => ({ at, verb: verbForStatus(c.from, c.to), id: c.id, title: c.title })),
    ...diff.edited.map((t) => ({ at, verb: 'edited' as const, id: t.id, title: t.title })),
    ...diff.removed.map((id) => ({ at, verb: 'removed' as const, id, title: '' })),
  ]
}

export interface LiveActivityState {
  /** Log de session, le plus récent en tête (plafond 200 — assumé, spec V1 §4). */
  log: LiveEntry[]
  /** Événements arrivés panneau fermé — remis à zéro à l'ouverture. */
  unread: number
  /** Ouverture du Popover — vit ICI pour survivre au remontage de ViewHeader. */
  open: boolean
  setOpen: (open: boolean) => void
}

const LiveActivityContext = createContext<LiveActivityState | null>(null)

/**
 * NON-JETANT (modèle useOptionalTree) : ViewHeader est aussi monté hors
 * provider dans les tests unitaires — le déclencheur rend alors null.
 */
export function useLiveActivity(): LiveActivityState | null {
  return useContext(LiveActivityContext)
}

function LiveActivityInner({ children }: { children: ReactNode }) {
  const { lastChange } = useTree()
  const toast = Toast.useToastManager()
  const [log, setLog] = useState<LiveEntry[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpenState] = useState(false)
  const lastSeqRef = useRef(0)
  const keyRef = useRef(0)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!lastChange || lastChange.seq === lastSeqRef.current) return
    lastSeqRef.current = lastChange.seq
    const events = eventsFromDiff(lastChange.diff)
    if (events.length > 0) {
      const receivedAt = Date.now()
      const batch = events.map((e) => ({ ...e, key: ++keyRef.current, receivedAt }))
      setLog((prev) => [...batch.reverse(), ...prev].slice(0, 200))
      if (!openRef.current) setUnread((u) => u + events.length)
    }
    // Toast sur chaque transition → done (spec V1 §4 : done seul, le reste vit dans le panneau).
    for (const c of lastChange.diff.statusChanges) {
      if (c.to === 'done') toast.add({ title: 'Task finished!', description: `#${c.id} — ${c.title}` })
    }
  }, [lastChange, toast])

  // Ouvrir = tout lu. Le badge s'éteint dès le clic, pas à la fermeture.
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    if (next) setUnread(0)
  }, [])

  const value = useMemo<LiveActivityState>(
    () => ({ log, unread, open, setOpen }),
    [log, unread, open, setOpen],
  )

  return (
    <LiveActivityContext.Provider value={value}>
      {children}
      <ToastViewport />
    </LiveActivityContext.Provider>
  )
}

/** Enveloppe Shell dans App. Build démo statique : aucun SSE → no-op transparent
    (pas de contexte, le déclencheur du header rend null). */
export function LiveActivityProvider({ children }: { children: ReactNode }) {
  if ((window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__) {
    return <>{children}</>
  }
  return (
    <Toast.Provider>
      <LiveActivityInner>{children}</LiveActivityInner>
    </Toast.Provider>
  )
}
