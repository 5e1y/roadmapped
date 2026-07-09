import { useState } from 'react'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { type TaskNode } from '../lib/tasks'
import { TaskList, MiniZone, sortOpen, sortDone } from './TaskColumns'

import { useTagFilter, useTeamFilter } from '../state/filters'
import { ViewHeader } from './ViewHeader'
import { TeamsRadar } from './TeamsRadar'
import { TagGraph } from './TagGraph'
import { tagGraph } from '../lib/tagGraph'
import { TEAMS, type Team } from '../lib/tasks'

/** Accord singulier/pluriel élémentaire (anglais). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

/**
 * Chip de filtre actif supprimable (#210). Inset accent = langage « filtre
 * actif » commun au FilterMenu du header ; le × retire CE filtre. Vit dans la
 * barre en haut de la liste, TOUJOURS visible — y compris quand le flanc
 * radar/graph est masqué (panneau ouvert sur petit écran), où c'était jusque-là
 * un cul-de-sac : plus aucun moyen de délester ses filtres.
 */
function RemovableChip({ label, onRemove, ariaLabel }: { label: string; onRemove: () => void; ariaLabel: string }) {
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-neutral-300 bg-white py-0.5 pl-2.5 pr-1 text-xs text-neutral-700 shadow-[inset_2px_0_0_var(--color-accent)]">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel}
        className="flex size-4 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
      >
        ×
      </button>
    </span>
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
  const [teamFilter, setTeamFilter] = useTeamFilter()
  const [tagFilter, setTagFilter] = useTagFilter()
  const [query, setQuery] = useState('')

  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Loading…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Server unreachable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} validation error{errors.length > 1 ? 's' : ''} in docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Fix the offending files — nothing renders until the source is healthy.
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
  // Graphe des tags (#146/#150) : carte des THÈMES du projet entier — TOUS les
  // tickets (done inclus), sous-tâches comprises. Distinct du radar teams
  // (qui, lui, montre la charge ouverte). Le clic filtre la liste.
  const themeTags = tagGraph(
    tree.sections.filter((s) => s.status !== 'abandoned').flatMap((s) => s.tasks),
  )
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
  // Les quick vivent dans la zone Mini ; les task dans « To do ».
  const quicks = sortOpen(openAll.filter((t) => t.kind === 'quick'), (id) => stageOf.get(id) ?? '99')
  const open = sortOpen(openAll.filter((t) => t.kind !== 'quick'), (id) => stageOf.get(id) ?? '99')
  const done = sortDone(all.filter((t) => t.status === 'done' && matches(t)))

  // « + tâche » : Build par défaut (modifiable dans le panneau de création).
  const createIn = '04-build'

  // Filtres actifs (#210) : team + tag + recherche. La barre de chips ne s'affiche
  // que s'il y en a ; « Clear all » remet les trois à zéro d'un coup.
  const hasFilters = teamFilter.length > 0 || tagFilter.length > 0 || q !== ''
  const clearAll = () => { setTeamFilter([]); setTagFilter([]); setQuery('') }

  return (
    <div className="flex h-full flex-col">
      {/* Header unifié (modèle Roadmap) : filtres en dropdowns, hauteur = panneau. */}
      <ViewHeader meta={`${plural(open.length, 'open')} · ${plural(done.length, 'done')}`}>
        <div className="relative w-56">
          <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search tasks"
            className="w-full rounded-md border border-neutral-300 bg-white py-1 pl-7 pr-2 text-xs text-neutral-900 placeholder:text-neutral-500 focus:border-neutral-900 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => openCreateTask(createIn)}
          className="rounded-md border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700"
        >
          + task
        </button>
      </ViewHeader>

      <div className="flex min-h-0 flex-1">
        {/* Flanc radar (fusion vue Teams) : charge par team, sélection = filtre.
            S'efface quand le panneau est ouvert et que la place manque (< 2xl).
            Désélectionner = recliquer la team active (souris ET clavier, #118). */}
        <div
          className={`${top !== null ? 'hidden 2xl:flex' : 'flex'} relative min-h-0 w-[420px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white py-2`}
        >
          {/* Ancré EN HAUT (#150) : radar puis visu nodal, dans l'ordre naturel
              du flux ; le flanc scrolle en interne si ça déborde. */}
          <div className="flex w-full shrink-0 flex-col">
            <TeamsRadar counts={load} selected={radarSelected} onSelect={radarSelect} />
            {/* Graphe de liens des tags (#146/#150) — carte des thèmes du projet,
                sous le radar (le « qui » au-dessus, le « quoi » en dessous).
                Séparateur FULL-WIDTH bord à bord (#150). */}
            {(themeTags.nodes.length > 0 || tagSelected !== '') && (
              <>
                <div className="border-t border-neutral-200" />
                <div className="pt-2">
                  <TagGraph graph={themeTags} selected={tagSelected} onSelect={tagSelect} />
                </div>
              </>
            )}
          </div>
        </div>
      {/* Colonne liste = barre de filtres actifs (toujours visible) + scroller. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chips de filtres actifs (#210) : AU-DESSUS du scroller et HORS du flanc
            masqué → délestables même panneau ouvert sur petit écran. */}
        {hasFilters && (
          <div className="shrink-0 border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 px-6 py-2">
              {teamFilter.map((t) => (
                <RemovableChip key={`team:${t}`} label={t} ariaLabel={`Remove team filter: ${t}`}
                  onRemove={() => setTeamFilter(teamFilter.filter((x) => x !== t))} />
              ))}
              {tagFilter.map((t) => (
                <RemovableChip key={`tag:${t}`} label={`#${t}`} ariaLabel={`Remove tag filter: ${t}`}
                  onRemove={() => setTagFilter(tagFilter.filter((x) => x !== t))} />
              ))}
              {q !== '' && (
                <RemovableChip label={`“${query.trim()}”`} ariaLabel="Clear search" onRemove={() => setQuery('')} />
              )}
              <button
                type="button"
                onClick={clearAll}
                className="ml-1 rounded-md px-2 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
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
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
