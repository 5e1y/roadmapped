import { ArrowRotateCcw, Check, EditPen, Play, Plus, Pulse, Trash, Undo } from 'trinil-react'
import { useLiveActivity, type LiveEntry, type LiveVerb } from '../state/LiveActivity'
import { usePanel } from '../state/PanelContext'
import { groupByDay } from '../lib/activityFeed'
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

function EntryRow({ entry, onOpenTask }: { entry: LiveEntry; onOpenTask: (id: number) => void }) {
  const Icon = VERB_ICON[entry.verb]
  // Une tâche supprimée n'est plus navigable : ligne inerte, même registre visuel.
  const gone = entry.verb === 'removed'
  const fresh = Date.now() - entry.receivedAt < FRESH_MS
  const body = (
    <>
      <Icon size={14} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden="true" />
      <span className="shrink-0 font-medium text-neutral-700">{entry.verb}</span>
      <span className="shrink-0 font-mono text-xs text-neutral-500">#{entry.id}</span>
      {entry.title && (
        <span className="min-w-0 flex-1 text-neutral-600" title={entry.title}>
          {entry.title}
        </span>
      )}
      <span className="ml-auto shrink-0 pl-3 font-mono text-xs tabular-nums text-neutral-400">{entry.at}</span>
    </>
  )
  // Plein écran : plus d'air que l'overlay (py-2.5/px-4, text-sm), titre non tronqué
  // → items-start pour aligner l'icône quand le titre passe à la ligne.
  const cls = `flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm ${fresh ? 'live-entry-in' : ''}`
  if (gone) return <div className={cls}>{body}</div>
  return (
    <button type="button" onClick={() => onOpenTask(entry.id)} className={`${cls} hover:bg-neutral-100`}>
      {body}
    </button>
  )
}

export function ActivityView() {
  const activity = useLiveActivity()
  const { openTask } = usePanel()
  const log = activity?.log ?? []
  const groups = groupByDay(log)

  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={log.length > 0 ? `${log.length} this session` : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {log.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Pulse size={22} className="text-neutral-300" aria-hidden="true" />
            <p className="mt-1 text-sm font-medium text-neutral-700">Aucune activité pour cette session</p>
            <p className="max-w-sm text-xs text-neutral-500">
              Les changements en direct de vos tâches apparaissent ici. L'historique complet vit
              dans votre git log sur docs/tasks/ — chaque done est un commit.
            </p>
          </div>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.dayMs}>
                <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                  {group.label}
                </div>
                <ul className="divide-y divide-neutral-100">
                  {group.entries.map((entry) => (
                    <li key={entry.key}>
                      <EntryRow entry={entry} onOpenTask={openTask} />
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
