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
      className={`flex w-48 flex-col gap-0.5 border px-2.5 py-1.5 text-left ${
        active
          ? 'border-neutral-200 bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]'
          : 'border-neutral-200 bg-white hover:border-neutral-400'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <EpicGlyph status={item.status} />
        <span className={`min-w-0 truncate text-[13px] font-medium ${isDone ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
          {item.title}
        </span>
      </span>
      <span className="flex w-full items-center gap-1.5">
        <span className="min-w-0 truncate text-[11px] text-neutral-500">
          {pills || 'all done'}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <EpicProgressBar done={item.progress.done} total={item.progress.total} />
          <span className="font-mono text-[11px] text-neutral-500">
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
      <div className="shrink-0 border-b border-neutral-200 px-6 py-1.5">
        <div className="flex items-center gap-2">
          <Collapsible.Trigger
            title="Epics — click a card to filter the board"
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
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
              className="flex min-w-0 items-center gap-1 bg-accent-tint px-2 py-0.5 text-[11px] text-neutral-700 shadow-[inset_2px_0_0_var(--color-accent)] hover:text-neutral-900"
            >
              <span className="min-w-0 truncate">{selectedItem.title}</span>
              <span aria-hidden>×</span>
            </button>
          )}
        </div>
        <Collapsible.Panel>
          {/* Hauteur bornée + scroll interne (#245) : ~2 rangées de cartes visibles. */}
          <div className="max-h-32 overflow-y-auto pb-1 pt-1.5">
            <div className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <EpicCard key={item.slug} item={item} active={selected === item.slug} onSelect={onSelect} />
              ))}
              {doneItems.length > 0 && (
                <button
                  type="button"
                  aria-expanded={showDoneEpics}
                  onClick={() => setShowDoneEpics(!showDoneEpics)}
                  title={showDoneEpics ? 'Fold the completed epics' : 'Unfold the completed epics'}
                  className="border border-neutral-200 bg-white px-2.5 text-xs text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
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
