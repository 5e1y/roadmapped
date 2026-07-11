import { useState } from 'react'
import { TaskRow } from './TaskRow'
import { EpicRow, splitBacklogItems, type EpicListItem } from './EpicRow'
import { allEpics, epicProgress } from '../lib/roadmap'
import { type TaskNode, type TaskTree } from '../lib/tasks'

const PREVIEW = 12

/** Rend un item de liste mixte : ligne-epic repliable ou TaskRow à plat (#135). */
function ListItemRow({ item, tree }: { item: EpicListItem; tree: TaskTree }) {
  return item.type === 'epic' ? (
    <EpicRow
      slug={item.slug}
      title={item.title}
      tasks={item.tasks}
      progress={epicProgress(tree, item.slug)}
      persistKey="backlog:epics"
    />
  ) : (
    <TaskRow task={item.task} />
  )
}

/**
 * LA liste de travail (Backlog et vue Teams) — UNE colonne large (décision
 * Rémi) : les 12 prochaines à faire (ordre stage puis ancienneté, calculé par
 * l'appelant) + « voir plus », puis les terminées APRÈS (dernière bouclée en
 * premier). Les lignes portent la date de bouclage.
 *
 * Epics (#135) : les tâches portant un epic ne sont PLUS à plat — elles vivent
 * dans une ligne-groupe repliée par défaut (EpicRow), ancrée à la position de
 * sa première membre. Dé-dup (#140-B) : un epic ne vit que d'UN côté — côté
 * « À faire » tant qu'il n'est pas 100 % terminé (ses tâches done sont rendues
 * DANS le groupe), côté « Terminées » seulement quand tout est bouclé.
 */
export function TaskList({ open, done, tree, filtered }: {
  open: TaskNode[]
  done: TaskNode[]
  tree: TaskTree
  /** Vrai si des filtres sont actifs (adapte le texte des états vides). */
  filtered?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const epics = allEpics(tree)
  // Complétion GLOBALE (epicProgress, sous-tâches comprises) : c'est elle qui
  // décide du côté, pas le sous-ensemble filtré affiché.
  const isComplete = (slug: string) => {
    const p = epicProgress(tree, slug)
    return p.total > 0 && p.done === p.total
  }
  // Le seuil « voir plus » compte des LIGNES (un epic replié = une ligne).
  const { open: openItems, done: doneItems } = splitBacklogItems(open, done, epics, isComplete)
  const visible = showAll ? openItems : openItems.slice(0, PREVIEW)
  const hidden = openItems.length - visible.length
  const keyOf = (i: EpicListItem) => (i.type === 'epic' ? `epic:${i.slug}` : `task:${i.task.id}`)
  const empty = (label: string) => (
    <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-500">
      {label}{filtered ? ' with these filters' : ''}.
    </p>
  )
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>To do — hottest first</span>
          <span className="font-mono text-[11px]">{open.length}</span>
        </h2>
        {open.length === 0 ? empty('Nothing open') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {visible.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Show {hidden} more
              </button>
            )}
            {showAll && openItems.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>Done — most recently completed first</span>
          <span className="font-mono text-[11px]">{done.length}</span>
        </h2>
        {done.length === 0 ? empty('Nothing done yet') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {doneItems.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
          </div>
        )}
      </section>
    </div>
  )
}

/** Tri canonique des ouvertes : stage (préfixe NN du dossier) puis id. */
export function sortOpen(tasks: TaskNode[]): TaskNode[] {
  // Priorité = TEMPÉRATURE (jalons v2) : le backlog sert la file la plus chaude
  // d'abord, comme `next`. Tie-break id croissant (plus ancien). Remplace l'ancien
  // tri par préfixe de stage, qui n'a plus de sens (les colonnes sont des types).
  const temp = (t: TaskNode) => t.temperature?.value ?? 0
  return [...tasks].sort((a, b) => temp(b) - temp(a) || a.id - b.id)
}

/** Tri canonique des terminées : completedAt décroissant puis id décroissant. */
export function sortDone(tasks: TaskNode[]): TaskNode[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)
}
