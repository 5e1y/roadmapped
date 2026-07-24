import { Cross } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { type TaskNode } from '../lib/tasks'
import { TaskList, sortOpen, sortDone } from './TaskColumns'

import { useTagFilter, useTypeFilter } from '../state/filters'
import { useSearch } from '../state/search'
import { ViewShell } from './ViewHeader'
import { TreeStateGuard, Button } from './ui'

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
    <span className="inline-flex max-w-[16rem] items-center gap-xs rounded-interactive ring-1 ring-inset ring-border bg-foreground py-xs pl-s pr-xs text-xs text-texthard">
      <span className="min-w-0 truncate">{label}</span>
      <Button variant="ghost" icon={Cross} aria-label={ariaLabel} onClick={onRemove} />
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
  const [tagFilter, setTagFilter] = useTagFilter()
  const [typeFilter, setTypeFilter] = useTypeFilter()
  // Recherche GLOBALE (#395) : la barre vit dans le header commun (search.tsx) —
  // le Backlog consomme la requête pour filtrer. Le « + task » aussi est global.
  const { query, setQuery } = useSearch()
  // #385 — retirer un chip démonte le bouton focalisé → focus perdu sur <body>.
  // On replace le focus sur la barre de recherche GLOBALE (toujours montée dans
  // le header), retrouvée par son aria-label.
  const removeFilter = (fn: () => void) => {
    fn()
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('input[aria-label="Search tasks"]')?.focus()
    })
  }

  // États (chargement / serveur mort / validation) sous le header : la garde
  // PARTAGÉE `TreeStateGuard` (ui.tsx, #384) — `detail` = liste des fichiers
  // fautifs, le Backlog étant la vue de détail des erreurs.
  if (!tree) {
    return (
      <ViewShell>
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
    <ViewShell>
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
            <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-s px-xl py-s">
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
                className="ml-xs rounded-interactive px-s py-xs text-xs text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
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
          <div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
            <div className="flex flex-col gap-[calc(var(--spacing-xl)+var(--spacing-s))]">
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
