import { useEffect, useMemo, useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings, usePersistentStringFlag } from '../state/uiPersist'
import {
  computeAvailability, missingPrereqs, reverseDependents, allEpics, epicProgress,
  graphNeighborhood,
  type Availability,
} from '../lib/roadmap'
import { graphLayout, type GraphInput, type GraphPoint } from '../lib/graphLayout'
import { LockLocked } from 'trinil-react'
import { Chevron, EpicGlyph, KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { EpicBand, epicBandView } from './EpicBand'
import { epicStatusOf } from './EpicRow'
import type { TaskTree, TaskNode } from '../lib/tasks'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'
import { ZoomControls } from './ZoomControls'

/**
 * Gabarits du layout dagre — DÉRIVÉS des tokens spacing du thème (#408) : dagre
 * a besoin de NOMBRES, on lit donc --spacing-xs/s/m une fois au montage (et au
 * changement de thème) au lieu de px durs. Les hauteurs de LIGNE, elles, sont
 * des unités de CONTENU (text-sm / text-[11px]) — hors échelle spacing, comme
 * les tailles d'icônes.
 */
interface SpacingTokens { xs: number; s: number; m: number }
export interface GraphMetrics {
  /** Largeur d'une carte : contenu fixe + 2× padding horizontal (px-m). */
  cardW: number
  /** Hauteur de référence d'une carte : py-m ×2 + titre + gap-s + ligne d'état. */
  cardH: number
  /** Ligne membre d'un nœud-epic déplié (py-xs ×2 + ligne text-sm). */
  memberH: number
  /** Socle d'une carte tâche : padding + titre + gap-s + footer chips. */
  taskBaseH: number
  /** Une ligne d'info en plus (« Disponible »/« Prérequis », « bloque n ») + son gap. */
  taskLineH: number
}

/** Hauteurs de ligne (unités de contenu — pas des tokens spacing). */
const LINE_SM = 20
const LINE_MICRO = 14
/** Largeur de CONTENU d'une carte, hors padding (les 248px historiques − 2×12). */
const CARD_CONTENT_W = 224

/** Valeurs de base des tokens (index.css @theme) — fallback jsdom/SSR. */
const BASE_TOKENS: SpacingTokens = { xs: 4, s: 8, m: 12 }

/** Dérivation pure tokens → gabarits (au thème de base : 248/72/28/66/22, inchangé). */
export function graphMetrics(t: SpacingTokens): GraphMetrics {
  return {
    cardW: CARD_CONTENT_W + 2 * t.m,
    cardH: 2 * t.m + LINE_SM + t.s + LINE_SM,
    memberH: 2 * t.xs + LINE_SM,
    taskBaseH: 2 * t.m + LINE_SM + t.s + LINE_MICRO,
    taskLineH: t.s + LINE_MICRO,
  }
}

const BASE_METRICS = graphMetrics(BASE_TOKENS)

/** Lit les tokens spacing effectifs du thème courant sur `<html>`. */
function readSpacingTokens(): SpacingTokens {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return BASE_TOKENS
  const cs = getComputedStyle(document.documentElement)
  const px = (name: keyof SpacingTokens): number => {
    const v = parseFloat(cs.getPropertyValue(`--spacing-${name}`))
    return Number.isFinite(v) && v > 0 ? v : BASE_TOKENS[name]
  }
  return { xs: px('xs'), s: px('s'), m: px('m') }
}

/**
 * Gabarits RÉACTIFS au thème : relus quand `data-theme` / `data-theme-name`
 * change sur `<html>` (un thème peut redéfinir l'échelle spacing — github).
 */
function useGraphMetrics(): GraphMetrics {
  const [tokens, setTokens] = useState<SpacingTokens>(readSpacingTokens)
  useEffect(() => {
    const update = () => setTokens((cur) => {
      const next = readSpacingTokens()
      return next.xs === cur.xs && next.s === cur.s && next.m === cur.m ? cur : next
    })
    update()
    if (typeof MutationObserver !== 'function') return
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-theme-name'] })
    return () => mo.disconnect()
  }, [])
  return useMemo(() => graphMetrics(tokens), [tokens])
}

/**
 * Nœud du graphe (#135) : une tâche à plat OU un EPIC — les tâches portant un
 * epic n'ont plus de carte propre, elles vivent dans le nœud-groupe de leur
 * epic. Le nœud-epic est UN SEUL nœud pour tout l'epic (l'unité du graphe est
 * la dépendance, pas le stage) : ses arêtes = l'union des dépendances externes
 * de ses membres. Le dépliage (persisté par slug) révèle les membres EN PLACE,
 * en lignes compactes dans le nœud.
 */
type GNode =
  | { key: string; kind: 'task'; task: TaskNode }
  | { key: string; kind: 'epic'; slug: string; title: string; tasks: TaskNode[] }

/** Prérequis manquant SANS carte propre (#138) : rangé dans un nœud-epic (titre
    connu) ou réellement hors vue (done masqué) — epicTitle null. */
interface HiddenPrereq {
  id: number
  epicTitle: string | null
}

/** Détail lisible des prérequis sans carte propre — tooltip du libellé « Prérequis
    manquants » (#138) : dit OÙ vit chaque #id au lieu d'un « +n hors graphe » muet. */
export function hiddenPrereqNote(hidden: HiddenPrereq[]): string {
  return hidden
    .map((h) => `#${h.id} — ${h.epicTitle ? `in epic “${h.epicTitle}”` : 'out of view (hidden)'}`)
    .join(' · ')
}

/**
 * Path SVG d'une arête : la polyligne dagre, chaque sommet interne adouci par
 * un quart de courbe (Q) de rayon fixe — coins nets mais pas anguleux,
 * cohérent avec l'esthétique « filets » de design.md. Pur, testé à part.
 */
export function roundedEdgePath(points: GraphPoint[], radius = 8): string {
  if (points.length === 0) return ''
  const f = (n: number) => Math.round(n * 100) / 100
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1]
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y)
    if (inLen === 0 || outLen === 0) continue
    const rIn = Math.min(radius, inLen / 2), rOut = Math.min(radius, outLen / 2)
    const a = { x: cur.x - ((cur.x - prev.x) / inLen) * rIn, y: cur.y - ((cur.y - prev.y) / inLen) * rIn }
    const b = { x: cur.x + ((next.x - cur.x) / outLen) * rOut, y: cur.y + ((next.y - cur.y) / outLen) * rOut }
    d += ` L ${f(a.x)} ${f(a.y)} Q ${f(cur.x)} ${f(cur.y)} ${f(b.x)} ${f(b.y)}`
  }
  if (points.length > 1) {
    const last = points[points.length - 1]
    d += ` L ${f(last.x)} ${f(last.y)}`
  }
  return d
}

interface GraphNodeModel {
  node: GNode
  /** Hauteur estimée passée à dagre (nœud-epic déplié plus haut qu'une carte). */
  h: number
  state: Availability
  missing: number[]
  /** Prérequis manquants sans carte propre, avec leur localisation (#138). */
  hidden: HiddenPrereq[]
  blocksCount: number
  /** Le stage n'est PLUS le layout (graph-v2) : simple métadonnée, chip sur la
      carte. Null pour un nœud-epic (ses membres peuvent traverser des stages). */
  stage: string | null
}

interface GraphModel {
  nodes: GraphNodeModel[]
  /** Arêtes entre unités du graphe (deps des membres remappées, dédupliquées). */
  edges: Array<{ from: string; to: string }>
  /** Entrée du layout — identité STABLE (useMemo) : la clé du mémo de graphLayout. */
  input: GraphInput
  avail: Map<number, Availability>
}

const taskHeight = (g: GraphMetrics, state: Availability, blocksCount: number): number =>
  Math.max(g.cardH, g.taskBaseH + (state !== 'done' ? g.taskLineH : 0) + (blocksCount > 0 ? g.taskLineH : 0))

const epicHeight = (g: GraphMetrics, n: Extract<GNode, { kind: 'epic' }>, expandedEpics: string[]): number =>
  expandedEpics.includes(n.slug) ? g.cardH + 1 + n.tasks.length * g.memberH + 4 : g.cardH

/**
 * Sélection des nœuds + arêtes (logique conservée de la v1) :
 * done masqués sauf s'ils sont prérequis transitifs d'un ticket visible,
 * membres d'epic fusionnés en nœuds-groupe. Le PLACEMENT, lui, est parti dans
 * graphLayout (dagre) — plus aucune colonne par stage ici.
 */
export function buildGraphModel(tree: TaskTree, showDone: boolean, expandedEpics: string[], metrics: GraphMetrics = BASE_METRICS): GraphModel {
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const avail = computeAvailability(tree)
  // « Build Stage » → chip « Build » : la métadonnée reste courte sur la carte.
  const stageChip = new Map(sections.map((s) => [s.key, s.title.replace(/\s*Stage$/i, '')]))
  // Tâches candidates = premier niveau des sections actives.
  let taskEntries = sections.flatMap((s) => s.tasks.map((t) => ({ task: t, sectionKey: s.key })))
  if (!showDone) {
    // Done masqués SAUF s'ils sont dépendances (transitives) d'un ticket
    // visible — les arêtes du graphe restent intègres.
    const byId = new Map(taskEntries.map((n) => [n.task.id, n.task]))
    const keep = new Set(taskEntries.filter((n) => n.task.status !== 'done').map((n) => n.task.id))
    let grew = true
    while (grew) {
      grew = false
      for (const id of [...keep]) {
        for (const dep of byId.get(id)?.dependsOn ?? []) {
          if (byId.has(dep) && !keep.has(dep)) { keep.add(dep); grew = true }
        }
      }
    }
    taskEntries = taskEntries.filter((n) => keep.has(n.task.id))
  }

  // ── Fusion des membres d'epic en nœuds-groupe ────────────────────────────
  const epicTitles = new Map(allEpics(tree).map((e) => [e.slug, e.title]))
  const gnodes: GNode[] = []
  /** id de tâche visible → clé du nœud qui la porte (elle-même, ou son epic). */
  const nodeKeyOfTask = new Map<number, string>()
  const epicNodes = new Map<string, Extract<GNode, { kind: 'epic' }>>()
  const stageOfKey = new Map<string, string>()
  for (const { task, sectionKey } of taskEntries) {
    if (task.epic === null) {
      const key = `t:${task.id}`
      gnodes.push({ key, kind: 'task', task })
      nodeKeyOfTask.set(task.id, key)
      const chip = stageChip.get(sectionKey)
      if (chip) stageOfKey.set(key, chip)
    } else {
      const key = `e:${task.epic}`
      let en = epicNodes.get(task.epic)
      if (!en) {
        en = { key, kind: 'epic', slug: task.epic, title: epicTitles.get(task.epic) ?? task.epic, tasks: [] }
        epicNodes.set(task.epic, en)
        gnodes.push(en)
      }
      en.tasks.push(task)
      nodeKeyOfTask.set(task.id, key)
    }
  }

  // Dépendances au niveau NŒUD : deps des membres remappées vers les clés de
  // nœud, internes exclues, dédupliquées. (Deux epics entremêlés peuvent créer
  // un cycle au niveau nœud — graphLayout le casse défensivement.)
  const edges: Array<{ from: string; to: string }> = []
  const seenEdges = new Set<string>()
  for (const n of gnodes) {
    const members = n.kind === 'task' ? [n.task] : n.tasks
    for (const m of members) {
      for (const d of m.dependsOn) {
        const k = nodeKeyOfTask.get(d)
        if (!k || k === n.key) continue
        const sig = `${k}->${n.key}`
        if (seenEdges.has(sig)) continue
        seenEdges.add(sig)
        edges.push({ from: k, to: n.key })
      }
    }
  }

  const standaloneIds = new Set(gnodes.flatMap((n) => (n.kind === 'task' ? [n.task.id] : [])))
  const nodes: GraphNodeModel[] = gnodes.map((n) => {
    if (n.kind === 'epic') {
      return { node: n, h: epicHeight(metrics, n, expandedEpics), state: 'available' as const, missing: [], hidden: [], blocksCount: 0, stage: null }
    }
    const t = n.task
    const state = avail.get(t.id) ?? 'available'
    // Prérequis non faits (source partagée avec le mode Colonnes). TOUS les
    // #id sont cités (#138) ; ceux sans carte propre (rangés dans un nœud-epic
    // ou hors vue) portent leur localisation, restituée en tooltip.
    const allMissing = missingPrereqs(t, avail)
    const missing = allMissing.filter((d) => standaloneIds.has(d))
    const hidden = allMissing.filter((d) => !standaloneIds.has(d)).map((d): HiddenPrereq => {
      const key = nodeKeyOfTask.get(d)
      const slug = key?.startsWith('e:') ? key.slice(2) : null
      return { id: d, epicTitle: slug ? (epicTitles.get(slug) ?? slug) : null }
    })
    const blocksCount = t.kind === 'milestone' ? reverseDependents(tree, t.id).length : 0
    return { node: n, h: taskHeight(metrics, state, blocksCount), state, missing, hidden, blocksCount, stage: stageOfKey.get(n.key) ?? null }
  })

  const input: GraphInput = {
    nodes: nodes.map((m) => ({ id: m.node.key, width: metrics.cardW, height: m.h })),
    edges,
  }
  return { nodes, edges, input, avail }
}

/** Ensemble vide stable (identité constante) : le cas « aucun filtre epic ». */
const NO_BORDERS: ReadonlySet<string> = new Set()

/**
 * Filtre le modèle sur un epic sélectionné (#343) — même geste que la bande
 * d'epics de la vue Colonnes, porté au graphe. On ne garde QUE le nœud-epic +
 * ses voisins DIRECTS (frontières hors-epic, en amont ET en aval) et les
 * arêtes qui les relient à l'epic ; tout le reste disparaît. Les frontières
 * sont retournées à part pour être rendues estompées (DimVeil) — le contexte
 * des bords sans le bruit du graphe entier. Fonction pure, testée à part.
 *
 * `epicKey` absent du modèle (epic tout-done masqué) → géré en amont : on
 * n'appelle pas le filtre, le graphe complet reste affiché.
 */
export function filterGraphToEpic(
  model: GraphModel,
  epicKey: string,
): { model: GraphModel; borderKeys: ReadonlySet<string> } {
  const edges = model.edges.filter((e) => e.from === epicKey || e.to === epicKey)
  const borderKeys = new Set<string>()
  for (const e of edges) {
    if (e.from !== epicKey) borderKeys.add(e.from)
    if (e.to !== epicKey) borderKeys.add(e.to)
  }
  const keep = new Set<string>([epicKey, ...borderKeys])
  const nodes = model.nodes.filter((m) => keep.has(m.node.key))
  const input: GraphInput = {
    // Les largeurs/hauteurs (dérivées des tokens) sont REPRISES du modèle
    // complet — pas de re-dérivation ici, filtre pur.
    nodes: model.input.nodes.filter((n) => keep.has(n.id)),
    edges,
  }
  return { model: { nodes, edges, input, avail: model.avail }, borderKeys }
}

/** Ton d'une arête sous surlignage : sur le chemin amont/aval, hors chemin, neutre. */
type EdgeTone = 'default' | 'strong' | 'dim'

const EDGE_STROKE: Record<EdgeTone, string> = { default: 'var(--color-textsoft)', strong: 'var(--color-texthard)', dim: 'var(--color-border)' }
const EDGE_MARKER: Record<EdgeTone, string> = { default: 'url(#rm-arrow)', strong: 'url(#rm-arrow-strong)', dim: 'url(#rm-arrow-dim)' }

/**
 * Style d'un trait d'arête selon son ton. Grammaire du pointillé unifiée
 * (#386) : les dépendances sont des liens EXPLICITES (dependsOn) → trait PLEIN
 * — le pointillé reste réservé à l'inféré/incertain (KbGraph). L'emphase du
 * chemin survolé ne passe donc PLUS par plein-vs-pointillé mais par la COULEUR
 * (neutral-900 fort / neutral-500 base / neutral-200 atténué), l'ÉPAISSEUR
 * (1.5 emphase / 1 base — échelle unique de la data-viz) et la flèche teintée.
 * `non-scaling-stroke` : le graphe est zoomable, le trait doit rester constant.
 * Pur, testé à part.
 */
export function edgeStyle(tone: EdgeTone): { stroke: string; strokeWidth: number; markerEnd: string } {
  return { stroke: EDGE_STROKE[tone], strokeWidth: tone === 'strong' ? 1.5 : 1, markerEnd: EDGE_MARKER[tone] }
}

/**
 * Vue achievement : layout FLUX-DE-DÉPENDANCES (dagre, prérequis → dépendant).
 * La bande d'epics (#343) coiffe le graphe comme en vue Colonnes : mêmes cartes,
 * même sélection/désélection, MÊME état (remonté à RoadmapView) — passer d'une
 * vue à l'autre conserve le filtre. Epic sélectionné → le graphe ne rend que ses
 * tâches + leurs dépendances directes hors-epic, estompées.
 */
export function RoadmapGraph({ showDone, epicFilter, onEpicFilter }: {
  showDone: boolean
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  const { tree } = useTree()
  if (!tree) return null
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  if (sections.every((s) => s.tasks.length === 0)) {
    return (
      <div className="px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))] text-sm text-textsoft">
        Nothing to display — the graph is built from tasks and their dependencies.
      </div>
    )
  }
  const { items, doneItems, selected } = epicBandView(tree, showDone, epicFilter)
  return (
    <div className="flex h-full flex-col">
      <EpicBand items={items} doneItems={doneItems} selected={selected} onSelect={onEpicFilter} />
      <div className="relative min-h-0 flex-1">
        <GraphCanvas tree={tree} showDone={showDone} selected={selected} />
      </div>
    </div>
  )
}

function GraphCanvas({ tree, showDone, selected }: { tree: TaskTree; showDone: boolean; selected: string | null }) {
  // Épics dépliés (partagé avec les cartes EpicGraphNode) : la hauteur d'un nœud
  // déplié participe au layout, le composant racine doit donc s'y abonner.
  const [expandedEpics] = usePersistentStrings('graph:epics')
  // Le modèle complet (nœuds + arêtes + GraphInput) n'est reconstruit qu'à une
  // écriture ou un toggle — jamais au hover/zoom/pan. graphLayout est de plus
  // mémoïsé par identité d'input (WeakMap) : dagre ne tourne qu'une fois par modèle.
  // Un epic filtré est TOUJOURS déplié (#343) : le filtre sert à voir ses tâches,
  // un chip replié n'aurait aucun sens — sans toucher à l'état persistant.
  const effectiveExpanded = useMemo(
    () => (selected && !expandedEpics.includes(selected) ? [...expandedEpics, selected] : expandedEpics),
    [expandedEpics, selected],
  )
  // Gabarits dagre dérivés des tokens spacing du thème courant (#408) : un
  // changement de thème (échelle redéfinie) reconstruit le modèle, donc le layout.
  const metrics = useGraphMetrics()
  const fullModel = useMemo(() => buildGraphModel(tree, showDone, effectiveExpanded, metrics), [tree, showDone, effectiveExpanded, metrics])
  // Filtre epic (#343) : post-étape PURE sur le modèle complet — l'epic + ses
  // frontières directes. Absent du modèle (epic tout-done masqué) → pas de
  // filtre, graphe complet. NO_BORDERS a une identité stable (pas de re-render).
  const epicKey = selected ? `e:${selected}` : null
  const { model, borderKeys } = useMemo(() => {
    if (epicKey && fullModel.nodes.some((m) => m.node.key === epicKey)) return filterGraphToEpic(fullModel, epicKey)
    return { model: fullModel, borderKeys: NO_BORDERS }
  }, [fullModel, epicKey])
  const layout = graphLayout(model.input)
  const zp = useZoomPan(layout.width, layout.height)
  // Surlignage amont/aval : SURVOL SEUL, transitoire (décision verrouillée
  // 2026-07-08 : pas de sticky — le clic reste réservé à openTask).
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const hood = useMemo(
    () => (focusKey && model.nodes.some((m) => m.node.key === focusKey) ? graphNeighborhood(model.edges, focusKey) : null),
    [model, focusKey],
  )
  if (model.nodes.length === 0) {
    return (
      <div className="px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))] text-sm text-textsoft">
        Nothing to display — the graph is built from tasks and their dependencies.
      </div>
    )
  }
  const { scale, tx, ty } = zp.transform

  const inHood = (key: string): boolean =>
    hood === null || key === focusKey || hood.ancestors.has(key) || hood.descendants.has(key)
  // Une arête est « sur le chemin » si elle relie deux nœuds de la fermeture
  // dans le bon sens (amont vers le focus, ou focus vers l'aval) — une arête
  // directe ancêtre→descendant qui contourne le focus reste atténuée.
  const edgeTone = (from: string, to: string): EdgeTone => {
    if (hood === null || focusKey === null) return 'default'
    const upstream = hood.ancestors.has(from) && (to === focusKey || hood.ancestors.has(to))
    const downstream = (from === focusKey || hood.descendants.has(from)) && hood.descendants.has(to)
    return upstream || downstream ? 'strong' : 'dim'
  }
  const hoverProps = (key: string) => ({
    onHoverChange: (on: boolean) => setFocusKey((cur) => (on ? key : cur === key ? null : cur)),
  })

  return (
    <div className="relative h-full w-full">
      {/* Contrôles de zoom (épinglés, ne défilent pas avec le graphe) — primitive
          partagée (#382). */}
      <ZoomControls
        onZoomOut={() => zp.zoomBy(1 / ZOOM_STEP)}
        onFit={zp.fit}
        onReset={zp.reset}
        onZoomIn={() => zp.zoomBy(ZOOM_STEP)}
      />

      {/* Viewport : overflow-hidden, drag = pan (le pointerdown sur une carte
          est laissé aux boutons), molette = zoom vers le curseur (natif, dans
          le hook), clavier = flèches pan / + − zoom / 0 reset. */}
      <div
        ref={zp.viewportRef}
        tabIndex={0}
        role="application"
        aria-label="Dependency graph — drag to pan, scroll wheel or + and − to zoom"
        className={`absolute inset-0 select-none overflow-hidden ${zp.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => { if (!(e.target as Element).closest('button')) zp.handlers.onPointerDown(e) }}
        onPointerMove={zp.handlers.onPointerMove}
        onPointerUp={zp.handlers.onPointerUp}
        onPointerCancel={zp.handlers.onPointerCancel}
        onKeyDown={zp.handlers.onKeyDown}
      >
        <div
          className="relative"
          style={{ width: layout.width, height: layout.height, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          {/* Arêtes (derrière les cartes), toutes PLEINES (dépendances explicites),
              tête de flèche = direction. Le chemin amont/aval survolé se distingue
              par la couleur (neutral-900) + l'épaisseur (1.5), le reste s'atténue. */}
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
            <defs>
              <marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-textsoft)" />
              </marker>
              <marker id="rm-arrow-strong" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-texthard)" />
              </marker>
              <marker id="rm-arrow-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-border)" />
              </marker>
            </defs>
            {model.edges.map(({ from, to }) => {
              const pts = layout.edges.get(`${from}->${to}`)?.points
              if (!pts || pts.length < 2) return null
              const s = edgeStyle(edgeTone(from, to))
              return (
                <path
                  key={`${from}->${to}`}
                  d={roundedEdgePath(pts)}
                  fill="none"
                  stroke={s.stroke}
                  strokeWidth={s.strokeWidth}
                  markerEnd={s.markerEnd}
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>

          {/* Nœuds */}
          {model.nodes.map((m) => {
            const pos = layout.nodes.get(m.node.key)
            if (!pos) return null
            // Frontière d'un epic filtré (#343) : toujours estompée (contexte des
            // bords), en plus de l'atténuation hors-voisinage au survol.
            const dimmed = borderKeys.has(m.node.key) || (hood !== null && !inHood(m.node.key))
            const focused = focusKey === m.node.key
            return m.node.kind === 'task' ? (
              <GraphCard key={m.node.key} model={m} task={m.node.task} pos={pos} dimmed={dimmed} focused={focused} {...hoverProps(m.node.key)} />
            ) : (
              <EpicGraphNode key={m.node.key} epic={m.node} pos={pos} avail={model.avail} dimmed={dimmed} focused={focused} {...hoverProps(m.node.key)} />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Voile d'atténuation hors-voisinage : le fond des cartes reste OPAQUE (pas
    d'opacity sur le conteneur, sinon les arêtes transparaissent) — on pose un
    voile blanc par-dessus l'encre, monochrome et sans nouvelle couleur. */
function DimVeil() {
  return <span aria-hidden className="pointer-events-none absolute inset-0 bg-foreground/70" />
}

interface NodeChrome {
  pos: { x: number; y: number; w: number; h: number }
  dimmed: boolean
  focused: boolean
  /** Survol/focus clavier → surlignage amont/aval transitoire dans le parent. */
  onHoverChange: (on: boolean) => void
}

function GraphCard({ model, task, pos, dimmed, focused, onHoverChange }: NodeChrome & { model: GraphNodeModel; task: TaskNode }) {
  const { state } = model
  const { openTask, top } = usePanel()
  // Fond blanc TOUJOURS opaque ; l'état estompé s'exprime par la bordure et
  // l'encre. Tâche ouverte dans le panneau → bordure accent (#36).
  const isOpenInPanel = top?.type === 'task' && top.id === task.id
  // Bordure en RING (box-shadow inset, zéro largeur de layout — #395). Langage
  // unique : courant = fond Active ; focalisé (clavier/graphe) = ring ACCENT (le
  // token de focus/attention) ; défaut = ring Border + survol = fond Rollover.
  // JAMAIS de bordure animée au survol (décision Rémi).
  const skin = isOpenInPanel
    ? 'bg-active ring-1 ring-inset ring-border'
    : focused
      ? 'bg-foreground ring-1 ring-inset ring-accent'
      : 'bg-foreground ring-1 ring-inset ring-border transition-colors hover:bg-rollover'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-textsoft line-through' : dim ? 'text-textsoft' : 'text-texthard'
  // Halo de voisinage (ring accent + estompe) piloté au POINTEUR seulement : au
  // clavier, l'outline :focus-visible global suffit — un ring accent EN PLUS
  // ferait un double indicateur de focus (#395).
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      className={`absolute flex flex-col gap-s overflow-hidden rounded-listitem px-m py-m text-left ${skin}`}
      style={{ left: pos.x, top: pos.y, width: pos.w, minHeight: pos.h }}>
      <div className="flex items-center gap-s">
        {state === 'locked'
          ? <LockLocked size={11} className="shrink-0 text-textsoft" ariaLabel="Locked" />
          : <KindGlyph task={task} />}
        <span className="shrink-0 font-mono text-xs text-textsoft">#{task.id}</span>
        <span className={`min-w-0 truncate text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {state === 'locked' ? (
        // #138 : tous les prérequis sont cités par #id — ceux sans carte propre
        // (dans un epic replié, hors vue) sont localisés dans le tooltip.
        <span
          className="text-[11px] text-textsoft"
          title={model.hidden.length > 0 ? hiddenPrereqNote(model.hidden) : undefined}
        >
          Missing prerequisites
          {model.missing.length + model.hidden.length > 0
            ? ` (${[...model.missing, ...model.hidden.map((h) => h.id)].map((d) => `#${d}`).join(' ')})`
            : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-texthard">Available</span>
      ) : null /* done : contenu identique aux autres états, sans lignes (cohérence) */}
      {/* Jalon (#133) : le poids du verrou, même donnée que le panneau (« Blocks »). */}
      {task.kind === 'milestone' && model.blocksCount > 0 && (
        <span className="text-[11px] text-textsoft">blocks {model.blocksCount}</span>
      )}
      {/* Footer chip : le stage devenu métadonnée (graph-v2 — le layout est le
          flux de dépendances). Même rendu que le Backlog : Chip (design.md §2). */}
      {model.stage !== null && (
        <span className="mt-auto flex items-center gap-s pt-xs">
          <Chip label={model.stage} />
        </span>
      )}
      {dimmed && <DimVeil />}
    </button>
  )
}

/**
 * Nœud-EPIC du graphe (#135) : en-tête au gabarit d'une carte (chevron + carré
 * EpicGlyph + titre font-medium + n tâches + complétion GLOBALE), déplié EN
 * PLACE — les membres deviennent des lignes compactes cliquables (→ panneau)
 * DANS le nœud. Le dépliage change la hauteur du nœud, donc le layout dagre
 * (reconstruit, mémoïsé par input). Pas de <button> imbriqué : l'en-tête est
 * LE trigger (aria-expanded), chaque membre est un bouton frère.
 * `data-panel-open` reproduit l'attribut Base UI pour que la rotation `.chev`
 * (index.css) s'applique à l'identique.
 */
function EpicGraphNode({ epic, pos, avail, dimmed, focused, onHoverChange }: NodeChrome & {
  epic: Extract<GNode, { kind: 'epic' }>
  avail: Map<number, Availability>
}) {
  const { tree } = useTree()
  const { openTask, top } = usePanel()
  const [open, setOpen] = usePersistentStringFlag('graph:epics', epic.slug)
  if (!tree) return null
  const progress = epicProgress(tree, epic.slug)
  const partial = epic.tasks.length < progress.total
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  // PAS d'overflow-hidden : il clipperait l'outline :focus-visible des boutons
  // internes (en-tête + membres) → focus clavier invisible. Le rayon arrondit déjà
  // le fond propre du nœud ; le padding du bloc membres écarte leurs coins du bas
  // arrondi. Halo au POINTEUR seulement (pas onFocus) pour ne pas doubler l'outline.
  return (
    <div
      data-focused={focused ? '' : undefined}
      className={`rm-node absolute transition-colors ${focused ? '' : 'hover:bg-rollover'}`}
      style={{ left: pos.x, top: pos.y, width: pos.w }}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-panel-open={open ? '' : undefined}
        title={epic.title}
        // Pas de minHeight figé (#408) : padding tokens + le contenu (2 lignes)
        // déterminent la hauteur — l'estimation dagre (cardH) reste dérivée des
        // MÊMES tokens, elles bougent ensemble au changement de thème.
        className="flex w-full flex-col gap-s px-m py-s text-left"
      >
        <div className="flex items-center gap-s">
          <Chevron />
          <EpicGlyph status={epicStatusOf(progress, epic.tasks)} />
          <span className="min-w-0 truncate text-sm font-medium text-texthard">{epic.title}</span>
        </div>
        {/* Indente la 2e ligne pour la glisser sous le titre, en dégageant le
            cluster chevron+glyph de la ligne du dessus (Chevron 11 + gap-s 8 +
            EpicGlyph 10 = ~29). L'ancien 26px arbitraire → spacing-xl (24px),
            sur la grille, visuellement identique (le compte/jauge reste calé
            juste avant le titre). */}
        <div className="flex items-center gap-s pl-xl">
          <span className="shrink-0 text-[11px] text-textsoft">
            {epic.tasks.length} task{epic.tasks.length === 1 ? '' : 's'}{partial ? ' here' : ''}
          </span>
          {/* Piste de jauge en flex-1 borné (#408) — plus de largeur figée : elle
              remplit l'espace restant de la rangée, clampée à sa largeur historique. */}
          <span className="flex min-w-0 flex-1 items-center justify-end gap-s">
            <span aria-hidden className="h-1 min-w-0 max-w-14 flex-1 overflow-hidden rounded-round bg-border">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span
              className="font-mono text-[11px] text-textsoft"
              title={`Epic overall completion: ${progress.done}/${progress.total}`}
            >
              {progress.done}/{progress.total}
            </span>
            <span className="sr-only">, {progress.done} of {progress.total} tasks done</span>
          </span>
        </div>
      </button>
      {open && (
        <div className="shadow-[inset_0_1px_0_var(--color-border)]">
          {epic.tasks.map((t) => {
            const st = avail.get(t.id) ?? 'available'
            const isOpenInPanel = top?.type === 'task' && top.id === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTask(t.id)}
                title={t.title}
                // last:rounded-b-listitem : le fond du dernier membre épouse le coin
                // bas arrondi de la carte (sans overflow-hidden, qui clipperait le focus).
                // Pas de height figé (#408) : py-xs + la ligne de texte font la
                // hauteur — l'estimation dagre (memberH) dérive des mêmes tokens.
                className={`flex w-full items-center gap-s px-m py-xs text-left last:rounded-b-listitem ${isOpenInPanel ? 'bg-active' : 'hover:bg-rollover'}`}
              >
                {st === 'locked'
                  ? <LockLocked size={11} className="shrink-0 text-textsoft" ariaLabel="Locked" />
                  : <KindGlyph task={t} />}
                <span className="shrink-0 font-mono text-xs text-textsoft">#{t.id}</span>
                <span className={`min-w-0 truncate text-sm ${t.status === 'done' ? 'text-textsoft line-through' : 'text-texthard'}`}>
                  {t.title}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {dimmed && <DimVeil />}
    </div>
  )
}
