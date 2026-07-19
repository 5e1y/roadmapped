import { useEffect, useMemo } from 'react'
import { ArrowRotateCcw, Check, EditPen, Play, Plus, Pulse, Trash, Undo } from 'trinil-react'
import { useLiveActivity, type LiveEntry, type LiveVerb } from '../state/LiveActivity'
import { usePanel } from '../state/PanelContext'
import { useTree } from '../state/TreeContext'
import { groupByDay } from '../lib/activityFeed'
import { flattenTasks } from '../lib/treeDiff'
import { KindGlyph, StatusGlyph } from './glyphs'
import { rowTemperature, TempBadge } from './Temperature'
import { EmptyState } from './ui'
import { ViewHeader } from './ViewHeader'
import type { TaskNode } from '../lib/tasks'

/*
 * Onglet Activity (#395, refonte feed) — plus des lignes plein écran mais un FEED
 * façon Twitter, colonne 400px centrée : chaque changement est une CARTE (icône du
 * verbe à gauche, l'action + #id, l'heure à droite, le titre, puis un APERÇU :
 * la transition de statut pour un changement d'état, un résumé du ticket
 * (type + tags + température) pour une création). Session seulement (l'historique
 * hors-session, c'est `git log` sur docs/tasks/). Groupé par jour (en-têtes collants).
 */

const VERB_ICON: Record<LiveVerb, typeof Plus> = {
  created: Plus,
  started: Play,
  finished: Check,
  reopened: ArrowRotateCcw,
  'moved to todo': Undo,
  edited: EditPen,
  removed: Trash,
}
const VERB_LABEL: Record<LiveVerb, string> = {
  created: 'Created', started: 'Started', finished: 'Finished', reopened: 'Reopened',
  'moved to todo': 'Moved to To do', edited: 'Edited', removed: 'Removed',
}
const STATUS_LABEL: Record<TaskNode['status'], string> = {
  todo: 'To do', in_progress: 'In progress', done: 'Done',
}
/** Type lisible depuis le chemin `docs/tasks/NN-type/…` (ex. « 01-bug » → « bug »). */
const typeOf = (task: TaskNode): string =>
  task.file.split('/').slice(-2, -1)[0]?.replace(/^\d+-/, '') ?? ''

function EventCard({ entry, task, isCurrent, onOpenTask }: {
  entry: LiveEntry
  task: TaskNode | undefined
  isCurrent: boolean
  onOpenTask: (id: number) => void
}) {
  const Icon = VERB_ICON[entry.verb]
  const fresh = Date.now() - entry.receivedAt < 2000
  const gone = entry.verb === 'removed'
  const temp = task ? rowTemperature(task) : null

  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-round bg-background text-textsoft">
          <Icon size={13} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-texthard">{VERB_LABEL[entry.verb]}</span>
        <span className="font-mono text-xs text-textsoft">#{entry.id}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-textsoft">{entry.at}</span>
      </div>
      {entry.title && <div className="text-sm text-texthard">{entry.title}</div>}
      {/* Aperçu : la transition de statut (ce qui a changé)… */}
      {entry.from && entry.to && (
        <div className="flex items-center gap-1.5 text-[11px] text-textsoft">
          <StatusGlyph status={entry.from} />
          <span>{STATUS_LABEL[entry.from]}</span>
          <span aria-hidden="true">→</span>
          <StatusGlyph status={entry.to} />
          <span className="font-medium text-texthard">{STATUS_LABEL[entry.to]}</span>
        </div>
      )}
      {/* …ou un résumé du ticket créé (type + tags + température). */}
      {entry.verb === 'created' && task && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-textsoft">
          <span className="flex items-center gap-1">
            <KindGlyph task={task} />
            {typeOf(task)}
          </span>
          {task.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
          {temp && <TempBadge t={temp} />}
        </div>
      )}
    </>
  )

  const cls = `rm-node flex flex-col gap-1.5 p-3 ${fresh ? 'live-entry-in' : ''}`
  if (gone) return <div className={`${cls} opacity-70`}>{body}</div>
  return (
    <button
      type="button"
      onClick={() => onOpenTask(entry.id)}
      aria-current={isCurrent ? 'true' : undefined}
      className={`${cls} w-full text-left transition-colors ${isCurrent ? 'bg-active' : 'hover:bg-rollover'}`}
    >
      {body}
    </button>
  )
}

export function ActivityView() {
  const activity = useLiveActivity()
  const { openTask, top } = usePanel()
  const { tree } = useTree()
  const log = activity?.log ?? []
  const groups = groupByDay(log)
  const byId = useMemo(() => (tree ? flattenTasks(tree) : new Map<number, TaskNode>()), [tree])

  // Ouvrir l'onglet Activity = tout lu (le point de notif accent du rail s'éteint).
  // Les events arrivés PENDANT qu'on regarde ne comptent pas comme non-lus.
  const setOpen = activity?.setOpen
  useEffect(() => {
    setOpen?.(true)
    return () => setOpen?.(false)
  }, [setOpen])

  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={log.length > 0 ? `${log.length} this session` : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {log.length === 0 ? (
          <EmptyState
            className="h-full"
            glyph={<Pulse size={22} />}
            title="No activity this session"
            hint="Live changes to your tasks show up here as a feed. The full history lives in your git log over docs/tasks/ — every done is a commit."
          />
        ) : (
          <div className="mx-auto max-w-[800px] px-3 py-4">
            {groups.map((group) => (
              <div key={group.dayMs} className="mb-1">
                <div className="sticky top-0 z-10 -mx-3 bg-background px-3 py-1.5 text-[11px] font-medium text-textsoft">
                  {group.label}
                </div>
                <div className="flex flex-col gap-2 pt-2">
                  {group.entries.map((entry) => (
                    <EventCard
                      key={entry.key}
                      entry={entry}
                      task={byId.get(entry.id)}
                      isCurrent={top?.type === 'task' && top.id === entry.id}
                      onOpenTask={openTask}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
