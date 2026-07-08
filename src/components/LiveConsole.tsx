import { useEffect, useRef, useState } from 'react'
import { Toast } from '@base-ui/react/toast'
import { useTree } from '../state/TreeContext'
import { ToastViewport } from './ui'
import type { TreeDiff } from '../lib/treeDiff'

/*
 * Console d'actions live (#147, Live 6). Un tiroir qui retrace, horodaté, ce qui
 * se passe PENDANT la session : tickets créés / démarrés / terminés / rouverts /
 * édités / supprimés — alimenté par le diff prev/next du resync SSE (TreeContext
 * lastChange). Pas de journal serveur : l'historique hors-session, c'est `git log`
 * sur docs/tasks/ (chaque done = un commit). Un rechargement vide la console —
 * plafond assumé (spec §4). Un toast salue chaque « task finished! ».
 */
interface Entry { at: string; verb: string; id: number; title: string }

function clock(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function verbForStatus(from: string, to: string): string {
  if (to === 'done') return 'finished'
  if (to === 'in_progress') return from === 'done' ? 'reopened' : 'started'
  return 'moved to todo'
}

function eventsFromDiff(diff: TreeDiff): Entry[] {
  const at = clock()
  return [
    ...diff.appeared.map((t) => ({ at, verb: 'created', id: t.id, title: t.title })),
    ...diff.statusChanges.map((c) => ({ at, verb: verbForStatus(c.from, c.to), id: c.id, title: c.title })),
    ...diff.edited.map((t) => ({ at, verb: 'edited', id: t.id, title: t.title })),
    ...diff.removed.map((id) => ({ at, verb: 'removed', id, title: `#${id}` })),
  ]
}

function LiveConsoleInner() {
  const { lastChange } = useTree()
  const toast = Toast.useToastManager()
  const [log, setLog] = useState<Entry[]>([])
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const lastSeqRef = useRef(0)
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    if (!lastChange || lastChange.seq === lastSeqRef.current) return
    lastSeqRef.current = lastChange.seq
    const events = eventsFromDiff(lastChange.diff)
    if (events.length === 0) return
    setLog((prev) => [...events.reverse(), ...prev].slice(0, 200))
    if (!openRef.current) setUnread((u) => u + events.length)
    // Toast sur chaque transition → done (spec §4 : done seul, le reste vit dans la console).
    for (const c of lastChange.diff.statusChanges) {
      if (c.to === 'done') toast.add({ title: 'Task finished!', description: `#${c.id} — ${c.title}` })
    }
  }, [lastChange, toast])

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setUnread(0) }}
        className="fixed bottom-4 left-4 z-[90] flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
        aria-label={`Activity console${unread ? `, ${unread} new` : ''}`}
      >
        Activity
        {unread > 0 && (
          <span className="flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <aside
          className="fixed bottom-14 left-4 z-[90] flex max-h-[60vh] w-80 flex-col border border-neutral-200 bg-white shadow-lg"
          aria-label="Activity console"
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
            <span className="text-xs font-semibold text-neutral-900">Activity — this session</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-1 text-neutral-500 hover:bg-neutral-100" aria-label="Close">
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {log.length === 0 ? (
              <p className="px-3 py-4 text-xs text-neutral-500">
                Nothing yet. Live changes to your tasks show up here.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {log.map((e, i) => (
                  <li key={`${e.at}-${e.id}-${i}`} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
                    <span className="shrink-0 font-mono text-[11px] text-neutral-400">{e.at}</span>
                    <span className="shrink-0 font-medium text-neutral-700">{e.verb}</span>
                    <span className="shrink-0 font-mono text-[11px] text-neutral-500">#{e.id}</span>
                    <span className="min-w-0 truncate text-neutral-600" title={e.title}>{e.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-400">
            Session only — full history is your git log on docs/tasks/.
          </p>
        </aside>
      )}
    </>
  )
}

/** Monte la console dans son propre Toast.Provider (toasts « task finished! » globaux). */
export function LiveConsole() {
  // Pas de live sur le build démo statique (aucun SSE) → pas de console.
  if ((window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__) return null
  return (
    <Toast.Provider>
      <LiveConsoleInner />
      <ToastViewport />
    </Toast.Provider>
  )
}
