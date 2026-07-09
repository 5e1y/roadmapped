import { EpicGlyph } from './glyphs'
import { EpicProgressBar, epicStatusOf } from './EpicRow'
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
 * La rangée de cartes. Sélection = langage universel du DS (fond accent-tint +
 * filet gauche) ; les epics terminés arrivent barrés/grisés (même registre
 * qu'une tâche done). Rien à montrer → rien (pas de bande vide).
 */
export function EpicBand({ items, selected, onSelect }: {
  items: EpicBandItem[]
  selected: string | null
  onSelect: (slug: string | null) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="shrink-0 border-b border-neutral-200 px-6 pb-3 pt-4">
      <div className="mb-1.5 text-xs font-medium text-neutral-500">Epics — click to filter the board</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selected === item.slug
          const isDone = item.status === 'done'
          const pills = item.typeCounts.map((c) => `${c.count} ${c.type}`).join(' · ')
          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => onSelect(active ? null : item.slug)}
              aria-pressed={active}
              title={`${item.title} — ${item.progress.done}/${item.progress.total} tasks done. ${active ? 'Click to show every epic again.' : 'Click to filter the columns on this epic.'}`}
              className={`flex w-56 flex-col gap-1 border px-3 py-2 text-left ${
                active
                  ? 'border-neutral-200 bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <EpicGlyph status={item.status} />
                <span className={`min-w-0 truncate text-sm font-medium ${isDone ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
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
        })}
      </div>
    </div>
  )
}
