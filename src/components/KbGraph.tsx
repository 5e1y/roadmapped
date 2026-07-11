import { useEffect, useMemo, useState } from 'react'
import { kbLayout, type KbLayoutInput } from '../lib/kbLayout'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'
import { usePanel } from '../state/PanelContext'
import { applyFilters, matchNodes, type KbFilters } from '../lib/kbFilter'
import type { KbGraph as KbGraphData, KbNode, KbEdge } from '../server/kb'

/**
 * Rendu de la Knowledge base (#kb) : graphe force-directed (kbLayout, PAS dagre)
 * dessiné en SVG, façon TagGraph — pastilles ∝ degré, monochrome + accent. Zoom/
 * pan = hook maison réutilisé (useZoomPan). Arêtes EXTRACTED en trait plein,
 * INFERRED/AMBIGUOUS en pointillés (l'audit trail de Graphify rendu visible). La
 * COMMUNAUTÉ n'est PAS une couleur (c'est un filtre) : la rareté de l'accent est
 * préservée.
 *
 * Phase 2 : les filtres (community/type/inferred) restreignent le sous-graphe
 * affiché ; la recherche surligne les nœuds matchés, atténue le reste et RECENTRE
 * (fitBox) sur les résultats. Survol d'un nœud = voisinage à 1 saut en accent ;
 * CLIC = ouvre l'inspecteur (SidePanel, pile de navigation).
 */

const MAX_NODES = 1500
const LABEL_LIMIT = 60

const dashOf = (confidence: string): string | undefined =>
  confidence === 'EXTRACTED' ? undefined : '3 3'

export function KbGraph({ graph, filters, query }: { graph: KbGraphData; filters: KbFilters; query: string }) {
  const { openKbNode } = usePanel()

  // Filtres → sous-graphe, puis troncature défensive. Mémo par clés STABLES
  // (les tableaux de filtres changent d'identité à chaque render de KbView).
  const commKey = [...filters.communities].sort((a, b) => a - b).join(',')
  const typeKey = [...filters.fileTypes].sort().join(',')
  const filtered = useMemo(
    () => applyFilters(graph, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, commKey, typeKey, filters.hideInferred],
  )
  const view = useMemo(() => truncate(filtered, MAX_NODES), [filtered])
  const truncated = view.nodes.length < filtered.nodes.length

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

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const link = (a: string, b: string) => { const s = m.get(a); if (s) s.add(b); else m.set(a, new Set([b])) }
    for (const e of view.edges) { link(e.source, e.target); link(e.target, e.source) }
    return m
  }, [view])

  const searching = query.trim() !== ''
  const matches = useMemo(() => matchNodes(view.nodes, query), [view, query])

  // Recherche → recentre sur la bbox des résultats (fitBox). Rien si 0 match.
  useEffect(() => {
    if (matches.size === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const id of matches) {
      const p = layout.nodes.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r)
      minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r)
    }
    if (minX === Infinity) return
    zp.fitBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
    // fitBox est stable ; on refit quand les résultats ou le layout changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, layout])

  const inHood = (id: string): boolean =>
    focus === null || id === focus || (adj.get(focus)?.has(id) ?? false)
  const edgeStrong = (a: string, b: string): boolean =>
    focus !== null && (a === focus || b === focus)

  /** Intensité d'un nœud : le survol prime, puis la recherche, puis l'état neutre. */
  const nodeFill = (id: string): { fill: number; stroke: number; dim: boolean } => {
    if (focus !== null) {
      if (id === focus) return { fill: 0.9, stroke: 1, dim: false }
      if (inHood(id)) return { fill: 0.6, stroke: 1, dim: false }
      return { fill: 0.06, stroke: 0.3, dim: true }
    }
    if (searching) {
      return matches.has(id) ? { fill: 0.85, stroke: 1, dim: false } : { fill: 0.06, stroke: 0.3, dim: true }
    }
    return { fill: 0.2, stroke: 1, dim: false }
  }

  const { scale, tx, ty } = zp.transform
  const showLabel = (id: string): boolean =>
    view.nodes.length <= LABEL_LIMIT ? true : (focus !== null && inHood(id)) || matches.has(id)

  return (
    <div className="relative h-full w-full">
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
          Graphe tronqué aux {MAX_NODES} nœuds les plus connectés — filtre pour zoomer.
        </div>
      )}
      {searching && matches.size === 0 && (
        <div className="absolute left-3 top-3 z-10 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-600 shadow-sm">
          Aucun nœud ne matche « {query} ».
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
            {view.nodes.map((node) => {
              const p = layout.nodes.get(node.id)
              if (!p) return null
              const tone = nodeFill(node.id)
              return (
                <g key={node.id}>
                  <circle
                    cx={p.x} cy={p.y} r={p.r}
                    fill="var(--color-accent)"
                    fillOpacity={tone.fill}
                    stroke="var(--color-accent)"
                    strokeOpacity={tone.stroke}
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer' }}
                    onPointerEnter={() => setFocus(node.id)}
                    onPointerLeave={() => setFocus((cur) => (cur === node.id ? null : cur))}
                    onClick={() => openKbNode(node.id)}
                  >
                    <title>{`${node.label} · ${node.fileType}${node.sourceFile ? ` · ${node.sourceFile}` : ''}`}</title>
                  </circle>
                  {showLabel(node.id) && (
                    <text
                      x={p.x} y={p.y + p.r + 9}
                      textAnchor="middle"
                      className="pointer-events-none"
                      style={{ fontSize: 9, fill: tone.dim ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)' }}
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
function truncate(view: { nodes: KbNode[]; edges: KbEdge[] }, max: number): { nodes: KbNode[]; edges: KbEdge[] } {
  if (view.nodes.length <= max) return view
  const deg = new Map<string, number>()
  for (const e of view.edges) {
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }
  const kept = [...view.nodes]
    .sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0))
    .slice(0, max)
  const keptIds = new Set(kept.map((n) => n.id))
  return { nodes: kept, edges: view.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)) }
}
