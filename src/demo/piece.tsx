import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TreeProvider } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { KbProvider } from '../state/KbContext'
import { ViewProvider, type View } from '../state/ViewContext'
import { SearchProvider } from '../state/search'
import { ChromeProvider } from '../components/ViewHeader'
import { Backlog } from '../components/Backlog'
import { OverviewView } from '../components/OverviewView'
import { ActivityView } from '../components/ActivityView'
import { GraphView } from '../components/GraphView'
import { TaskPanel } from '../components/TaskPanel'
import { LiveActivityContext, type LiveActivityState, type LiveEntry } from '../state/LiveActivity'

/*
 * Mode « pièce » de la démo (#436) — le site marketing embarque une VUE RÉELLE de
 * l'app isolée (sans NavRail ni header ni panneaux), une par étape du « how it
 * works » et pour la section Knowledge base. C'est le vrai composant qui rend,
 * pas une maquette : ChromeProvider(header:false) retire juste le ViewHeader,
 * et on ne monte que les providers réellement consommés par la vue.
 *
 * L'iframe du how-it-works charge ?piece=<défaut> puis CHANGE de pièce par
 * postMessage ({ roadmappedPiece }) au fil des étapes — un seul bundle, aucun
 * rechargement. La section graphe et le hero gardent leur propre iframe.
 */

// Feed Activity seedé : le build statique n'a pas de SSE (cf. LiveActivity), donc
// sans seed le feed serait vide. Événements plausibles, cohérents avec le
// backlog démo (src/demo/tree.ts), horodatés dans l'heure écoulée (receivedAt
// passé → pas de flash « live-entry-in » réservé aux <2 s).
const NOW = Date.now()
const ACTIVITY_SEED: LiveEntry[] = [
  { key: 4, receivedAt: NOW - 6 * 60000, at: '09:41:12', verb: 'finished', id: 14, title: 'Deploy to Cloudflare Pages', from: 'in_progress', to: 'done' },
  { key: 3, receivedAt: NOW - 14 * 60000, at: '09:33:48', verb: 'edited', id: 10, title: 'Embed the real dashboard in the homepage' },
  { key: 2, receivedAt: NOW - 39 * 60000, at: '09:02:55', verb: 'started', id: 10, title: 'Embed the real dashboard in the homepage', from: 'todo', to: 'in_progress' },
  { key: 1, receivedAt: NOW - 58 * 60000, at: '08:46:20', verb: 'created', id: 17, title: 'Still no database' },
]

/** ActivityView avec un contexte LiveActivity seedé (le vrai feed, alimenté à la main). */
function SeededActivity() {
  const value = useMemo<LiveActivityState>(
    () => ({ log: ACTIVITY_SEED, unread: 0, open: true, setOpen: () => {} }),
    [],
  )
  return (
    <LiveActivityContext.Provider value={value}>
      <ActivityView />
    </LiveActivityContext.Provider>
  )
}

/** TaskPanel isolé : c'est du CONTENU de panneau (normalement dans le SidePanel
 *  docké à droite), on lui redonne donc une colonne bornée + surface élevée. #3
 *  est une tâche done avec un Log complet (outcome + verification + commit). */
function TaskPanelPiece() {
  const ref = useRef<HTMLDivElement>(null)
  // « Review the diff » = le bloc Log (outcome / verification / commit), qui vit
  // en BAS du panneau. On scrolle jusqu'à lui une fois le contenu peint, pour
  // que l'étape montre le résultat consigné, pas seulement l'en-tête.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const t = setTimeout(() => { el.scrollTop = el.scrollHeight }, 150)
    return () => clearTimeout(t)
  }, [])
  return (
    <div ref={ref} className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-foreground px-l py-m shadow-[inset_1px_0_0_var(--color-border)]">
      <TaskPanel id={3} />
    </div>
  )
}

const PIECES: Record<string, () => ReactNode> = {
  backlog: () => <Backlog />,
  overview: () => <OverviewView />,
  activity: () => <SeededActivity />,
  taskpanel: () => <TaskPanelPiece />,
  graph: () => <GraphView />,
}

const VALID_VIEWS: View[] = ['overview', 'backlog', 'roadmap', 'dependencies', 'graph', 'activity', 'docs', 'notepad', 'settings']

export function DemoPiece() {
  const [piece, setPiece] = useState(
    () => new URLSearchParams(location.search).get('piece') ?? 'backlog',
  )
  // Commutation par le site (une seule iframe pour les 4 étapes du how-it-works).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const p = e.data && typeof e.data === 'object' ? (e.data as { roadmappedPiece?: unknown }).roadmappedPiece : null
      if (typeof p === 'string' && PIECES[p]) setPiece(p)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const render = PIECES[piece] ?? (() => <div className="p-l text-xs text-textsoft">unknown piece: {piece}</div>)
  // ViewProvider veut une View valide ; les pièces hors-vue (taskpanel) retombent
  // sur 'backlog' — sans effet, aucune vue ne lit useView ici (le header est off).
  const view = (VALID_VIEWS.includes(piece as View) ? piece : 'backlog') as View

  return (
    <TreeProvider>
      <PanelProvider>
        <KbProvider>
          <ViewProvider view={view} setView={() => {}}>
            <SearchProvider query="" setQuery={() => {}}>
              <ChromeProvider header={false}>
                <div className="h-screen w-screen overflow-hidden bg-background">{render()}</div>
              </ChromeProvider>
            </SearchProvider>
          </ViewProvider>
        </KbProvider>
      </PanelProvider>
    </TreeProvider>
  )
}
