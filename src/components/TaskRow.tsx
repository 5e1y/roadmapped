import { Collapsible } from '@base-ui/react/collapsible'
import { LockLocked } from 'trinil-react'
import { Chip } from './Chip'
import { Chevron, KindGlyph } from './glyphs'
import { usePanel } from '../state/PanelContext'
import { useOptionalTree } from '../state/TreeContext'
import { usePersistentFlag } from '../state/uiPersist'
import { useSeenTasks } from '../state/seenTasks'
import { computeAvailability, reverseDependents } from '../lib/roadmap'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import { TEAM_ABBR } from '../lib/tasks'
import type { TaskNode } from '../lib/tasks'

/**
 * Brief prêt-à-coller pour lancer un agent sur la tâche : les données de la
 * tâche + le contrat CLI pour la démarrer, la terminer et la documenter.
 * C'est le pont humain (navigateur) → agent (session Claude Code).
 */
export function agentBrief(task: TaskNode): string {
  const meta = [
    `Status: ${task.status}`,
    task.size && `Size: ${task.size}`,
    task.team && `Team: ${task.team}`,
    task.code && `Code: ${task.code}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    `Task #${task.id} — ${task.title}`,
    `File: ${task.file}`,
    meta,
    task.tags.length > 0 ? `Tags: ${task.tags.join(', ')}` : null,
    task.refs.length > 0 ? `Refs: ${task.refs.join(' · ')}` : null,
    task.links.length > 0 ? `Linked tasks: ${task.links.map((l) => `#${l}`).join(' ')}` : null,
    task.detail ? `\n${task.detail.trim()}` : null,
    '',
    'Managed through the dashboard CLI (from the repo root):',
    `- JSON detail: node scripts/task.mjs show ${task.id} --json`,
    `- start: node scripts/task.mjs start ${task.id}`,
    `- finish + document: node scripts/task.mjs done ${task.id} --commit <sha> --verification "<how the artifact was verified>"`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

export function TaskRow({ task }: { task: TaskNode }) {
  const { openTask, top } = usePanel()
  const { isNew } = useSeenTasks()
  const tree = useOptionalTree()
  // Même source d'état que la Roadmap : computeAvailability (mémoïsé par tree,
  // aucun recalcul maison). 'locked' = prérequis non faits → cadenas au lieu du glyphe.
  const locked = tree ? computeAvailability(tree).get(task.id) === 'locked' : false
  // Jalon (#133) : badge « bloque N » = dépendants inverses (calculé, aucun champ YAML).
  const blocksCount = tree && task.kind === 'milestone' ? reverseDependents(tree, task.id).length : 0
  // Dépliage des sous-tâches persisté (survit à la navigation et au rechargement).
  const [open, setOpen] = usePersistentFlag('backlog:tasks', task.id)
  const isDone = task.status === 'done'
  const subDone = task.subtasks.filter((s) => s.status === 'done').length
  const hasSubs = task.subtasks.length > 0
  // Feedback ouvert (#149) : compteur discret quand ≥1 retour non résolu.
  const openFeedback = task.feedback?.filter((f) => !f.resolved).length ?? 0
  // Tâche affichée dans le side panel : surlignée à l'accent pour rester
  // repérable pendant qu'on navigue dans le backlog (#36).
  const isOpenInPanel = top?.type === 'task' && top.id === task.id

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* Le padding vertical vit dans les éléments INTERACTIFS (pas le
          conteneur) : toute la hauteur de la ligne est cliquable. */}
      <div className={`flex w-full flex-wrap items-center gap-2 px-4 text-sm ${isOpenInPanel ? 'bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-neutral-50'}`}>
        {/* Chevron = toggle des sous-tâches, rendu UNIQUEMENT si la tâche en a. Pas de
            spacer fantôme sinon (#97) : les lignes sans sous-tâche s'alignent à gauche. */}
        {hasSubs && (
          <Collapsible.Trigger
            className="flex shrink-0 items-center self-stretch rounded px-0.5 hover:bg-neutral-200"
            aria-label={open ? 'Collapse subtasks' : 'Expand subtasks'}
            onClick={(e) => e.stopPropagation()}
          >
            <Chevron />
          </Collapsible.Trigger>
        )}
        {/* Corps cliquable = ouvre le panneau détail. */}
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
        >
          {locked
            ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Locked" />
            : <KindGlyph task={task} />}
          {/* Badge NEW/non-lu (#147, Live 5) : point accent sur un ticket apparu ou
              changé depuis la dernière lecture ; retiré à l'ouverture du panneau. */}
          {isNew(task) && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-accent"
              role="status"
              aria-label="New or updated since you last viewed it"
            />
          )}
          <span className="shrink-0 font-mono text-xs text-neutral-500">#{task.id}</span>
          {/* Une ligne STRICTE (pattern Linear) : le titre tronque (tooltip natif),
              les chips restent ancrés à droite. Familles différenciées (cf.
              Chip.tsx), tags en texte léger plafonnés à 3 (+n), source retiré —
              le détail complet vit dans le panneau. */}
          <span
            title={task.title}
            className={`min-w-0 truncate ${isDone ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}
          >
            {task.title}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {/* Liste une-colonne : la date de bouclage passe sur la ligne. */}
            {task.completedAt && (
              <span className="font-mono text-[11px] text-neutral-500" title={absoluteDate(task.completedAt)}>{relativeTime(task.completedAt)}</span>
            )}
            {openFeedback > 0 && (
              <span className="text-[11px] text-neutral-500" title={`${openFeedback} open feedback item(s)`}>
                feedback {openFeedback}
              </span>
            )}
            {hasSubs && (
              <span className="font-mono text-[11px] text-neutral-500">
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {blocksCount > 0 && (
              <span className="text-[11px] text-neutral-500" title={`This milestone locks ${blocksCount} task(s) via dependsOn`}>
                blocks {blocksCount}
              </span>
            )}
            {task.tags.slice(0, 3).map((t) => (
              <span key={t} className="text-[11px] text-neutral-500">#{t}</span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[11px] text-neutral-500" title={task.tags.slice(3).join(', ')}>
                +{task.tags.length - 3}
              </span>
            )}
            {task.code && <Chip label={task.code} mono />}
            <Chip label={TEAM_ABBR[task.team]} />
            {task.size && <Chip label={task.size} mono strong />}
          </span>
        </button>
      </div>
      {hasSubs && (
        <Collapsible.Panel>
          <div className="ml-9 divide-y divide-neutral-100 border-l border-neutral-200">
            {task.subtasks.map((sub) => (
              <TaskRow key={sub.id} task={sub} />
            ))}
          </div>
        </Collapsible.Panel>
      )}
    </Collapsible.Root>
  )
}
