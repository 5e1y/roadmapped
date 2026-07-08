import { useState } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings } from '../state/uiPersist'
import { type TaskNode } from '../lib/tasks'
import { SectionAccordion } from './SectionAccordion'
import { TaskList, MiniZone, sortOpen, sortDone } from './TaskColumns'

import { useTagFilter, useTeamFilter } from '../state/filters'
import { ViewHeader } from './ViewHeader'
import { TeamsRadar } from './TeamsRadar'
import { TagGraph } from './TagGraph'
import { tagGraph } from '../lib/tagGraph'
import { TEAMS, type Team } from '../lib/tasks'

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

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
  const [tagFilter, setTagFilter] = useTagFilter()
  const [query, setQuery] = useState('')

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
  // Graphe des tags (#146) : co-occurrences sur les tickets OUVERTS, sous-
  // tâches comprises — comme le radar, il montre TOUT, la liste est filtrée.
  const openTags = tagGraph(tree.sections.filter((s) => s.status !== 'abandoned').flatMap((s) => s.tasks))
  const tagSelected = tagFilter.length === 1 ? tagFilter[0] : ''
  const tagSelect = (t: string) => setTagFilter(t ? [t] : [])

  const q = query.trim().toLowerCase()
  const stageOf = new Map<number, string>()
  const all: TaskNode[] = []
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    for (const t of s.tasks) { all.push(t); stageOf.set(t.id, s.key) }
  }
  const matches = (t: TaskNode) =>
    (teamFilter.length === 0 || teamFilter.includes(t.team)) &&
    (tagFilter.length === 0 || tagFilter.some((tag) => t.tags.includes(tag))) &&
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
          className={`${top !== null ? 'hidden 2xl:flex' : 'flex'} relative min-h-0 w-[420px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white py-2`}
        >
          {/* my-auto : centre verticalement quand ça tient, scrolle depuis le
              haut sinon (jamais de contenu clippé, contrairement à justify-center). */}
          <div className="my-auto flex w-full shrink-0 flex-col">
            <TeamsRadar counts={load} selected={radarSelected} onSelect={radarSelect} />
            {/* Graphe de liens des tags (#146) — les thèmes du travail ouvert,
                sous le radar (le « qui » au-dessus, le « quoi » en dessous). */}
            {(openTags.nodes.length > 0 || tagSelected !== '') && (
              <>
                <div className="mx-4 border-t border-neutral-200" />
                <div className="pt-2">
                  <TagGraph graph={openTags} selected={tagSelected} onSelect={tagSelect} />
                </div>
              </>
            )}
          </div>
        </div>
      {/* relative (#141) : le scroller est le containing block de TOUT absolu
          descendant — sans ça, un span position:absolute (sr-only Tailwind…)
          remonte jusqu'à <html>, échappe au clip d'overflow et rend la page
          entière scrollable dans le vide. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex flex-col gap-8">
      {(quicks.length > 0 || !q) && <MiniZone quicks={quicks} reload={reload} />}
      {/* Epics (#135) : lignes-groupe repliables DANS la liste — plus de vue
          alternative « par epic » (#133 rejeté), le groupe est le défaut. */}
      <TaskList open={open} done={done} tree={tree} filtered={Boolean(q || teamFilter.length || tagFilter.length)} />
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
