import { ArrowRotateCcw, Check, EditPen, Play, Plus, Pulse, Trash, Undo } from 'trinil-react'
import { useLiveActivity, type LiveEntry, type LiveVerb } from '../state/LiveActivity'
import { usePanel } from '../state/PanelContext'
import { groupByDay } from '../lib/activityFeed'
import { EmptyState, rowStateClass } from './ui'
import { ViewHeader } from './ViewHeader'

/*
 * Onglet Activity (#372 stub → rempli en #377) : feed timestampé plein écran,
 * version ÉTENDUE de l'ex-overlay du header (LiveActivityMenu, SUPPRIMÉ en #377 :
 * il était orphelin depuis que le bouton a quitté le header en #372). EntryRow +
 * les icônes-verbes en viennent, migrés ici (plus d'air : icône/texte plus grands,
 * titre NON tronqué). Consomme `useLiveActivity().log` (inchangé : session-only,
 * plafond 200, alimenté par le diff SSE) et le groupe par JOUR local (activityFeed).
 * Hors provider (build démo statique, smoke test sans LiveActivityProvider) :
 * log vide → état vide.
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

function EntryRow({ entry, isCurrent, onOpenTask }: { entry: LiveEntry; isCurrent: boolean; onOpenTask: (id: number) => void }) {
  const Icon = VERB_ICON[entry.verb]
  // A removed task is no longer navigable: inert row, same visual register.
  const gone = entry.verb === 'removed'
  const fresh = Date.now() - entry.receivedAt < FRESH_MS
  const body = (
    <>
      <Icon size={14} className="mt-0.5 shrink-0 text-textsoft" aria-hidden="true" />
      <span className="shrink-0 font-medium text-texthard">{entry.verb}</span>
      <span className="shrink-0 font-mono text-xs text-textsoft">#{entry.id}</span>
      {entry.title && (
        <span className="min-w-0 flex-1 text-textsoft" title={entry.title}>
          {entry.title}
        </span>
      )}
      <span className="ml-auto shrink-0 pl-3 font-mono text-xs tabular-nums text-textsoft">{entry.at}</span>
    </>
  )
  // Full screen: more air than the overlay (py-2.5/px-4, text-sm), title not
  // truncated → items-start to keep the icon aligned when the title wraps.
  const cls = `flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm ${fresh ? 'live-entry-in' : ''}`
  if (gone) return <div className={cls}>{body}</div>
  // Current ticket highlighted via the shared selection language (#380) — and the
  // canonical row hover (neutral-50), not the divergent neutral-100 of before.
  return (
    <button
      type="button"
      onClick={() => onOpenTask(entry.id)}
      aria-current={isCurrent ? 'true' : undefined}
      className={`${cls} ${rowStateClass(isCurrent)}`}
    >
      {body}
    </button>
  )
}

export function ActivityView() {
  const activity = useLiveActivity()
  const { openTask, top } = usePanel()
  const log = activity?.log ?? []
  const groups = groupByDay(log)

  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={log.length > 0 ? `${log.length} this session` : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {log.length === 0 ? (
          <EmptyState
            className="h-full"
            glyph={<Pulse size={22} />}
            title="No activity this session"
            hint="Live changes to your tasks show up here. The full history lives in your git log over docs/tasks/ — every done is a commit."
          />
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.dayMs}>
                <div className="sticky top-0 z-10 border-b border-border bg-foreground px-4 py-1.5 text-[11px] font-medium text-textsoft">
                  {group.label}
                </div>
                <ul className="rm-list">
                  {group.entries.map((entry) => (
                    <li key={entry.key} className="rm-list-item">
                      <EntryRow entry={entry} isCurrent={top?.type === 'task' && top.id === entry.id} onOpenTask={openTask} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
