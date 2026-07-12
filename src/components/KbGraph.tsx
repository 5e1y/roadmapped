import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KbLayoutResult, KbPlaced } from '../lib/kbLayout'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'
import { usePanel } from '../state/PanelContext'
import { applyFilters, matchNodes, truncate, filterKey, KB_MAX_NODES, type KbFilters } from '../lib/kbFilter'
import { cachedKbLayout, ensureKbLayout, layoutInput } from '../lib/kbLayoutCache'
import { edgePaths, buildAdjacency, revealDelays } from '../lib/kbScene'
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
 *
 * #308 — taillé pour le VRAI graphe Graphify (869 nœuds / 2214 arêtes) :
 * - le layout est calculé EN TRANCHES et caché par (graphe, filtres)
 *   (kbLayoutCache) — plus de gel du main thread, retour instantané sur l'onglet ;
 * - les arêtes sont AGRÉGÉES en 2 <path> (kbScene.edgePaths) au lieu de 2214
 *   <line> ; la surbrillance du survol est une petite surcouche dédiée ;
 * - la scène SVG est découpée en couches React.memo qui IGNORENT la transform :
 *   pan/zoom = un style CSS sur le conteneur, zéro réconciliation des ~900
 *   éléments (c'est pour ça qu'il n'y a PAS de culling DOM : il forcerait un
 *   re-render par frame de pan, le navigateur clippe déjà la peinture) ;
 * - à l'arrivée, les nœuds APPARAISSENT PAR LOTS (hubs d'abord) via une
 *   animation CSS staggerée (--kb-d) — un seul render, coupée sous
 *   prefers-reduced-motion. Les changements de filtres restent instantanés.
 */

const LABEL_LIMIT = 60
/** Reveal : taille de lot et cadence — total ~0,9 s sur 869 nœuds. */
const REVEAL_BATCH = 45
const REVEAL_STEP_MS = 30 // doit refléter le calc() de .kb-in (index.css)
const REVEAL_ANIM_MS = 300

export function KbGraph({ graph, filters, query }: { graph: KbGraphData; filters: KbFilters; query: string }) {
  const { openKbNode } = usePanel()

  // Filtres → sous-graphe, puis troncature défensive. Mémo par clé STABLE
  // (les tableaux de filtres changent d'identité à chaque render de KbView).
  const fKey = filterKey(filters)
  const filtered = useMemo(
    () => applyFilters(graph, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, fKey],
  )
  const view = useMemo(() => truncate(filtered, KB_MAX_NODES), [filtered])
  const truncated = view.nodes.length < filtered.nodes.length

  // Layout asynchrone (tranches) + cache module par (graphe, filtres). Pendant
  // un recalcul (changement de filtre), l'ANCIEN layout reste affiché : les
  // nœuds survivants gardent leur place, puis se recalent — pas d'écran vide.
  const layout = useKbLayout(graph, fKey, view)
  const lastRef = useRef<{ graph: KbGraphData; layout: KbLayoutResult } | null>(null)
  if (layout) lastRef.current = { graph, layout }
  const shown = layout ?? (lastRef.current?.graph === graph ? lastRef.current.layout : null)

  const zp = useZoomPan(shown?.width ?? 0, shown?.height ?? 0)

  // Survol coalescé par rAF : traverser une grappe dense tire plusieurs
  // enter/leave par frame — un seul setState (donc un seul render) par frame.
  const [focus, setFocusState] = useState<string | null>(null)
  const focusPending = useRef<string | null>(null)
  const focusRaf = useRef(0)
  const setFocus = useCallback((id: string | null) => {
    if (typeof requestAnimationFrame !== 'function') { setFocusState(id); return }
    focusPending.current = id
    if (!focusRaf.current) {
      focusRaf.current = requestAnimationFrame(() => {
        focusRaf.current = 0
        setFocusState(focusPending.current)
      })
    }
  }, [])
  useEffect(() => () => {
    if (focusRaf.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(focusRaf.current)
  }, [])

  const adj = useMemo(() => buildAdjacency(view.edges), [view])

  const searching = query.trim() !== ''
  const matches = useMemo(() => matchNodes(view.nodes, query), [view, query])

  // Arêtes agrégées : 2 <path> pour TOUT le graphe (mémo indépendant du survol).
  const basePaths = useMemo(() => (shown ? edgePaths(view.edges, shown.nodes) : null), [view, shown])
  const focusPaths = useMemo(
    () => (shown && focus !== null ? edgePaths(view.edges, shown.nodes, focus) : null),
    [view, shown, focus],
  )

  // Reveal progressif : uniquement à l'ARRIVÉE sur la vue (premier layout du
  // montage) — les changements de filtres ensuite restent instantanés.
  const [revealing, setRevealing] = useState(true)
  const hasLayout = shown !== null
  useEffect(() => {
    if (!hasLayout) return
    const batches = Math.ceil((lastRef.current?.layout.nodes.size ?? 0) / REVEAL_BATCH)
    const t = setTimeout(() => setRevealing(false), batches * REVEAL_STEP_MS + REVEAL_ANIM_MS + 100)
    return () => clearTimeout(t)
    // Une seule bascule false→true possible : l'effet ne rejoue pas ensuite.
  }, [hasLayout])
  const delays = useMemo(
    () => (revealing && shown ? revealDelays(shown.nodes, REVEAL_BATCH) : null),
    [revealing, shown],
  )

  // Premier layout → fit : on ARRIVE sur la vue d'ensemble (le reveal se joue
  // à l'écran, pas dans un coin d'un canvas de 2400 px).
  const didFit = useRef(false)
  useEffect(() => {
    if (!hasLayout || didFit.current) return
    didFit.current = true
    zp.fitBox(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLayout])

  // Recherche → recentre sur la bbox des résultats (fitBox). Rien si 0 match.
  useEffect(() => {
    if (matches.size === 0 || !shown) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const id of matches) {
      const p = shown.nodes.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r)
      minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r)
    }
    if (minX === Infinity) return
    zp.fitBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
    // fitBox est stable ; on refit quand les résultats ou le layout changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, shown])

  const { scale, tx, ty } = zp.transform

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
          Graphe tronqué aux {KB_MAX_NODES} nœuds les plus connectés — filtre pour zoomer.
        </div>
      )}
      {searching && matches.size === 0 && (
        <div className="absolute left-3 top-3 z-10 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-600 shadow-sm">
          Aucun nœud ne matche « {query} ».
        </div>
      )}

      <PoweredByGraphify />

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
        {shown && (
          <div
            className="relative"
            style={{
              width: shown.width,
              height: shown.height,
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transformOrigin: '0 0',
              willChange: 'transform',
            }}
          >
            <svg className="absolute inset-0" width={shown.width} height={shown.height}>
              {basePaths && (
                <EdgesLayer solid={basePaths.solid} dashed={basePaths.dashed} dim={focus !== null} revealing={revealing} />
              )}
              {focusPaths && (
                <g pointerEvents="none" stroke="var(--color-neutral-900)" strokeOpacity={0.8} strokeWidth={1.5} fill="none">
                  {focusPaths.solid && <path d={focusPaths.solid} vectorEffect="non-scaling-stroke" />}
                  {focusPaths.dashed && <path d={focusPaths.dashed} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                </g>
              )}
              <NodesLayer
                nodes={view.nodes}
                placed={shown.nodes}
                focus={focus}
                adj={adj}
                matches={matches}
                searching={searching}
                delays={delays}
                onFocus={setFocus}
                onOpen={openKbNode}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Layout asynchrone : lit le cache module (synchrone), sinon rejoint/lance un
 * job en tranches (kbLayoutCache — partagé avec le préchauffage de KbContext).
 */
function useKbLayout(
  graph: KbGraphData,
  fKey: string,
  view: { nodes: KbNode[]; edges: KbEdge[] },
): KbLayoutResult | null {
  const [ready, setReady] = useState<{ key: string; layout: KbLayoutResult } | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const cached = cachedKbLayout(graph, fKey)
  useEffect(() => {
    if (cachedKbLayout(graph, fKey)) return
    return ensureKbLayout(graph, fKey, layoutInput(viewRef.current), (layout) => setReady({ key: fKey, layout }))
  }, [graph, fKey])
  return cached ?? (ready?.key === fKey ? ready.layout : null)
}

/** Les 2214 arêtes de base = 2 <path>. Ne re-rend que si le graphe ou l'état
 *  binaire dim/reveal change — jamais pendant le pan/zoom. */
const EdgesLayer = memo(function EdgesLayer({
  solid, dashed, dim, revealing,
}: { solid: string; dashed: string; dim: boolean; revealing: boolean }) {
  return (
    <g
      className={revealing ? 'kb-edges-in' : undefined}
      pointerEvents="none"
      fill="none"
      stroke={dim ? 'var(--color-neutral-200)' : 'var(--color-neutral-500)'}
      strokeOpacity={dim ? 0.6 : 0.8}
      strokeWidth={1}
    >
      {solid && <path d={solid} vectorEffect="non-scaling-stroke" />}
      {dashed && <path d={dashed} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
    </g>
  )
})

const NodesLayer = memo(function NodesLayer({
  nodes, placed, focus, adj, matches, searching, delays, onFocus, onOpen,
}: {
  nodes: KbNode[]
  placed: ReadonlyMap<string, KbPlaced>
  focus: string | null
  adj: Map<string, Set<string>>
  matches: Set<string>
  searching: boolean
  delays: Map<string, number> | null
  onFocus: (id: string | null) => void
  onOpen: (id: string) => void
}) {
  const inHood = (id: string): boolean =>
    focus === null || id === focus || (adj.get(focus)?.has(id) ?? false)

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

  const showLabel = (id: string): boolean =>
    nodes.length <= LABEL_LIMIT ? true : (focus !== null && inHood(id)) || matches.has(id)

  return (
    <>
      {nodes.map((node) => {
        const p = placed.get(node.id)
        if (!p) return null
        const tone = nodeFill(node.id)
        const delay = delays?.get(node.id)
        const reveal = delay !== undefined
        return (
          <g key={node.id}>
            <circle
              cx={p.x} cy={p.y} r={p.r}
              className={reveal ? 'kb-in cursor-pointer' : 'cursor-pointer'}
              style={reveal ? ({ '--kb-d': delay } as React.CSSProperties) : undefined}
              fill="var(--color-accent)"
              fillOpacity={tone.fill}
              stroke="var(--color-accent)"
              strokeOpacity={tone.stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              onPointerEnter={() => onFocus(node.id)}
              onPointerLeave={() => onFocus(null)}
              onClick={() => onOpen(node.id)}
            >
              <title>{`${node.label} · ${node.fileType}${node.sourceFile ? ` · ${node.sourceFile}` : ''}`}</title>
            </circle>
            {showLabel(node.id) && (
              <text
                x={p.x} y={p.y + p.r + 9}
                textAnchor="middle"
                className={reveal ? 'kb-in pointer-events-none' : 'pointer-events-none'}
                style={{
                  fontSize: 9,
                  fill: tone.dim ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)',
                  ...(reveal ? ({ '--kb-d': delay } as React.CSSProperties) : undefined),
                }}
              >
                {node.label}
              </text>
            )}
          </g>
        )
      })}
    </>
  )
})

/** Bleu de marque Graphify — la seule couleur en dur légitime ici (logo tiers). */
const GRAPHIFY_BLUE = '#2563eb'

/**
 * Logo Graphify recréé en SVG inline : hexagone filaire façon cube isométrique
 * — un nœud à chaque sommet, un nœud central, arêtes du contour + rayons.
 */
function GraphifyMark() {
  // Hexagone pointe en haut, centre (12,12), rayon 8.6.
  const V: Array<[number, number]> = [
    [12, 3.4], [19.45, 7.7], [19.45, 16.3], [12, 20.6], [4.55, 16.3], [4.55, 7.7],
  ]
  const hex = V.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('') + 'Z'
  const spokes = V.map(([x, y]) => `M${x} ${y}L12 12`).join('')
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <g stroke={GRAPHIFY_BLUE} strokeWidth="1.5" fill="none" strokeLinejoin="round">
        <path d={hex} />
        <path d={spokes} strokeWidth="1.2" />
      </g>
      <g fill={GRAPHIFY_BLUE}>
        {V.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.8} />)}
        <circle cx={12} cy={12} r={2} />
      </g>
    </svg>
  )
}

/**
 * Carte « powered by Graphify » (#308) : flottante, bas-centré, au-dessus du
 * canvas. Chrome 100 % tokens (theme-aware) ; seule la marque est bleue. Lien
 * sortant — les pointer-events ne couvrent que la carte, pas le canvas.
 */
function PoweredByGraphify() {
  return (
    <a
      href="https://graphify.net/"
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] text-neutral-500 shadow-sm transition-colors hover:border-neutral-400 hover:text-neutral-700"
    >
      powered by
      <GraphifyMark />
      <span className="font-medium text-neutral-700">graphify</span>
    </a>
  )
}
