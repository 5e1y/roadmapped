import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron, EpicGlyph } from './glyphs'
import { EpicProgressBar, epicStatusOf } from './EpicRow'
import { usePersistentFlag } from '../state/uiPersist'
import { allEpics, epicProgress } from '../lib/roadmap'
import type { TaskNode, TaskTree } from '../lib/tasks'

/**
 * Bande d'EPICS de la Roadmap (#235, reco spec jalons-par-type §6.3) : les
 * types sont VERTICAUX (9 colonnes), les epics sont HORIZONTAUX — le
 * transversal est affiché transversal, en tête, au lieu d'être forcé dans une
 * colonne d'ancrage (mécanisme retiré : plus d'ancrage, donc plus d'ancrage
 * faux). Chaque carte = titre + pastilles par type (« 3 bug · 2 design »,
 * membres non terminés) + complétion GLOBALE. Cliquer une carte filtre les
 * 9 colonnes sur cet epic (re-clic = tout).
 */

export interface EpicBandItem {
  slug: string
  title: string
  status: TaskNode['status']
  progress: { done: number; total: number }
  /** Répartition par type des membres NON terminés, ordre canonique NN. */
  typeCounts: Array<{ type: string; count: number }>
}

/** Items de la bande, dans l'ordre d'allEpics (déclarés d'abord, puis découverts). */
export function epicBandItems(tree: TaskTree): EpicBandItem[] {
  const members = new Map<string, { types: Map<string, number>; tasks: TaskNode[] }>()
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    const type = s.key.replace(/^\d+-/, '')
    for (const t of s.tasks) {
      if (t.epic === null) continue
      let m = members.get(t.epic)
      if (!m) {
        m = { types: new Map(), tasks: [] }
        members.set(t.epic, m)
      }
      m.tasks.push(t)
      if (t.status !== 'done') m.types.set(type, (m.types.get(type) ?? 0) + 1)
    }
  }
  return allEpics(tree)
    .filter((e) => members.has(e.slug))
    .map((e) => {
      const m = members.get(e.slug)!
      const progress = epicProgress(tree, e.slug)
      return {
        slug: e.slug,
        title: e.title,
        status: epicStatusOf(progress, m.tasks),
        progress,
        typeCounts: [...m.types.entries()].map(([type, count]) => ({ type, count })),
      }
    })
}

/**
 * Découpe de la bande d'epics servie aux DEUX vues Roadmap (Colonnes + Graphe,
 * #343) : les non-terminés en cartes ; les 100 % done derrière le repli
 * « + N done » et SEULEMENT toggle done ON ; l'epic sélectionné reste en carte
 * même s'il est done (jamais escamoté sous son propre filtre) ; un filtre
 * pointant un epic disparu (rename/reload) est ignoré. Source unique pour que
 * les deux vues filtrent à l'identique et partagent l'état de sélection.
 */
export function epicBandView(tree: TaskTree, showDone: boolean, epicFilter: string | null): {
  items: EpicBandItem[]
  doneItems: EpicBandItem[]
  selected: string | null
} {
  const band = epicBandItems(tree)
  const items = band.filter((i) => i.status !== 'done' || i.slug === epicFilter)
  const doneItems = showDone ? band.filter((i) => i.status === 'done' && i.slug !== epicFilter) : []
  const selected = epicFilter !== null && band.some((i) => i.slug === epicFilter) ? epicFilter : null
  return { items, doneItems, selected }
}

/** Carte d'epic compacte (#245) : deux lignes serrées, largeur bornée. */
function EpicCard({ item, active, onSelect }: {
  item: EpicBandItem
  active: boolean
  onSelect: (slug: string | null) => void
}) {
  const isDone = item.status === 'done'
  const pills = item.typeCounts.map((c) => `${c.count} ${c.type}`).join(' · ')
  return (
    <button
      type="button"
      onClick={() => onSelect(active ? null : item.slug)}
      aria-pressed={active}
      title={`${item.title} — ${item.progress.done}/${item.progress.total} tasks done. ${active ? 'Click to show every epic again.' : 'Click to filter the columns on this epic.'}`}
      className={`rm-list-item flex min-w-0 max-w-64 flex-col gap-xs px-m py-s text-left transition-colors ${
        active ? 'bg-active font-medium' : 'hover:bg-rollover'
      }`}
    >
      <span className="flex items-center gap-s">
        <EpicGlyph status={item.status} />
        <span className={`min-w-0 truncate text-sm font-medium ${isDone ? 'text-textsoft line-through' : 'text-texthard'}`}>
          {item.title}
        </span>
      </span>
      <span className="flex w-full items-center gap-s">
        <span className="min-w-0 truncate text-[11px] text-textsoft">
          {pills || 'all done'}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-s">
          <EpicProgressBar done={item.progress.done} total={item.progress.total} />
          <span className="font-mono text-[11px] text-textsoft">
            {item.progress.done}/{item.progress.total}
          </span>
        </span>
      </span>
    </button>
  )
}

/**
 * La rangée de cartes. Sélection = langage universel du DS (fond accent-tint +
 * filet gauche) ; les epics terminés arrivent barrés/grisés (même registre
 * qu'une tâche done). Rien à montrer → rien (pas de bande vide).
 *
 * Lisibilité gros volumes (#243/#245) : la bande est REPLIABLE (trigger
 * « Epics », préférence persistée, ouverte par défaut), sa hauteur est BORNÉE
 * (scroll interne) — elle ne mange plus l'espace des colonnes — et les epics
 * 100 % terminés (`doneItems`, servis quand le toggle done global est ON)
 * vivent derrière un repli « + N done » (session), pas en cartes étalées.
 */
export function EpicBand({ items, doneItems = [], selected, onSelect }: {
  items: EpicBandItem[]
  /** Epics terminés, repliés derrière « + N done » — [] les masque entièrement. */
  doneItems?: EpicBandItem[]
  selected: string | null
  onSelect: (slug: string | null) => void
}) {
  // Persisté en « collapsed » : l'absence de clé = bande OUVERTE par défaut.
  const [collapsed, setCollapsed] = usePersistentFlag('roadmap:epicBandCollapsed', 1)
  // Dépli des done : état de session, comme le filtre epic (lecture, pas préférence).
  const [showDoneEpics, setShowDoneEpics] = useState(false)
  if (items.length === 0 && doneItems.length === 0) return null
  const selectedItem = [...items, ...doneItems].find((i) => i.slug === selected) ?? null
  return (
    <Collapsible.Root open={!collapsed} onOpenChange={(o) => setCollapsed(!o)}>
      <div className="shrink-0 shadow-[inset_0_-1px_0_var(--color-border)] px-xl py-s">
        <div className="flex items-center gap-s">
          <Collapsible.Trigger
            title="Epics — click a card to filter the board"
            className="flex items-center gap-s rounded-interactive px-xs py-xs text-xs font-medium text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
          >
            <Chevron />
            Epics
            <span aria-hidden className="font-mono text-[11px]">
              {items.length}{doneItems.length > 0 ? ` · ${doneItems.length} done` : ''}
            </span>
          </Collapsible.Trigger>
          {/* Bande repliée + filtre actif : le filtre reste visible ET annulable. */}
          {collapsed && selectedItem && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              title="Clear the epic filter"
              className="flex min-w-0 items-center gap-xs rounded-interactive bg-active px-s py-xs text-[11px] text-texthard transition-colors hover:bg-rollover"
            >
              <span className="min-w-0 truncate">{selectedItem.title}</span>
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
        <Collapsible.Panel>
          {/* Hauteur bornée + scroll interne (#245) : ~2 rangées de cartes visibles. */}
          <div className="max-h-32 overflow-y-auto pb-xs pt-s">
            <div className="rm-list-row">
              {items.map((item) => (
                <EpicCard key={item.slug} item={item} active={selected === item.slug} onSelect={onSelect} />
              ))}
              {doneItems.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showDoneEpics}
                  onClick={() => setShowDoneEpics(!showDoneEpics)}
                  title={showDoneEpics ? 'Fold the completed epics' : 'Unfold the completed epics'}
                  className="rm-list-item flex items-center px-m text-xs text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
                >
                  {showDoneEpics ? '− done' : `+ ${doneItems.length} done`}
                </button>
              )}
              {showDoneEpics && doneItems.map((item) => (
                <EpicCard key={item.slug} item={item} active={selected === item.slug} onSelect={onSelect} />
              ))}
            </div>
          </div>
        </Collapsible.Panel>
      </div>
    </Collapsible.Root>
  )
}
