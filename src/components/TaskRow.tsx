import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chip } from './Chip'
import { Chevron, StatusGlyph } from './glyphs'
import { usePanel } from '../state/PanelContext'
import type { TaskNode } from '../lib/tasks'

/**
 * Brief prêt-à-coller pour lancer un agent sur la tâche : les données de la
 * tâche + le contrat CLI pour la démarrer, la terminer et la documenter.
 * C'est le pont humain (navigateur) → agent (session Claude Code).
 */
export function agentBrief(task: TaskNode): string {
  const meta = [
    `Statut : ${task.status}`,
    task.size && `Taille : ${task.size}`,
    task.zone && `Zone : ${task.zone}`,
    task.code && `Code : ${task.code}`,
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    `Tâche #${task.id} — ${task.title}`,
    `Fichier : ${task.file}`,
    meta,
    task.tags.length > 0 ? `Tags : ${task.tags.join(', ')}` : null,
    task.refs.length > 0 ? `Refs : ${task.refs.join(' · ')}` : null,
    task.links.length > 0 ? `Tâches liées : ${task.links.map((l) => `#${l}`).join(' ')}` : null,
    task.detail ? `\n${task.detail.trim()}` : null,
    '',
    'Gestion via le CLI du dashboard (depuis la racine du repo) :',
    `- détail JSON : node scripts/task.mjs show ${task.id} --json`,
    `- démarrer : node scripts/task.mjs start ${task.id}`,
    `- terminer + documenter : node scripts/task.mjs done ${task.id} --commit <sha> --verification "<comment l'artefact a été vérifié>"`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}

export function TaskRow({ task }: { task: TaskNode }) {
  const { openTask } = usePanel()
  const [open, setOpen] = useState(false)
  const isDone = task.status === 'done'
  const subDone = task.subtasks.filter((s) => s.status === 'done').length
  const hasSubs = task.subtasks.length > 0

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* Le padding vertical vit dans les éléments INTERACTIFS (pas le
          conteneur) : toute la hauteur de la ligne est cliquable. */}
      <div className="flex w-full flex-wrap items-center gap-2 px-4 text-sm hover:bg-neutral-50">
        {/* Chevron = toggle des sous-tâches uniquement (invisible sinon). */}
        {hasSubs ? (
          <Collapsible.Trigger
            className="flex shrink-0 items-center self-stretch rounded px-0.5 hover:bg-neutral-200"
            aria-label={open ? 'Replier les sous-tâches' : 'Déplier les sous-tâches'}
            onClick={(e) => e.stopPropagation()}
          >
            <Chevron />
          </Collapsible.Trigger>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden="true" />
        )}
        {/* Corps cliquable = ouvre le panneau détail. */}
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2.5 text-left"
        >
          <StatusGlyph status={task.status} />
          <span className="shrink-0 font-mono text-xs text-neutral-400">#{task.id}</span>
          <span className={`min-w-0 ${isDone ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
            {task.title}
          </span>
          {/* pas de shrink-0 : quand la ligne n'a plus de place, les chips passent
              à la ligne suivante plutôt que d'être coupées par l'overflow-hidden
              de la carte parente (bug réel constaté sur les tâches à 4-6 tags) */}
          <span className="ml-auto flex flex-wrap items-center justify-end gap-1">
            {hasSubs && (
              <span className="font-mono text-[11px] text-neutral-400">
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {task.code && <Chip label={task.code} mono />}
            {task.zone && <Chip label={task.zone} />}
            {task.size && <Chip label={task.size} mono />}
            {task.tags.map((t) => (
              <Chip key={t} label={t} />
            ))}
            <Chip label={task.source} mono />
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
