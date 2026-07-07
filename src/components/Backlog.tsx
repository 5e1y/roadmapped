import { useState } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings } from '../state/uiPersist'
import { STAGES, type TaskNode } from '../lib/tasks'
import { SectionAccordion } from './SectionAccordion'
import { TaskRow } from './TaskRow'
import { Select, ghostCls, type SelectItem } from './ui'
import { useTeamFilter, useStageFilter } from './Sidebar'

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

const STAGE_ITEMS: SelectItem[] = [
  { value: '', label: 'Tous les stages' },
  ...STAGES.map((s) => ({ value: s.slug, label: s.title })),
]

/**
 * Backlog v2 (décision Rémi) : liste PLATE — les stages vivent dans la
 * Roadmap, le Backlog est la vue « travail ». Deux colonnes :
 *  - gauche : tickets ouverts (todo + in_progress), du plus ancien créé au
 *    plus récent (l'id croissant est le proxy exact de createdAt) ;
 *  - droite : tickets terminés, du plus récemment bouclé au plus ancien.
 * Header : recherche texte + filtre stage + « + tâche » (le filtre team vit
 * dans la sidebar et s'applique aussi).
 */
export function Backlog() {
  const { tree, errors, loading, loadError } = useTree()
  const { openCreateTask } = usePanel()
  const [openArchive, setOpenArchive] = usePersistentStrings('backlog:archive')
  const [teamFilter] = useTeamFilter()
  const [stageFilter, setStageFilter] = useStageFilter()
  const [query, setQuery] = useState('')

  if (loading && !tree) {
    return <div className="mx-auto max-w-5xl px-6 py-14 text-sm text-neutral-500">Chargement…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} erreur{errors.length > 1 ? 's' : ''} de validation dans docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Corriger les fichiers fautifs — rien n'est rendu tant que la source n'est pas saine.
        </p>
        <ul className="mt-6 flex flex-col divide-y divide-neutral-100 border border-neutral-200 bg-white">
          {errors.map((e, i) => (
            <li key={i} className="px-4 py-2.5 font-mono text-xs text-neutral-700">{e}</li>
          ))}
        </ul>
      </div>
    )
  }
  if (!tree) return null

  const q = query.trim().toLowerCase()
  const stageOf = new Map<number, string>()
  const all: TaskNode[] = []
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    if (stageFilter && s.key !== stageFilter) continue
    for (const t of s.tasks) { all.push(t); stageOf.set(t.id, s.key) }
  }
  const matches = (t: TaskNode) =>
    (teamFilter.length === 0 || teamFilter.includes(t.team)) &&
    (q === '' || t.title.toLowerCase().includes(q) || `#${t.id}`.includes(q))

  const open = all.filter((t) => t.status !== 'done' && matches(t)).sort((a, b) => a.id - b.id)
  const done = all.filter((t) => t.status === 'done' && matches(t)).sort((a, b) =>
    (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)

  // « + tâche » : le stage de destination = le filtre courant, sinon Build
  // (le stage de travail par défaut — modifiable dans le panneau de création).
  const createIn = stageFilter || '04-build'

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Backlog</h1>
          <p className="font-mono text-xs text-neutral-500">
            {plural(open.length, 'ouverte')} · {plural(done.length, 'terminée')}
          </p>
        </div>
        {/* Header de filtres : recherche + stage + création. */}
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (titre, #id)…"
              aria-label="Rechercher une tâche"
              className={`${ghostCls} border-neutral-200 pl-7 text-sm`}
            />
          </div>
          <div className="w-44 shrink-0">
            {/* key : Select non contrôlé — remonté quand la sidebar change le filtre. */}
            <Select
              key={stageFilter}
              aria-label="Filtrer par stage"
              defaultValue={stageFilter}
              items={STAGE_ITEMS}
              onValueChange={setStageFilter}
            />
          </div>
          <button
            type="button"
            onClick={() => openCreateTask(createIn)}
            className="shrink-0 rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
          >
            + tâche
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4">
        <section>
          <h2 className="mb-2 px-1 text-xs font-medium text-neutral-400">
            Ouvertes — de la plus ancienne à la plus récente
          </h2>
          {open.length === 0 ? (
            <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-400">
              Rien d'ouvert{q || stageFilter || teamFilter.length ? ' avec ces filtres' : ''}.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
              {open.map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </section>
        <section>
          <h2 className="mb-2 px-1 text-xs font-medium text-neutral-400">
            Terminées — dernière bouclée en premier
          </h2>
          {done.length === 0 ? (
            <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-400">
              Rien de terminé{q || stageFilter || teamFilter.length ? ' avec ces filtres' : ''}.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
              {done.map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          )}
        </section>
      </div>

      {tree.archive.length > 0 && (
        <section className="mt-14">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-500">Archive</h2>
          <Accordion.Root multiple value={openArchive} onValueChange={(v) => setOpenArchive(v as string[])} className="mt-3 flex flex-col gap-3">
            {tree.archive.map((section) => (
              <SectionAccordion key={section.key} section={section} dimmed />
            ))}
          </Accordion.Root>
        </section>
      )}
    </div>
  )
}
