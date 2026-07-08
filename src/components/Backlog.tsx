import { useState } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings, usePersistentFlag } from '../state/uiPersist'
import { type TaskNode, type TaskTree } from '../lib/tasks'
import { allEpics, epicProgress } from '../lib/roadmap'
import { SectionAccordion } from './SectionAccordion'
import { TaskRow } from './TaskRow'
import { TaskList, MiniZone, sortOpen, sortDone } from './TaskColumns'

import { useTeamFilter } from '../state/filters'
import { ViewHeader } from './ViewHeader'
import { TeamsRadar } from './TeamsRadar'
import { TEAMS, type Team } from '../lib/tasks'

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

/**
 * Vue alternative du Backlog (#133) : regroupement par EPIC — un bloc par epic
 * (déclarés d'abord, puis auto-découverts), tâches ouvertes (déjà triées stage
 * puis ancienneté) suivies des terminées ; les tâches sans epic tombent dans un
 * bloc « Sans epic » en queue. Progression par epic en tête de bloc (epicProgress).
 */
function EpicGroupedList({ tree, open, done, filtered }: {
  tree: TaskTree
  open: TaskNode[]
  done: TaskNode[]
  filtered?: boolean
}) {
  const epics = allEpics(tree)
  const titleOf = new Map(epics.map((e) => [e.slug, e.title]))
  const keys: (string | null)[] = [...epics.map((e) => e.slug), null]
  const groups = keys
    .map((slug) => ({
      slug,
      tasks: [...open.filter((t) => t.epic === slug), ...done.filter((t) => t.epic === slug)],
    }))
    .filter((g) => g.tasks.length > 0)

  if (groups.length === 0) {
    return (
      <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-500">
        Rien à afficher{filtered ? ' avec ces filtres' : ''}.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => {
        // Progression par epic = tree entier (epicProgress, source unique) ; le
        // bloc « Sans epic » compte ses propres lignes (pas de slug à requêter).
        const p = g.slug === null
          ? { done: g.tasks.filter((t) => t.status === 'done').length, total: g.tasks.length }
          : epicProgress(tree, g.slug)
        return (
          <section key={g.slug ?? '__none'}>
            <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
              <span>{g.slug === null ? 'Sans epic' : (titleOf.get(g.slug) ?? g.slug)}</span>
              <span className="font-mono text-[11px]">{p.done}/{p.total}</span>
            </h2>
            <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
              {g.tasks.map((t) => <TaskRow key={t.id} task={t} />)}
            </div>
          </section>
        )
      })}
    </div>
  )
}

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
  const { tree, errors, loading, loadError, reload } = useTree()
  const { openCreateTask, top } = usePanel()
  const [openArchive, setOpenArchive] = usePersistentStrings('backlog:archive')
  const [teamFilter, setTeamFilter] = useTeamFilter()
  const [query, setQuery] = useState('')
  // Regroupement par epic (#133) : vue ALTERNATIVE persistée — défaut = par stage
  // (comportement historique), l'epic est un axe qu'on active explicitement.
  const [groupByEpic, setGroupByEpic] = usePersistentFlag('backlog:groupByEpic', 1)

  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Chargement…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
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

  // Charge du radar : tickets ouverts par team, sous-tâches comprises,
  // indépendante des filtres (le radar montre TOUT, la liste est filtrée).
  const load = new Map<Team, number>(TEAMS.map((t) => [t, 0]))
  const countLoad = (t: TaskNode) => {
    if (t.status !== 'done') load.set(t.team, (load.get(t.team) ?? 0) + 1)
    t.subtasks.forEach(countLoad)
  }
  for (const s of tree.sections) if (s.status !== 'abandoned') s.tasks.forEach(countLoad)
  // Sélection du radar = LE filtre team (solo) ; clic vide = tout.
  const radarSelected: Team | '' = teamFilter.length === 1 ? (teamFilter[0] as Team) : ''
  const radarSelect = (t: Team | '') => setTeamFilter(t ? [t] : [])

  const q = query.trim().toLowerCase()
  const stageOf = new Map<number, string>()
  const all: TaskNode[] = []
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    for (const t of s.tasks) { all.push(t); stageOf.set(t.id, s.key) }
  }
  const matches = (t: TaskNode) =>
    (teamFilter.length === 0 || teamFilter.includes(t.team)) &&
    (q === '' || t.title.toLowerCase().includes(q) || `#${t.id}`.includes(q))

  // Ordre canonique (décision Rémi) : stage puis ancienneté — partagé (TaskColumns).
  const openAll = all.filter((t) => t.status !== 'done' && matches(t))
  // Les quick vivent dans la zone Mini ; les task dans « À faire ».
  const quicks = sortOpen(openAll.filter((t) => t.kind === 'quick'), (id) => stageOf.get(id) ?? '99')
  const open = sortOpen(openAll.filter((t) => t.kind !== 'quick'), (id) => stageOf.get(id) ?? '99')
  const done = sortDone(all.filter((t) => t.status === 'done' && matches(t)))

  // « + tâche » : Build par défaut (modifiable dans le panneau de création).
  const createIn = '04-build'

  return (
    <div className="flex h-full flex-col">
      {/* Header unifié (modèle Roadmap) : filtres en dropdowns, hauteur = panneau. */}
      <ViewHeader meta={`${plural(open.length, 'ouverte')} · ${plural(done.length, 'terminée')}`}>
        <div className="relative w-56">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une tâche"
            className="w-full rounded-md border border-neutral-300 bg-white py-1 pl-7 pr-2 text-xs text-neutral-900 placeholder:text-neutral-500 focus:border-neutral-900 focus:outline-none"
          />
        </div>
        {/* Toggle « par epic » (#133) — même registre que le toggle « terminées »
            de la Roadmap : actif = fond appuyé, état persisté. */}
        <button
          type="button"
          onClick={() => setGroupByEpic(!groupByEpic)}
          aria-pressed={groupByEpic}
          title={groupByEpic ? 'Revenir au tri par stage' : 'Grouper les tâches par epic'}
          className={`rounded-md border border-neutral-300 px-2.5 py-1 text-xs transition-colors ${
            groupByEpic ? 'bg-neutral-900 text-white hover:bg-neutral-700' : 'bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          par epic
        </button>
        <button
          type="button"
          onClick={() => openCreateTask(createIn)}
          className="rounded-md border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700"
        >
          + tâche
        </button>
      </ViewHeader>

      <div className="flex min-h-0 flex-1">
        {/* Flanc radar (fusion vue Teams) : charge par team, sélection = filtre.
            S'efface quand le panneau est ouvert et que la place manque (< 2xl).
            Désélectionner = recliquer la team active (souris ET clavier, #118). */}
        <div
          className={`${top !== null ? 'hidden 2xl:flex' : 'flex'} w-[420px] shrink-0 items-center border-r border-neutral-200 bg-white py-2`}
        >
          <TeamsRadar counts={load} selected={radarSelected} onSelect={radarSelect} />
        </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-8">
      {(quicks.length > 0 || !q) && <MiniZone quicks={quicks} reload={reload} />}
      {groupByEpic
        ? <EpicGroupedList tree={tree} open={open} done={done} filtered={Boolean(q || teamFilter.length)} />
        : <TaskList open={open} done={done} filtered={Boolean(q || teamFilter.length)} />}
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
      </div>
      </div>
    </div>
  )
}
