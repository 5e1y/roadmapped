import { useState } from 'react'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { type TaskNode } from '../lib/tasks'
import { TaskList, MiniZone, sortOpen, sortDone } from './TaskColumns'

import { useTagFilter, useTypeFilter } from '../state/filters'
import { ViewHeader, FilterMenu } from './ViewHeader'
import { TagGraph } from './TagGraph'
import { tagGraph } from '../lib/tagGraph'

/** Accord singulier/pluriel élémentaire (anglais). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

/**
 * Chip de filtre actif supprimable (#210). Pilule neutre — sa seule présence
 * dans la barre « filtres actifs » suffit à signaler l'état ; le × retire CE
 * filtre. Pas de liseré accent (retour Rémi : trait sur un côté + coins
 * arrondis = moche). Vit en haut de la liste, TOUJOURS visible — y compris
 * quand le flanc radar/graph est masqué (panneau ouvert sur petit écran), où
 * c'était jusque-là un cul-de-sac.
 */
function RemovableChip({ label, onRemove, ariaLabel }: { label: string; onRemove: () => void; ariaLabel: string }) {
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-neutral-300 bg-white py-0.5 pl-2 pr-1 text-xs text-neutral-700">
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
  const [tagFilter, setTagFilter] = useTagFilter()
  const [typeFilter, setTypeFilter] = useTypeFilter()
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

  // Graphe des tags (#146/#150) : carte des THÈMES du projet entier — TOUS les
  // tickets (done inclus), sous-tâches comprises. Le clic filtre la liste.
  const themeTags = tagGraph(
    tree.sections.filter((s) => s.status !== 'abandoned').flatMap((s) => s.tasks),
  )
  const tagSelected = tagFilter.length === 1 ? tagFilter[0] : ''
  const tagSelect = (t: string) => setTagFilter(t ? [t] : [])

  const q = query.trim().toLowerCase()
  const typeOf = new Map<number, string>()
  const all: TaskNode[] = []
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    for (const t of s.tasks) { all.push(t); typeOf.set(t.id, s.key) }
  }
  const matches = (t: TaskNode) =>
    (typeFilter.length === 0 || typeFilter.includes(typeOf.get(t.id) ?? '')) &&
    (tagFilter.length === 0 || tagFilter.some((tag) => t.tags.includes(tag))) &&
    (q === '' || t.title.toLowerCase().includes(q) || `#${t.id}`.includes(q))

  // Filtre TYPE (#235, remplace l'ex-filtre team) : les 9 types canoniques,
  // multi-sélection, compteur = tickets ouverts du type.
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const typeOptions = sections.map((s) => ({
    value: s.key,
    label: s.title,
    count: s.tasks.filter((t) => t.status !== 'done').length,
  }))
  const typeLabel = new Map(sections.map((s) => [s.key, s.title]))

  // Ordre canonique (décision Rémi) : type puis ancienneté — partagé (TaskColumns).
  const openAll = all.filter((t) => t.status !== 'done' && matches(t))
  // Les quick vivent dans la zone Mini ; les task dans « To do ».
  const quicks = sortOpen(openAll.filter((t) => t.kind === 'quick'), (id) => typeOf.get(id) ?? '99')
  const open = sortOpen(openAll.filter((t) => t.kind !== 'quick'), (id) => typeOf.get(id) ?? '99')
  const done = sortDone(all.filter((t) => t.status === 'done' && matches(t)))

  // « + tâche » : Feature par défaut (modifiable dans le panneau de création).
  const createIn = '02-feature'

  // Filtres actifs (#210) : type + tag + recherche. La barre de chips ne
  // s'affiche que s'il y en a ; « Clear all » remet tout à zéro d'un coup.
  const hasFilters = typeFilter.length > 0 || tagFilter.length > 0 || q !== ''
  const clearAll = () => { setTypeFilter([]); setTagFilter([]); setQuery('') }

  return (
    <div className="flex h-full flex-col">
      {/* Header unifié (modèle Roadmap) : filtres en dropdowns, hauteur = panneau. */}
      <ViewHeader meta={`${plural(open.length, 'open')} · ${plural(done.length, 'done')}`}>
        {/* Filtre par TYPE (#235) — même dropdown canonique que l'ex-filtre team. */}
        <FilterMenu
          allLabel="All types"
          aria-label="Filter by type"
          options={typeOptions}
          selected={typeFilter}
          onChange={setTypeFilter}
          multiple
        />
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
        {/* Flanc : graphe de liens des tags (#146/#150) — carte des thèmes du
            projet. S'efface quand le panneau est ouvert et que la place manque
            (< 2xl). Masqué s'il n'y a rien à montrer. */}
        {(themeTags.nodes.length > 0 || tagSelected !== '') && (
          <div
            className={`${top !== null ? 'hidden 2xl:flex' : 'flex'} relative min-h-0 w-[420px] shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white py-2`}
          >
            <div className="flex w-full shrink-0 flex-col pt-2">
              <TagGraph graph={themeTags} selected={tagSelected} onSelect={tagSelect} />
            </div>
          </div>
        )}
      {/* Colonne liste = barre de filtres actifs (toujours visible) + scroller. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chips de filtres actifs (#210) : AU-DESSUS du scroller et HORS du flanc
            masqué → délestables même panneau ouvert sur petit écran. */}
        {hasFilters && (
          <div className="shrink-0 border-b border-neutral-200 bg-white">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 px-6 py-2">
              {typeFilter.map((k) => (
                <RemovableChip key={`type:${k}`} label={typeLabel.get(k) ?? k} ariaLabel={`Remove type filter: ${typeLabel.get(k) ?? k}`}
                  onRemove={() => setTypeFilter(typeFilter.filter((x) => x !== k))} />
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
              <TaskList open={open} done={done} tree={tree} filtered={Boolean(q || tagFilter.length)} />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
