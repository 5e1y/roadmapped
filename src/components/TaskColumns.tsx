import { TaskRow } from './TaskRow'
import type { TaskNode } from '../lib/tasks'

/**
 * Les deux colonnes de travail (partagées Backlog ⇄ vue Teams) :
 * ouvertes (ordre stage puis ancienneté, calculé par l'appelant) et
 * terminées (dernière bouclée en premier).
 */
export function TaskColumns({ open, done, filtered }: {
  open: TaskNode[]
  done: TaskNode[]
  /** Vrai si des filtres sont actifs (adapte le texte des états vides). */
  filtered?: boolean
}) {
  const empty = (label: string) => (
    <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-400">
      {label}{filtered ? ' avec ces filtres' : ''}.
    </p>
  )
  return (
    // Container query : deux colonnes seulement quand le CONTENEUR est assez
    // large (vue Teams avec radar + panneau ouvert → une colonne lisible).
    <div className="@container">
    <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-2 @3xl:gap-4">
      <section>
        <h2 className="mb-2 px-1 text-xs font-medium text-neutral-400">
          Ouvertes — par stage puis ancienneté
        </h2>
        {open.length === 0 ? empty("Rien d'ouvert") : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {open.map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 px-1 text-xs font-medium text-neutral-400">
          Terminées — dernière bouclée en premier
        </h2>
        {done.length === 0 ? empty('Rien de terminé') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {done.map((t) => <TaskRow key={t.id} task={t} />)}
          </div>
        )}
      </section>
    </div>
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
