import { useMemo, useState } from 'react'
import { kbLayout, type KbLayoutInput } from '../lib/kbLayout'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'
import type { KbGraph as KbGraphData, KbNode } from '../server/kb'

/**
 * Rendu de la Knowledge base (#kb) : graphe force-directed (kbLayout, PAS dagre)
 * dessiné en SVG, façon TagGraph — pastilles ∝ degré, monochrome + accent. Le
 * zoom/pan est le hook maison réutilisé tel quel (useZoomPan). Arêtes EXTRACTED
 * en trait plein, INFERRED/AMBIGUOUS en pointillés (l'audit trail de Graphify
 * rendu visible). La COMMUNAUTÉ n'est PAS une couleur (filtre en phase 2) : la
 * rareté de l'accent est préservée.
 *
 * Survol d'un nœud = son VOISINAGE à 1 saut passe en accent, le reste s'atténue
 * (idiome RoadmapGraph, transitoire — pas de sélection persistée en phase 1).
 */

/** Au-delà, on n'affiche que le sous-graphe des plus hauts degrés (perf/lisibilité). */
const MAX_NODES = 1500
/** Labels affichés jusqu'à ce seuil ; au-delà, seuls les nœuds du voisinage survolé. */
const LABEL_LIMIT = 60

const dashOf = (confidence: string): string | undefined =>
  confidence === 'EXTRACTED' ? undefined : '3 3'

export function KbGraph({ graph }: { graph: KbGraphData }) {
  // Troncature défensive : les N nœuds de plus fort degré + leurs arêtes internes.
  const view = useMemo(() => truncate(graph, MAX_NODES), [graph])
  const truncated = view.nodes.length < graph.nodes.length

  const input: KbLayoutInput = useMemo(
    () => ({
      nodes: view.nodes.map((n) => ({ id: n.id })),
      edges: view.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
    }),
    [view],
  )
  const layout = kbLayout(input)
  const zp = useZoomPan(layout.width, layout.height)
  const [focus, setFocus] = useState<string | null>(null)

  // Voisinage à 1 saut du nœud survolé (surlignage transitoire).
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const link = (a: string, b: string) => { const s = m.get(a); if (s) s.add(b); else m.set(a, new Set([b])) }
    for (const e of view.edges) { link(e.source, e.target); link(e.target, e.source) }
    return m
  }, [view])
  const nodeById = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view])

  const inHood = (id: string): boolean =>
    focus === null || id === focus || (adj.get(focus)?.has(id) ?? false)
  const edgeStrong = (a: string, b: string): boolean =>
    focus !== null && (a === focus || b === focus)

  const { scale, tx, ty } = zp.transform
  const showLabel = (id: string): boolean =>
    view.nodes.length <= LABEL_LIMIT ? true : focus !== null && inHood(id)

  return (
    <div className="relative h-full w-full">
      {/* Contrôles de zoom épinglés (mêmes idiomes que RoadmapGraph). */}
      <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm">
        <button type="button" onClick={() => zp.zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out"
          className="px-2.5 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-100">−</button>
        <button type="button" onClick={zp.fit}
          className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100">Fit</button>
        <button type="button" onClick={zp.reset} aria-label="Reset zoom to 100%"
          className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100">100 %</button>
        <button type="button" onClick={() => zp.zoomBy(ZOOM_STEP)} aria-label="Zoom in"
          className="border-l border-neutral-200 px-2.5 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-100">+</button>
      </div>

      {truncated && (
        <div className="absolute left-3 top-3 z-10 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-600 shadow-sm">
          Graphe tronqué aux {MAX_NODES} nœuds les plus connectés — filtre pour zoomer (phase 2).
        </div>
      )}

      <div
        ref={zp.viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Knowledge graph — drag to pan, scroll wheel or + and − to zoom"
        className={`absolute inset-0 select-none overflow-hidden ${zp.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={zp.handlers.onPointerDown}
        onPointerMove={zp.handlers.onPointerMove}
        onPointerUp={zp.handlers.onPointerUp}
        onPointerCancel={zp.handlers.onPointerCancel}
        onKeyDown={zp.handlers.onKeyDown}
      >
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          <svg className="absolute inset-0" width={layout.width} height={layout.height}>
            {/* Arêtes derrière les nœuds. */}
            {view.edges.map((e, i) => {
              const a = layout.nodes.get(e.source)
              const b = layout.nodes.get(e.target)
              if (!a || !b) return null
              const strong = edgeStrong(e.source, e.target)
              const dim = focus !== null && !strong
              return (
                <line
                  key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={strong ? 'var(--color-neutral-900)' : dim ? 'var(--color-neutral-200)' : 'var(--color-neutral-500)'}
                  strokeOpacity={dim ? 0.6 : 0.8}
                  strokeWidth={strong ? 1.5 : 1}
                  strokeDasharray={dashOf(e.confidence)}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
            {/* Nœuds : pastille ∝ degré, accent réservé au voisinage survolé. */}
            {view.nodes.map((node) => {
              const p = layout.nodes.get(node.id)
              if (!p) return null
              const active = focus === node.id
              const near = inHood(node.id)
              const dim = focus !== null && !near
              return (
                <g key={node.id}>
                  <circle
                    cx={p.x} cy={p.y} r={p.r}
                    fill="var(--color-accent)"
                    fillOpacity={active ? 0.9 : dim ? 0.06 : near && focus !== null ? 0.6 : 0.2}
                    stroke="var(--color-accent)"
                    strokeOpacity={dim ? 0.3 : 1}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer' }}
                    onPointerEnter={() => setFocus(node.id)}
                    onPointerLeave={() => setFocus((cur) => (cur === node.id ? null : cur))}
                  >
                    <title>{`${node.label} · ${node.fileType}${node.sourceFile ? ` · ${node.sourceFile}` : ''}`}</title>
                  </circle>
                  {showLabel(node.id) && (
                    <text
                      x={p.x} y={p.y + p.r + 9}
                      textAnchor="middle"
                      className="pointer-events-none"
                      style={{ fontSize: 9, fill: dim ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)' }}
                    >
                      {node.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}

/** Sous-graphe des `max` nœuds de plus fort degré (arêtes internes conservées). */
function truncate(graph: KbGraphData, max: number): { nodes: KbNode[]; edges: KbGraphData['edges'] } {
  if (graph.nodes.length <= max) return { nodes: graph.nodes, edges: graph.edges }
  const deg = new Map<string, number>()
  for (const e of graph.edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }
  const kept = [...graph.nodes]
    .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
    .slice(0, max)
  const keptIds = new Set(kept.map((n) => n.id))
  return { nodes: kept, edges: graph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)) }
}
