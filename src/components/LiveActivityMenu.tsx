import { Popover } from '@base-ui/react/popover'
import { ArrowRotateCcw, Check, EditPen, Play, Plus, Pulse, Trash, Undo } from 'trinil-react'
import { useLiveActivity, type LiveActivityState, type LiveEntry, type LiveVerb } from '../state/LiveActivity'
import { usePanel } from '../state/PanelContext'

/*
 * Live updates V2 (#205) : le panneau « Activity » docké dans le cluster droit
 * du header — même langage que les FilterMenu voisins (Popover Base UI, trigger
 * rounded-md h-aligné). Feuille PRÉSENTATIONNELLE : tout l'état (log, unread,
 * open) vit dans LiveActivityProvider et survit au remontage de ViewHeader à
 * chaque changement de vue. Hors provider (tests unitaires, build démo
 * statique) : rendu null.
 *
 * ponytail: filtre par verbe et regroupement des rafales reportés — le log de
 * session reste court (plafond 200), la liste brute se scanne très bien.
 */

/** Durée pendant laquelle une entrée fraîche s'allume (cf. .live-entry-in, index.css). */
const FRESH_MS = 2000

const VERB_ICON: Record<LiveVerb, typeof Plus> = {
  created: Plus,
  started: Play,
  finished: Check,
  reopened: ArrowRotateCcw,
  'moved to todo': Undo,
  edited: EditPen,
  removed: Trash,
}

function EntryRow({ entry, onOpenTask }: { entry: LiveEntry; onOpenTask: (id: number) => void }) {
  const Icon = VERB_ICON[entry.verb]
  // Une tâche supprimée n'est plus navigable : ligne inerte, même registre visuel.
  const gone = entry.verb === 'removed'
  const fresh = Date.now() - entry.receivedAt < FRESH_MS
  const body = (
    <>
      <Icon size={10} className="shrink-0 text-neutral-500" />
      <span className="shrink-0 font-medium text-neutral-700">{entry.verb}</span>
      <span className="shrink-0 font-mono text-[11px] text-neutral-500">#{entry.id}</span>
      {entry.title && (
        <span className="min-w-0 flex-1 truncate text-neutral-600" title={entry.title}>
          {entry.title}
        </span>
      )}
      <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] tabular-nums text-neutral-500">{entry.at}</span>
    </>
  )
  const cls = `flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${fresh ? 'live-entry-in' : ''}`
  if (gone) return <div className={cls}>{body}</div>
  return (
    <button type="button" onClick={() => onOpenTask(entry.id)} className={`${cls} hover:bg-neutral-100`}>
      {body}
    </button>
  )
}

function LiveActivityMenuInner({ activity }: { activity: LiveActivityState }) {
  const { log, unread, open, setOpen } = activity
  const { openTask } = usePanel()

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Activity${unread > 0 ? `, ${unread} new` : ''}`}
        className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 data-[popup-open]:bg-neutral-100 data-[popup-open]:text-neutral-900"
      >
        <Pulse size={11} className="text-neutral-500" />
        Activity
        {unread > 0 && (
          <span className="pulse-live flex min-w-4 items-center justify-center rounded bg-accent px-1 text-[11px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-80 origin-[var(--transform-origin)] border border-neutral-200 bg-white shadow-lg transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            <div className="flex items-baseline justify-between border-b border-neutral-200 px-3 py-2">
              <Popover.Title className="text-xs font-semibold text-neutral-900">Activity</Popover.Title>
              <span className="text-[11px] text-neutral-500">this session</span>
            </div>
            {log.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
                <Pulse size={16} className="text-neutral-300" aria-hidden="true" />
                <p className="mt-1 text-xs font-medium text-neutral-700">Nothing yet</p>
                <p className="text-[11px] text-neutral-500">Live changes to your tasks show up here.</p>
              </div>
            ) : (
              <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto overscroll-contain">
                {log.map((e) => (
                  <li key={e.key}>
                    <EntryRow
                      entry={e}
                      onOpenTask={(id) => {
                        openTask(id)
                        setOpen(false)
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-neutral-200 px-3 py-1.5 text-[11px] text-neutral-500">
              Session only — full history is your git log on docs/tasks/.
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Déclencheur du header. Sans provider (tests, build démo statique) : null. */
export function LiveActivityMenu() {
  const activity = useLiveActivity()
  if (!activity) return null
  return <LiveActivityMenuInner activity={activity} />
}
