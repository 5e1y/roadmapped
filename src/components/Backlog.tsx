import { useLayoutEffect, useRef, useState } from 'react'
import { Search } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { type TaskNode } from '../lib/tasks'
import { TaskList, sortOpen, sortDone } from './TaskColumns'

import { useTagFilter, useTypeFilter } from '../state/filters'
import { ViewShell } from './ViewHeader'
import { TreeStateGuard } from './ui'

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
    <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-interactive ring-1 ring-inset ring-border bg-foreground py-0.5 pl-2 pr-1 text-xs text-texthard">
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={ariaLabel}
        className="flex size-4 shrink-0 items-center justify-center rounded-interactive text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
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
  const { tree } = useTree()
  const { openCreateTask } = usePanel()
  const [tagFilter, setTagFilter] = useTagFilter()
  const [typeFilter, setTypeFilter] = useTypeFilter()
  const [query, setQuery] = useState('')
  // #385 — retirer un chip (ou « Clear all ») démonte le bouton focalisé → focus
  // perdu sur <body> (design.md §3.4). On replace le focus sur le champ recherche,
  // toujours monté dans le header, quel que soit l'état des filtres.
  const searchRef = useRef<HTMLInputElement>(null)
  const refocusSearch = useRef(false)
  const removeFilter = (fn: () => void) => { refocusSearch.current = true; fn() }
  useLayoutEffect(() => {
    if (refocusSearch.current) { refocusSearch.current = false; searchRef.current?.focus() }
  })

  // « + tâche » : Feature par défaut (modifiable dans le panneau de création).
  const createIn = '02-feature'

  // Header TOUJOURS monté (design.md §4) : recherche + « + task » vivent dans le
  // ViewShell, y compris pendant chargement/erreur — le champ recherche (searchRef)
  // ne remonte donc jamais, garantissant le refocus post-retrait de chip (#385).
  const controls = (
    <>
      <div className="relative w-56">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-textsoft" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          aria-label="Search tasks"
          className="w-full rounded-interactive ring-1 ring-inset ring-border bg-foreground py-1 pl-7 pr-2 text-xs text-texthard transition-colors placeholder:text-textsoft"
        />
      </div>
      <button
        type="button"
        onClick={() => openCreateTask(createIn)}
        className="rounded-interactive bg-action px-2.5 py-1 text-xs text-foreground transition hover:brightness-95"
      >
        + task
      </button>
    </>
  )

  // États (chargement / serveur mort / validation) sous le header : la garde
  // PARTAGÉE `TreeStateGuard` (ui.tsx, #384) — `detail` = liste des fichiers
  // fautifs, le Backlog étant la vue de détail des erreurs.
  if (!tree) {
    return (
      <ViewShell controls={controls}>
        <TreeStateGuard detail>{null}</TreeStateGuard>
      </ViewShell>
    )
  }

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

  // Libellés de type pour les chips de filtre actif (#242 : le filtre type se pose
  // via le RADAR, s'affiche/se retire via les chips du subheader — plus de dropdown
  // redondant dans le header).
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const typeLabel = new Map(sections.map((s) => [s.key, s.title]))

  // Ordre = TEMPÉRATURE décroissante (jalons v2) : le backlog sert la file la plus
  // chaude d'abord, comme `next`. Les epics s'ancrent sur leur membre le plus chaud.
  // #250 : plus de zone « Mini » — les ex-quick sont des task ordinaires et
  // rejoignent la liste « To do », déjà triée par température.
  const open = sortOpen(all.filter((t) => t.status !== 'done' && matches(t)))
  const done = sortDone(all.filter((t) => t.status === 'done' && matches(t)))

  // Filtres actifs (#210) : type + tag + recherche. La barre de chips ne
  // s'affiche que s'il y en a ; « Clear all » remet tout à zéro d'un coup.
  const hasFilters = typeFilter.length > 0 || tagFilter.length > 0 || q !== ''
  const clearAll = () => { setTypeFilter([]); setTagFilter([]); setQuery('') }

  return (
    <ViewShell meta={`${plural(open.length, 'open')} · ${plural(done.length, 'done')}`} controls={controls}>
      {/* Garde partagée : même avec un arbre présent, des erreurs de VALIDATION
          reprennent la main (parité avec l'ancien early-return) — `detail` liste
          les fichiers fautifs, le Backlog étant la vue de détail. */}
      <TreeStateGuard detail>
      {/* Colonne liste = barre de filtres actifs (toujours visible) + scroller.
          Occupe toute la largeur (#186) : le flanc radar/graphe des tags a
          migré vers l'Overview (#375). */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Chips de filtres actifs (#210) : toujours visibles au-dessus du scroller. */}
        {hasFilters && (
          <div className="shrink-0 bg-foreground shadow-[inset_0_-1px_0_var(--color-border)]">
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 px-6 py-2">
              {typeFilter.map((k) => (
                <RemovableChip key={`type:${k}`} label={typeLabel.get(k) ?? k} ariaLabel={`Remove type filter: ${typeLabel.get(k) ?? k}`}
                  onRemove={() => removeFilter(() => setTypeFilter(typeFilter.filter((x) => x !== k)))} />
              ))}
              {tagFilter.map((t) => (
                <RemovableChip key={`tag:${t}`} label={`#${t}`} ariaLabel={`Remove tag filter: ${t}`}
                  onRemove={() => removeFilter(() => setTagFilter(tagFilter.filter((x) => x !== t)))} />
              ))}
              {q !== '' && (
                <RemovableChip label={`“${query.trim()}”`} ariaLabel="Clear search" onRemove={() => removeFilter(() => setQuery(''))} />
              )}
              <button
                type="button"
                onClick={() => removeFilter(clearAll)}
                className="ml-1 rounded-interactive px-2 py-0.5 text-xs text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
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
              {/* Epics (#135) : lignes-groupe repliables DANS la liste — plus de vue
                  alternative « par epic » (#133 rejeté), le groupe est le défaut. */}
              <TaskList open={open} done={done} tree={tree} filtered={hasFilters} />
            </div>
          </div>
        </div>
      </div>
      </TreeStateGuard>
    </ViewShell>
  )
}
