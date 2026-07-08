import { useMemo } from 'react'
import { layoutTagGraph, LAYOUT_W, LAYOUT_H, type TagGraphData } from '../lib/tagGraph'

/**
 * Graphe de liens des TAGS (#146) — façon graphe de connaissances Obsidian,
 * flanc droit du Backlog, sous le radar teams. Même partage des rôles que
 * TeamsRadar : le SVG (aria-hidden) ne porte que la géométrie — arêtes en
 * accent atténué, pastilles ∝ nombre de tickets ouverts — et les LABELS sont
 * des boutons HTML à police fixe, superposés en %, qui portent la sélection
 * (aria-pressed) et le clic-filtre. Recliquer le tag actif le désélectionne.
 */
export function TagGraph({ graph, selected, onSelect }: {
  graph: TagGraphData
  selected: string
  onSelect: (tag: string) => void
}) {
  const placed = useMemo(() => layoutTagGraph(graph), [graph])
  const at = useMemo(() => new Map(placed.map((p) => [p.tag, p])), [placed])
  const maxWeight = Math.max(1, ...graph.edges.map((e) => e.weight))

  // Filtre fantôme (tag persisté dont plus aucun ticket ouvert) : le tag
  // n'a plus de nœud — offrir quand même la désélection, sinon le filtre
  // devient invisible et indélogeable depuis l'UI.
  const ghost = selected !== '' && !at.has(selected)

  if (placed.length === 0 && !ghost) return null

  return (
    <div role="group" aria-label="Thèmes des tickets ouverts (tags)" className="w-full">
      {ghost && (
        <div className="flex items-center gap-2 px-4 pb-1 text-xs text-neutral-500">
          <span>
            filtre tag <span className="font-mono text-neutral-700">#{selected}</span> — plus aucun ticket ouvert
          </span>
          <button
            type="button"
            onClick={() => onSelect('')}
            className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 text-neutral-700 hover:border-neutral-400 hover:text-neutral-900"
          >
            retirer
          </button>
        </div>
      )}
      {placed.length > 0 && (
        <div className="relative aspect-[6/5] w-full">
          <svg viewBox={`0 0 ${LAYOUT_W} ${LAYOUT_H}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
            {graph.edges.map((e) => {
              const a = at.get(e.a)
              const b = at.get(e.b)
              if (!a || !b) return null
              const touched = selected === e.a || selected === e.b
              return (
                <line
                  key={`${e.a}→${e.b}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="var(--color-accent)"
                  strokeOpacity={touched ? 0.75 : 0.18 + 0.27 * (e.weight / maxWeight)}
                  strokeWidth={1 + 1.5 * (e.weight / maxWeight)}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {/* Pastilles : même langage que le polygone du radar (fond accent
                atténué + trait accent) — le plein accent est réservé au tag
                SÉLECTIONNÉ, fidèle à la doctrine de rareté de l'accent. */}
            {placed.map((p) => {
              const active = selected === p.tag
              const dimmed = selected !== '' && !active
              return (
                <circle
                  key={p.tag}
                  cx={p.x} cy={p.y} r={p.r}
                  fill="var(--color-accent)"
                  fillOpacity={active ? 1 : dimmed ? 0.08 : 0.18}
                  stroke="var(--color-accent)"
                  strokeOpacity={dimmed ? 0.3 : 1}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          {/* Labels HTML à police FIXE (modèle TeamsRadar) : lisibles à toute
              échelle, ancrés SOUS leur pastille — le layout réserve la marge. */}
          {placed.map((p) => {
            const active = selected === p.tag
            return (
              <button
                key={p.tag}
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(active ? '' : p.tag) }}
                aria-pressed={active}
                style={{
                  left: `${(p.x / LAYOUT_W) * 100}%`,
                  top: `${((p.y + p.r) / LAYOUT_H) * 100}%`,
                  transform: 'translate(-50%, 2px)',
                }}
                className={`absolute flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
                  active
                    ? 'border-accent bg-accent-tint font-medium text-neutral-900'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-900'
                }`}
              >
                {p.tag}
                <span className={`font-mono text-[11px] ${active ? 'text-accent' : 'text-neutral-500'}`}>
                  {p.count}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
