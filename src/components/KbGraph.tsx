import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { KbLayoutResult, KbPlaced } from '../lib/kbLayout'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'
import { usePanel, kbNodeIdOf } from '../state/PanelContext'
import { applyFilters, matchNodes, truncate, filterKey, KB_MAX_NODES, type KbFilters } from '../lib/kbFilter'
import { cachedKbLayout, ensureKbLayout, layoutInput } from '../lib/kbLayoutCache'
import { edgePaths, buildAdjacency, nodesBox } from '../lib/kbScene'
import { KbSimDriver } from './kbSimDriver'
import { readKbSimOverrides, useKbSimOverrides } from '../state/kbSimParams'
import type { KbGraph as KbGraphData, KbNode, KbEdge } from '../server/kb'
import { ZoomControls } from './ZoomControls'

/**
 * Rendu de la Knowledge base (#kb) : graphe force-directed dessiné en SVG —
 * pastilles ∝ degré, monochrome + accent, arêtes EXTRACTED pleines /
 * INFERRED-AMBIGUOUS pointillées (l'audit trail de Graphify rendu visible).
 * La COMMUNAUTÉ n'est PAS une couleur (c'est un filtre) : la rareté de
 * l'accent est préservée. Zoom/pan = hook maison (useZoomPan).
 *
 * #316 — le graphe est VIVANT, façon Obsidian : une SIMULATION DE FORCES LIVE
 * (lib/kbSim — Barnes-Hut O(n log n), ressorts, centrage, alpha decay)
 * remplace le layout figé + reveal CSS :
 * - ARRIVÉE = « génération » : les nœuds partent en petit nuage au centre et
 *   on VOIT le réseau s'écarter puis se stabiliser (~3 s) ; la caméra suit
 *   (auto-fit) tant que l'utilisateur n'a pas pris la main ;
 * - FILTRE = morph : les survivants GLISSENT vers leur nouvel équilibre (la
 *   sim continue depuis les positions courantes), les entrants apparaissent
 *   près de leurs voisins et rejoignent — pas de switch sec ;
 * - DRAG d'un nœud : épinglé sous le curseur, les voisins réagissent par les
 *   ressorts ; relâché, il rejoint la sim. Le pan du fond coexiste (seuil de
 *   4 px, capture différée — même politique que le fix #312) ;
 * - la sim se refroidit et S'ARRÊTE (zéro CPU au repos), redémarre au drag /
 *   au filtre ; sous prefers-reduced-motion : AUCUNE animation — layout
 *   pré-calculé en tranches (kbLayoutCache), rendu figé, comme avant.
 *
 * Perf (869 nœuds / 2214 arêtes à 60 fps) : React ne réconcilie JAMAIS la
 * scène pendant la sim — la boucle rAF (kbSimDriver) écrit directement les
 * transform des <g> nœuds et le `d` des 2 <path> d'arêtes agrégées (#308).
 * Les couches restent des React.memo qui ignorent le pan/zoom (transform CSS
 * sur le conteneur).
 */

const LABEL_LIMIT = 60
/** Zoom plancher au clic d'un nœud (au moins ça — on garde plus si déjà zoomé). */
const NODE_ZOOM = 1.25
/** Seuil (px, |dx|+|dy|) avant qu'un pointerdown sur un nœud devienne un DRAG :
 *  en-deçà, c'est un clic → inspecteur. Parité avec le pan du fond (#312). */
const NODE_DRAG_THRESHOLD = 4

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function KbGraph({ graph, filters, query, onNodeClick: onNodeClickProp }: {
  graph: KbGraphData
  filters: KbFilters
  query: string
  /**
   * #375 — override du CLIC sur un nœud. Non fourni (défaut, KbView) : ouvre
   * l'inspecteur KbNodePanel (openKbNode) et centre la caméra — comportement
   * historique INCHANGÉ. Fourni (Overview des tags) : REMPLACE ce comportement
   * (un no-op par ex.) — un tag n'est pas un nœud de code, KbNodePanel n'aurait
   * pas de sens ; à terme ce hook pourra poser un filtre tag→tickets. Le survol,
   * le drag, le zoom/pan restent identiques dans les deux modes.
   */
  onNodeClick?: (id: string) => void
}) {
  const { openKbNode, stack } = usePanel()
  // #320 — nœud SÉLECTIONNÉ (inspecteur KbNodePanel visible) : peint en accent
  // plein. En mode double panneau (#313) le kb-node est SOUS le task — kbNodeIdOf
  // remonte le bon cran. null quand le panneau se ferme → l'état actif tombe.
  const selected = kbNodeIdOf(stack)

  // Politique de mouvement figée AU MONTAGE : sim live par défaut, pipeline
  // statique (layout pré-calculé, aucune animation) sous prefers-reduced-motion.
  const [reduced] = useState(prefersReducedMotion)

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

  // ---- Moteur LIVE : un pilote par (montage, graphe) — l'arrivée sur la vue
  // relance la « génération » (staggered #317 : le pilote fait entrer les
  // nœuds par lots, hubs d'abord). Les changements de filtre passent par
  // morphTo. Les réglages persistés (#318) sont injectés à la création.
  const driver = useMemo(
    () => (reduced ? null : new KbSimDriver(view, layoutInput(view), view.edges, readKbSimOverrides())),
    // La vue de CRÉATION suffit : les vues suivantes arrivent via morphTo (mémo shown).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, reduced],
  )
  const driverRef = useRef(driver)
  driverRef.current = driver

  // #317 — un lot de reveal vient d'entrer : re-render pour MONTER les nouveaux
  // <g> (le Map placed a grandi ; NodesLayer est memo → l'epoch le débloque).
  const [revealEpoch, setRevealEpoch] = useState(0)

  // #318 — tuning LIVE : chaque écriture du store de réglages (panneau Display)
  // est poussée au driver, qui ré-applique à chaud et réchauffe la sim.
  const paramOverrides = useKbSimOverrides()
  useEffect(() => {
    driver?.applyParams(paramOverrides)
  }, [driver, paramOverrides])
  // Nœuds de la GÉNÉRATION initiale : PAS de pop CSS d'insertion — 869
  // animations `kb-in` simultanées coûtaient des frames à 100 ms+ au montage
  // (mesuré #316), et l'expansion du nuage EST déjà l'entrée en scène. Seuls
  // les ENTRANTS d'un morph (poignée de nœuds) popent.
  const initialIds = useMemo(
    () => new Set(view.nodes.map((n) => n.id)),
    // Même cycle de vie que le pilote : la vue de création.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [driver],
  )

  // Auto-fit de la caméra pendant la génération / un morph — coupé dès que
  // l'utilisateur prend la main (pointer/molette/clavier/boutons de zoom).
  const interactedRef = useRef(false)
  const markInteracted = useCallback(() => { interactedRef.current = true }, [])

  // ---- Moteur STATIQUE (reduced-motion) : cache module + calcul en tranches.
  const staticLayout = useKbStaticLayout(reduced ? graph : null, fKey, view)
  const lastStaticRef = useRef<{ graph: KbGraphData; layout: KbLayoutResult } | null>(null)
  if (staticLayout) lastStaticRef.current = { graph, layout: staticLayout }

  // `shown` : positions courantes. Live = le Map MUTÉ de la sim (identité
  // stable, le pilote écrit dedans à chaque tick) ; morphTo est idempotent par
  // vue (appelable d'un useMemo, StrictMode compris). Statique = ancien layout
  // affiché pendant un recalcul de filtre (pas d'écran vide).
  const simShown = useMemo(() => {
    if (!driver) return null
    if (driver.morphTo(view, layoutInput(view), view.edges)) interactedRef.current = false
    return { nodes: driver.sim.placed, width: driver.sim.width, height: driver.sim.height }
  }, [driver, view])
  const shown: KbLayoutResult | null = driver
    ? simShown
    : staticLayout ?? (lastStaticRef.current?.graph === graph ? lastStaticRef.current.layout : null)

  // #319 — pan LIBRE : la sim n'est plus bornée à sa boîte de layout, il faut
  // pouvoir suivre un nœud parti au-delà (RoadmapGraph, lui, reste borné).
  const zp = useZoomPan(shown?.width ?? 0, shown?.height ?? 0, { unbounded: true })

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

  // Clic nœud = ouvre l'inspecteur ET cadre le nœud au centre à >=125 % (#311).
  // Handler STABLE (refs) : NodesLayer est mémoïsé, il ne doit pas re-rendre à
  // chaque pan/zoom (où `shown`/`scale`/`zp` changent d'identité).
  const shownRef = useRef(shown)
  shownRef.current = shown
  const scaleRef = useRef(1)
  scaleRef.current = zp.transform.scale
  const zpRef = useRef(zp)
  zpRef.current = zp
  // Un drag de nœud qui vient de finir ne doit PAS compter comme un clic.
  const justDraggedRef = useRef(false)
  // Handler d'override tenu par ref : NodesLayer est mémoïsé, onNodeClick doit
  // rester STABLE (une nouvelle identité de prop à chaque render ne doit pas le
  // recréer). Défaut = comportement KbView (openKbNode + centrage).
  const onNodeClickPropRef = useRef(onNodeClickProp)
  onNodeClickPropRef.current = onNodeClickProp
  const onNodeClick = useCallback((id: string) => {
    if (justDraggedRef.current) return
    // #375 — override fourni (Overview) : on NEUTRALISE l'ouverture de
    // KbNodePanel et on délègue (no-op / futur filtre). KbView ne passe rien.
    if (onNodeClickPropRef.current) { onNodeClickPropRef.current(id); return }
    openKbNode(id)
    const p = shownRef.current?.nodes.get(id)
    if (!p) return
    // L'inspecteur (SidePanel, 380px) POUSSE le graphe : on diffère le centrage
    // d'une frame pour que le viewport ait rétréci — sinon on cadre sur l'ancienne
    // largeur et le nœud finit décalé de ~190px. rAF absent (jsdom) → direct.
    const center = () => zpRef.current.centerOn(p.x, p.y, Math.max(scaleRef.current, NODE_ZOOM))
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(center)
    else center()
  }, [openKbNode])

  // DRAG d'un nœud (#316, live seulement) : capture DIFFÉRÉE au seuil (#312) —
  // un simple clic reste un clic. Au-delà : le nœud est épinglé sous le curseur
  // (coordonnées contenu = inverse du pan/zoom), la sim chauffe (alphaTarget),
  // les voisins suivent par les ressorts. Relâché : il rejoint la sim.
  const onNodePointerDown = useCallback((id: string, e: React.PointerEvent<SVGCircleElement>) => {
    const drv = driverRef.current
    if (!drv || e.button !== 0) return
    // Le pan du fond ne doit pas s'armer sur un nœud — mais le capture-phase du
    // viewport (markInteracted) a déjà coupé l'auto-fit, comme attendu.
    e.stopPropagation()
    const el = e.currentTarget
    const s = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, active: false }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return
      if (!s.active) {
        if (Math.abs(ev.clientX - s.sx) + Math.abs(ev.clientY - s.sy) < NODE_DRAG_THRESHOLD) return
        s.active = true
        try { el.setPointerCapture(s.pointerId) } catch { /* pointeur déjà relâché */ }
        drv.beginDrag(id)
      }
      const vp = zpRef.current.viewportRef.current
      if (!vp) return
      const rect = vp.getBoundingClientRect()
      const { scale, tx, ty } = zpRef.current.transform
      drv.dragTo(id, (ev.clientX - rect.left - tx) / scale, (ev.clientY - rect.top - ty) / scale)
    }
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== s.pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      if (s.active) {
        drv.endDrag(id)
        // Le `click` part APRÈS le pointerup : on l'avale, puis on relâche le flag.
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 0)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }, [])

  const searching = query.trim() !== ''
  const matches = useMemo(() => matchNodes(view.nodes, query), [view, query])
  const searchingRef = useRef(searching)
  searchingRef.current = searching

  // Arêtes agrégées côté React : pipeline STATIQUE seulement — en live c'est le
  // pilote qui possède les attributs `d` (React ne les écrit jamais).
  const basePaths = useMemo(
    () => (!driver && shown ? edgePaths(view.edges, shown.nodes) : null),
    [driver, view, shown],
  )
  const focusPaths = useMemo(
    () => (!driver && shown && focus !== null ? edgePaths(view.edges, shown.nodes, focus) : null),
    [driver, view, shown, focus],
  )

  // Boucle de sim : démarrée au montage (génération), stoppée au démontage.
  // Le crochet caméra suit la bbox VIVANTE des nœuds tant que l'utilisateur
  // n'a pas interagi et qu'aucune recherche ne cadre déjà ses résultats.
  useEffect(() => {
    if (!driver) return
    driver.onFrame = () => {
      if (interactedRef.current || searchingRef.current) return
      const box = nodesBox(driver.sim.placed)
      if (box) zpRef.current.fitBox(box, 1)
    }
    // #317 — chaque lot entré déclenche un render (montage des nouveaux <g>).
    // La caméra, elle, suit déjà frame à frame (onFrame fitte la bbox des
    // seuls nœuds entrés — fit progressif pendant la génération).
    driver.onReveal = () => setRevealEpoch((e) => e + 1)
    driver.start()
    return () => driver.stop()
  }, [driver])

  // Après chaque render qui change la scène (montage, morph) : une passe
  // d'écriture DOM AVANT la peinture — les entrants/refs fraîchement montés
  // reçoivent leurs positions sans attendre la frame suivante.
  useLayoutEffect(() => { driverRef.current?.sync() }, [view])

  // La surcouche de survol (arêtes accent du voisinage) est dessinée par le
  // pilote en live — elle suit les nœuds pendant la sim.
  useEffect(() => { driver?.setFocus(focus) }, [driver, focus])

  // Re-centrage (#311) : recherche active → fit la bbox des résultats (peut
  // zoomer) ; sinon fit du sous-graphe visible (borné à 100 %). En live la
  // boîte de layout est FIXE (sim) : on fit la bbox réelle des nœuds ; en
  // statique, fitBox(null) = la boîte de layout, qui EST cette bbox. Jamais
  // rejoué au pan/zoom/survol — l'utilisateur garde la main.
  useEffect(() => {
    if (!shown) return
    if (matches.size > 0) {
      const box = nodesBox(shown.nodes, matches)
      if (box) zp.fitBox(box)
    } else if (driver) {
      zp.fitBox(nodesBox(shown.nodes), 1)
    } else {
      zp.fitBox(null)
    }
    // fitBox est stable ; zp change d'identité à chaque render → hors deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, matches])

  const { scale, tx, ty } = zp.transform

  const fitAll = () => {
    markInteracted()
    if (driver && shownRef.current) zp.fitBox(nodesBox(shownRef.current.nodes), 1)
    else zp.fit()
  }

  return (
    <div className="relative h-full w-full">
      <ZoomControls
        onZoomOut={() => { markInteracted(); zp.zoomBy(1 / ZOOM_STEP) }}
        onFit={fitAll}
        onReset={() => { markInteracted(); zp.reset() }}
        onZoomIn={() => { markInteracted(); zp.zoomBy(ZOOM_STEP) }}
      />

      {truncated && (
        <div className="absolute left-3 top-3 z-10 rounded-surface border border-border bg-foreground px-2.5 py-1 text-[11px] text-textsoft shadow-sm">
          Graphe tronqué aux {KB_MAX_NODES} nœuds les plus connectés — filtre pour zoomer.
        </div>
      )}
      {searching && matches.size === 0 && (
        <div className="absolute left-3 top-3 z-10 rounded-surface border border-border bg-foreground px-2.5 py-1 text-[11px] text-textsoft shadow-sm">
          No node matches “{query}”.
        </div>
      )}

      <PoweredByGraphify />

      <div
        ref={zp.viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Knowledge graph — drag the background to pan, drag a node to move it, scroll wheel or + and − to zoom"
        className={`absolute inset-0 select-none overflow-hidden ${zp.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={zp.handlers.onPointerDown}
        onPointerMove={zp.handlers.onPointerMove}
        onPointerUp={zp.handlers.onPointerUp}
        onPointerCancel={zp.handlers.onPointerCancel}
        onKeyDown={zp.handlers.onKeyDown}
        onPointerDownCapture={markInteracted}
        onWheelCapture={markInteracted}
        onKeyDownCapture={markInteracted}
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
            {/* overflow-visible (#319) : les positions de la sim ne sont plus
                bornées à la boîte — un nœud au-delà doit rester dessiné. */}
            <svg className="absolute inset-0 overflow-visible" width={shown.width} height={shown.height}>
              {driver ? (
                <LiveEdgesLayer driver={driver} dim={focus !== null} />
              ) : (
                <>
                  {basePaths && <EdgesLayer solid={basePaths.solid} dashed={basePaths.dashed} dim={focus !== null} />}
                  {focusPaths && (
                    <g pointerEvents="none" stroke="var(--color-neutral-900)" strokeOpacity={0.8} strokeWidth={1.5} fill="none">
                      {focusPaths.solid && <path d={focusPaths.solid} vectorEffect="non-scaling-stroke" />}
                      {focusPaths.dashed && <path d={focusPaths.dashed} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                    </g>
                  )}
                </>
              )}
              <NodesLayer
                nodes={view.nodes}
                placed={shown.nodes}
                driver={driver}
                initialIds={initialIds}
                epoch={revealEpoch}
                focus={focus}
                selected={selected}
                adj={adj}
                matches={matches}
                searching={searching}
                onFocus={setFocus}
                onOpen={onNodeClick}
                onNodeDown={onNodePointerDown}
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Layout STATIQUE asynchrone (reduced-motion) : lit le cache module
 * (synchrone), sinon rejoint/lance un job en tranches (kbLayoutCache — partagé
 * avec le préchauffage de KbContext). `graph: null` = pipeline live, inactif.
 */
function useKbStaticLayout(
  graph: KbGraphData | null,
  fKey: string,
  view: { nodes: KbNode[]; edges: KbEdge[] },
): KbLayoutResult | null {
  const [ready, setReady] = useState<{ key: string; layout: KbLayoutResult } | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const cached = graph ? cachedKbLayout(graph, fKey) : null
  useEffect(() => {
    if (!graph || cachedKbLayout(graph, fKey)) return
    return ensureKbLayout(graph, fKey, layoutInput(viewRef.current), (layout) => setReady({ key: fKey, layout }))
  }, [graph, fKey])
  if (!graph) return null
  return cached ?? (ready?.key === fKey ? ready.layout : null)
}

/** Les 2214 arêtes de base = 2 <path> (pipeline statique — React écrit `d`).
 *  Ne re-rend que si le graphe ou l'état binaire dim change. */
const EdgesLayer = memo(function EdgesLayer({
  solid, dashed, dim,
}: { solid: string; dashed: string; dim: boolean }) {
  return (
    <g
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

/**
 * Arêtes du pipeline LIVE : React monte 4 <path> VIDES (base plein/pointillé +
 * surcouche de survol) et n'écrit JAMAIS leurs `d` — le pilote les possède et
 * les met à jour à chaque tick. Seuls les props de trait (dim) passent par
 * React. `kb-edges-in` : fondu d'entrée à l'arrivée (CSS, une fois).
 */
const LiveEdgesLayer = memo(function LiveEdgesLayer({ driver, dim }: { driver: KbSimDriver; dim: boolean }) {
  return (
    <>
      <g
        className="kb-edges-in"
        pointerEvents="none"
        fill="none"
        stroke={dim ? 'var(--color-neutral-200)' : 'var(--color-neutral-500)'}
        strokeOpacity={dim ? 0.6 : 0.8}
        strokeWidth={1}
      >
        <path ref={(el) => driver.attachPath('solid', el)} vectorEffect="non-scaling-stroke" />
        <path ref={(el) => driver.attachPath('dashed', el)} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </g>
      <g pointerEvents="none" stroke="var(--color-neutral-900)" strokeOpacity={0.8} strokeWidth={1.5} fill="none">
        <path ref={(el) => driver.attachPath('focusSolid', el)} vectorEffect="non-scaling-stroke" />
        <path ref={(el) => driver.attachPath('focusDashed', el)} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </g>
    </>
  )
})

/**
 * Fond des labels (#320) : gabarit du <rect> posé DERRIÈRE chaque <text> pour
 * le détacher de la densité (arêtes/nœuds sous le texte). Largeur ESTIMÉE
 * (~5.2 px/caractère à 9 px — pas de mesure DOM : 869 getComputedTextLength
 * par render coûteraient un layout thrash), le rect vit dans le <g> du nœud
 * dont le pilote possède le transform : il SUIT le nœud comme le label.
 */
const LABEL_FONT = 9
const LABEL_CHAR_W = 5.2
const LABEL_PAD_X = 4

const NodesLayer = memo(function NodesLayer({
  nodes, placed, driver, initialIds, focus, selected, adj, matches, searching, onFocus, onOpen, onNodeDown,
}: {
  nodes: KbNode[]
  placed: ReadonlyMap<string, KbPlaced>
  driver: KbSimDriver | null
  /** Nœuds de la génération initiale — pas de pop `kb-in` (perf + redondant). */
  initialIds: ReadonlySet<string>
  /** #317 — compteur de lots entrés : casse le memo pour MONTER les nouveaux
   *  <g> (le Map `placed`, muté en place, garde la même identité). Pas lu. */
  epoch: number
  focus: string | null
  /** #320 — nœud dont l'inspecteur est ouvert : accent PLEIN (langage « actif »). */
  selected: string | null
  adj: Map<string, Set<string>>
  matches: Set<string>
  searching: boolean
  onFocus: (id: string | null) => void
  onOpen: (id: string) => void
  onNodeDown: (id: string, e: React.PointerEvent<SVGCircleElement>) => void
}) {
  const inHood = (id: string): boolean =>
    focus === null || id === focus || (adj.get(focus)?.has(id) ?? false)

  /** Intensité d'un nœud : la sélection (#320) prime, puis le survol, puis la
   *  recherche, puis l'état neutre. Le plein accent est réservé au nœud
   *  SÉLECTIONNÉ — même doctrine de rareté que TagGraph/Backlog. */
  const nodeFill = (id: string): { fill: number; stroke: number; dim: boolean } => {
    if (id === selected) return { fill: 1, stroke: 1, dim: false }
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
    nodes.length <= LABEL_LIMIT
      ? true
      : id === selected || (focus !== null && inHood(id)) || matches.has(id)

  return (
    <>
      {nodes.map((node) => {
        const p = placed.get(node.id)
        if (!p) return null
        const tone = nodeFill(node.id)
        return (
          // Le <g> porte la POSITION (transform) : en live, le pilote la met à
          // jour à chaque tick via la ref — cercle et label bougent ensemble,
          // React ne réconcilie rien. Un render React (survol, recherche)
          // relit les positions COURANTES du Map muté : jamais de retour en
          // arrière. `kb-in` : pop d'insertion des ENTRANTS d'un morph.
          <g
            key={node.id}
            transform={`translate(${p.x} ${p.y})`}
            ref={driver ? (el) => driver.registerNode(node.id, el) : undefined}
          >
            {/* #320 — anneau léger du nœud SÉLECTIONNÉ (sous la pastille). */}
            {node.id === selected && (
              <circle
                cx={0} cy={0} r={p.r + 4}
                fill="none"
                stroke="var(--color-accent)"
                strokeOpacity={0.35}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {/* #385 — nœud accessible au clavier : le graphe jumeau (Deps) rend de
                vrais <button> ; ici le nœud est un <circle> SVG, on lui donne donc
                role/tabIndex/aria-label + Enter/Espace. Le clavier appelle onOpen —
                EXACTEMENT le même chemin que le clic (override #375 compris : si
                onNodeClick fourni → lui, sinon openKbNode). Plafond de tab-order :
                le sous-graphe est tronqué (KB_MAX_NODES) mais peut rester grand —
                acceptable pour lever le bloquant a11y ; roving tabindex à suivre. */}
            <circle
              cx={0} cy={0} r={p.r}
              className={driver && !initialIds.has(node.id) ? 'kb-in cursor-pointer' : 'cursor-pointer'}
              fill="var(--color-accent)"
              fillOpacity={tone.fill}
              stroke="var(--color-accent)"
              strokeOpacity={tone.stroke}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              tabIndex={0}
              role="button"
              aria-label={node.label}
              onPointerDown={driver ? (e) => onNodeDown(node.id, e) : undefined}
              onPointerEnter={() => onFocus(node.id)}
              onPointerLeave={() => onFocus(null)}
              onFocus={() => onFocus(node.id)}
              onBlur={() => onFocus(null)}
              onClick={() => onOpen(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(node.id)
                }
              }}
            >
              <title>{`${node.label} · ${node.fileType}${node.sourceFile ? ` · ${node.sourceFile}` : ''}`}</title>
            </circle>
            {showLabel(node.id) && (
              // #320 — fond semi-opaque (token carte, theme-aware) DERRIÈRE le
              // texte : le label se détache des arêtes/nœuds en densité. Le
              // rect partage le <g> du nœud (transform pilote) → il le suit.
              <>
                <rect
                  x={-(node.label.length * LABEL_CHAR_W) / 2 - LABEL_PAD_X}
                  y={p.r + 1.5}
                  width={node.label.length * LABEL_CHAR_W + LABEL_PAD_X * 2}
                  height={LABEL_FONT + 3}
                  rx={3}
                  className="pointer-events-none"
                  fill="var(--color-white)"
                  fillOpacity={0.82}
                />
                <text
                  x={0} y={p.r + 9}
                  textAnchor="middle"
                  className="pointer-events-none"
                  style={{
                    fontSize: LABEL_FONT,
                    fill: tone.dim ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)',
                  }}
                >
                  {node.label}
                </text>
              </>
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
 * Logo Graphify officiel (#335) — le PNG blanc fourni par le projet, inline en
 * masque CSS teinté via backgroundColor (ratio 1154×1363 ≈ 0.85). Remplace
 * l'ancienne approximation hexagonale dessinée à la main (#308).
 */
const GRAPHIFY_LOGO_MASK = `url(data:image/png;base64,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) center / contain no-repeat`

export function GraphifyMark({ size = 13 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: Math.round(size * 0.85),
        height: size,
        backgroundColor: GRAPHIFY_BLUE,
        WebkitMask: GRAPHIFY_LOGO_MASK,
        mask: GRAPHIFY_LOGO_MASK,
      }}
    />
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
      href="https://graphify.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-surface border border-border bg-foreground px-2.5 py-1 text-[11px] text-textsoft shadow-sm transition-colors hover:border-neutral-400 hover:text-neutral-700"
    >
      powered by
      <GraphifyMark />
      <span className="font-medium text-texthard">graphify</span>
    </a>
  )
}
