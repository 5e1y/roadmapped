import { useState } from 'react'
import { TaskRow } from './TaskRow'
import type { TaskNode } from '../lib/tasks'

const PREVIEW = 12

/**
 * LA liste de travail (Backlog et vue Teams) — UNE colonne large (décision
 * Rémi) : les 12 prochaines à faire (ordre stage puis ancienneté, calculé par
 * l'appelant) + « voir plus », puis les terminées APRÈS (dernière bouclée en
 * premier). Les lignes portent la date de bouclage.
 */
export function TaskList({ open, done, filtered }: {
  open: TaskNode[]
  done: TaskNode[]
  /** Vrai si des filtres sont actifs (adapte le texte des états vides). */
  filtered?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? open : open.slice(0, PREVIEW)
  const hidden = open.length - visible.length
  const empty = (label: string) => (
    <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-400">
      {label}{filtered ? ' avec ces filtres' : ''}.
    </p>
  )
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-400">
          <span>À faire — par stage puis ancienneté</span>
          <span className="font-mono text-[11px]">{open.length}</span>
        </h2>
        {open.length === 0 ? empty("Rien d'ouvert") : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {visible.map((t) => <TaskRow key={t.id} task={t} />)}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
              >
                Voir les {hidden} autres
              </button>
            )}
            {showAll && open.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Réduire
              </button>
            )}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-400">
          <span>Terminées — dernière bouclée en premier</span>
          <span className="font-mono text-[11px]">{done.length}</span>
        </h2>
        {done.length === 0 ? empty('Rien de terminé') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {done.map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </section>
    </div>
  )
}

/** Tri canonique des ouvertes : stage (préfixe NN du dossier) puis id. */
export function sortOpen(tasks: TaskNode[], stageOf: (id: number) => string): TaskNode[] {
  const prefix = (id: number) => parseInt(stageOf(id), 10) || 99
  return [...tasks].sort((a, b) => prefix(a.id) - prefix(b.id) || a.id - b.id)
}

/** Tri canonique des terminées : completedAt décroissant puis id décroissant. */
export function sortDone(tasks: TaskNode[]): TaskNode[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)
}
