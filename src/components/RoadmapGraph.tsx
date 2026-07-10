import { useMemo, useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings, usePersistentStringFlag } from '../state/uiPersist'
import {
  computeAvailability, missingPrereqs, reverseDependents, allEpics, epicProgress,
  graphLayout, graphNeighborhood,
  type Availability, type GraphInput, type GraphPoint,
} from '../lib/roadmap'
import { LockLocked } from 'trinil-react'
import { Chevron, EpicGlyph, KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { epicStatusOf } from './EpicRow'
import type { TaskTree, TaskNode } from '../lib/tasks'
import { useZoomPan, ZOOM_STEP } from './useZoomPan'

const CARD_W = 248, CARD_H = 72
/** Hauteur d'une ligne membre dans un nœud-epic déplié (px-3 py-1 + text-sm). */
const MEMBER_H = 28
/** Estimation de hauteur d'une carte tâche : socle (padding + titre + footer chips)… */
const TASK_BASE_H = 66
/** …+ une ligne de texte par info (état « Disponible »/« Prérequis », « bloque n »). */
const TASK_LINE_H = 22

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

const taskHeight = (state: Availability, blocksCount: number): number =>
  Math.max(CARD_H, TASK_BASE_H + (state !== 'done' ? TASK_LINE_H : 0) + (blocksCount > 0 ? TASK_LINE_H : 0))

const epicHeight = (n: Extract<GNode, { kind: 'epic' }>, expandedEpics: string[]): number =>
  expandedEpics.includes(n.slug) ? CARD_H + 1 + n.tasks.length * MEMBER_H + 4 : CARD_H

/**
 * Sélection des nœuds + arêtes (logique conservée de la v1) :
 * done masqués sauf s'ils sont prérequis transitifs d'un ticket visible,
 * membres d'epic fusionnés en nœuds-groupe. Le PLACEMENT, lui, est parti dans
 * graphLayout (dagre) — plus aucune colonne par stage ici.
 */
function buildGraphModel(tree: TaskTree, showDone: boolean, expandedEpics: string[]): GraphModel {
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
      return { node: n, h: epicHeight(n, expandedEpics), state: 'available' as const, missing: [], hidden: [], blocksCount: 0, stage: null }
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
    return { node: n, h: taskHeight(state, blocksCount), state, missing, hidden, blocksCount, stage: stageOfKey.get(n.key) ?? null }
  })

  const input: GraphInput = {
    nodes: nodes.map((m) => ({ id: m.node.key, width: CARD_W, height: m.h })),
    edges,
  }
  return { nodes, edges, input, avail }
}

/** Ton d'une arête sous surlignage : sur le chemin amont/aval, hors chemin, neutre. */
type EdgeTone = 'default' | 'strong' | 'dim'

const EDGE_STROKE: Record<EdgeTone, string> = { default: 'var(--color-neutral-500)', strong: 'var(--color-neutral-900)', dim: 'var(--color-neutral-200)' }
const EDGE_MARKER: Record<EdgeTone, string> = { default: 'url(#rm-arrow)', strong: 'url(#rm-arrow-strong)', dim: 'url(#rm-arrow-dim)' }

/** Vue achievement : layout FLUX-DE-DÉPENDANCES (dagre, prérequis → dépendant). */
export function RoadmapGraph({ showDone }: { showDone: boolean }) {
  const { tree } = useTree()
  if (!tree) return null
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  if (sections.every((s) => s.tasks.length === 0)) {
    return (
      <div className="px-6 py-8 text-sm text-neutral-500">
        Nothing to display — the graph is built from tasks and their dependencies.
      </div>
    )
  }
  return <GraphCanvas tree={tree} showDone={showDone} />
}

function GraphCanvas({ tree, showDone }: { tree: TaskTree; showDone: boolean }) {
  // Épics dépliés (partagé avec les cartes EpicGraphNode) : la hauteur d'un nœud
  // déplié participe au layout, le composant racine doit donc s'y abonner.
  const [expandedEpics] = usePersistentStrings('graph:epics')
  // Le modèle (nœuds + arêtes + GraphInput) n'est reconstruit qu'à une écriture
  // ou un toggle — jamais au hover/zoom/pan. graphLayout est de plus mémoïsé
  // par identité d'input (WeakMap) : dagre ne tourne qu'une fois par modèle.
  const model = useMemo(() => buildGraphModel(tree, showDone, expandedEpics), [tree, showDone, expandedEpics])
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
      <div className="px-6 py-8 text-sm text-neutral-500">
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
      {/* Contrôles de zoom (épinglés, ne défilent pas avec le graphe) */}
      <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm">
        <button type="button" onClick={() => zp.zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out"
          className="px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100">−</button>
        <button type="button" onClick={zp.fit}
          className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100">Fit</button>
        <button type="button" onClick={zp.reset} aria-label="Reset zoom to 100%"
          className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100">100 %</button>
        <button type="button" onClick={() => zp.zoomBy(ZOOM_STEP)} aria-label="Zoom in"
          className="border-l border-neutral-200 px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100">+</button>
      </div>

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
          {/* Arêtes (derrière les cartes), tête de flèche = direction. Le chemin
              amont/aval survolé passe en trait plein #171717, le reste s'atténue. */}
          <svg className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
            <defs>
              <marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-neutral-500)" />
              </marker>
              <marker id="rm-arrow-strong" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-neutral-900)" />
              </marker>
              <marker id="rm-arrow-dim" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0 0 L8 4 L0 8 z" fill="var(--color-neutral-200)" />
              </marker>
            </defs>
            {model.edges.map(({ from, to }) => {
              const pts = layout.edges.get(`${from}->${to}`)?.points
              if (!pts || pts.length < 2) return null
              const tone = edgeTone(from, to)
              return (
                <path
                  key={`${from}->${to}`}
                  d={roundedEdgePath(pts)}
                  fill="none"
                  stroke={EDGE_STROKE[tone]}
                  strokeWidth={tone === 'strong' ? 1.25 : 1}
                  strokeDasharray={tone === 'strong' ? undefined : '3 3'}
                  markerEnd={EDGE_MARKER[tone]}
                />
              )
            })}
          </svg>

          {/* Nœuds */}
          {model.nodes.map((m) => {
            const pos = layout.nodes.get(m.node.key)
            if (!pos) return null
            const dimmed = hood !== null && !inHood(m.node.key)
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
  return <span aria-hidden className="pointer-events-none absolute inset-0 bg-white/70" />
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
  // Sélection = langage du Backlog (fond + filet gauche) ; nœud focalisé
  // (survol) → contour neutral-900 ; hover ≠ sélection.
  const skin = isOpenInPanel
    ? 'border border-neutral-200 bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]'
    : focused
      ? 'border border-neutral-900 bg-white'
      : 'border border-neutral-200 bg-white hover:border-neutral-400'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-neutral-500 line-through' : dim ? 'text-neutral-500' : 'text-neutral-900'
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) onHoverChange(true) }}
      onBlur={() => onHoverChange(false)}
      className={`absolute flex flex-col gap-1.5 px-3 py-2.5 text-left ${skin}`}
      style={{ left: pos.x, top: pos.y, width: pos.w, minHeight: pos.h }}>
      <div className="flex items-center gap-2">
        {state === 'locked'
          ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Locked" />
          : <KindGlyph task={task} />}
        <span className="shrink-0 font-mono text-xs text-neutral-500">#{task.id}</span>
        <span className={`min-w-0 truncate text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {state === 'locked' ? (
        // #138 : tous les prérequis sont cités par #id — ceux sans carte propre
        // (dans un epic replié, hors vue) sont localisés dans le tooltip.
        <span
          className="text-[11px] text-neutral-500"
          title={model.hidden.length > 0 ? hiddenPrereqNote(model.hidden) : undefined}
        >
          Missing prerequisites
          {model.missing.length + model.hidden.length > 0
            ? ` (${[...model.missing, ...model.hidden.map((h) => h.id)].map((d) => `#${d}`).join(' ')})`
            : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Available</span>
      ) : null /* done : contenu identique aux autres états, sans lignes (cohérence) */}
      {/* Jalon (#133) : le poids du verrou, même donnée que le panneau (« Blocks »). */}
      {task.kind === 'milestone' && model.blocksCount > 0 && (
        <span className="text-[11px] text-neutral-500">blocks {model.blocksCount}</span>
      )}
      {/* Footer chip : le stage devenu métadonnée (graph-v2 — le layout est le
          flux de dépendances). Même rendu que le Backlog : Chip (design.md §2). */}
      {model.stage !== null && (
        <span className="mt-auto flex items-center gap-2 pt-0.5">
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
  return (
    <div
      className={`absolute border bg-white ${focused ? 'border-neutral-900' : 'border-neutral-200 hover:border-neutral-400'}`}
      style={{ left: pos.x, top: pos.y, width: pos.w }}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) onHoverChange(true) }}
      onBlur={() => onHoverChange(false)}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        data-panel-open={open ? '' : undefined}
        title={epic.title}
        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left"
        style={{ minHeight: CARD_H - 2 }}
      >
        <div className="flex items-center gap-2">
          <Chevron />
          <EpicGlyph status={epicStatusOf(progress, epic.tasks)} />
          <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{epic.title}</span>
        </div>
        <div className="flex items-center gap-1.5 pl-[26px]">
          <span className="text-[11px] text-neutral-500">
            {epic.tasks.length} task{epic.tasks.length === 1 ? '' : 's'}{partial ? ' here' : ''}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-1 w-14 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span
              className="font-mono text-[11px] text-neutral-500"
              title={`Epic overall completion: ${progress.done}/${progress.total}`}
            >
              {progress.done}/{progress.total}
            </span>
            <span className="sr-only">, {progress.done} of {progress.total} tasks done</span>
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-neutral-100 pb-1">
          {epic.tasks.map((t) => {
            const st = avail.get(t.id) ?? 'available'
            const isOpenInPanel = top?.type === 'task' && top.id === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTask(t.id)}
                title={t.title}
                className={`flex w-full items-center gap-2 px-3 py-1 text-left ${isOpenInPanel ? 'bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-neutral-50'}`}
                style={{ height: MEMBER_H }}
              >
                {st === 'locked'
                  ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Locked" />
                  : <KindGlyph task={t} />}
                <span className="shrink-0 font-mono text-xs text-neutral-500">#{t.id}</span>
                <span className={`min-w-0 truncate text-sm ${t.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
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
