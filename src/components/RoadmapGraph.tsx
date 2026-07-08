import { useRef, useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings, usePersistentStringFlag } from '../state/uiPersist'
import { computeAvailability, missingPrereqs, reverseDependents, allEpics, epicProgress, type Availability } from '../lib/roadmap'
import { LockLocked } from 'trinil-react'
import { Chevron, EpicGlyph, KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { epicStatusOf } from './EpicRow'
import { TEAM_ABBR } from '../lib/tasks'
import type { TaskNode } from '../lib/tasks'
import { useShowDone } from './RoadmapView'

const COL_W = 280, COL_GAP = 32, ROW_H = 96, CARD_W = 248, CARD_H = 72, PAD = 24, HEADER_H = 40
/** Hauteur d'une ligne membre dans un nœud-epic déplié (px-3 py-1 + text-sm). */
const MEMBER_H = 28

const xOf = (col: number) => PAD + col * (COL_W + COL_GAP)
const yOf = (row: number) => PAD + HEADER_H + row * ROW_H

/**
 * Nœud du graphe (#135) : une tâche à plat OU un EPIC — les tâches portant un
 * epic n'ont plus de carte propre, elles vivent dans le nœud-groupe de leur
 * epic. Le nœud-epic est UN SEUL nœud pour tout l'epic (l'unité du graphe est
 * la dépendance, pas le stage) : il est ancré dans la colonne du stage le plus
 * amont de ses membres, ses arêtes = l'union des dépendances externes de ses
 * membres. Le dépliage (persisté par slug) révèle les membres EN PLACE, en
 * lignes compactes dans le nœud — la topologie des arêtes ne bouge pas.
 */
type GNode =
  | { key: string; kind: 'task'; task: TaskNode }
  | { key: string; kind: 'epic'; slug: string; title: string; tasks: TaskNode[] }

/** Prérequis manquant SANS carte propre (#138) : rangé dans un nœud-epic (titre
    connu) ou réellement hors vue (archivé / done masqué / quick) — epicTitle null. */
interface HiddenPrereq {
  id: number
  epicTitle: string | null
}

/** Détail lisible des prérequis sans carte propre — tooltip du libellé « Prérequis
    manquants » (#138) : dit OÙ vit chaque #id au lieu d'un « +n hors graphe » muet. */
export function hiddenPrereqNote(hidden: HiddenPrereq[]): string {
  return hidden
    .map((h) => `#${h.id} — ${h.epicTitle ? `dans l'epic « ${h.epicTitle} »` : 'hors vue (archivée ou masquée)'}`)
    .join(' · ')
}

interface PlacedNode {
  node: GNode
  col: number
  row: number
  /** Hauteur réelle estimée (nœud-epic déplié plus haut qu'une carte). */
  h: number
  state: Availability
  missing: number[]
  /** Prérequis manquants sans carte propre, avec leur localisation (#138). */
  hidden: HiddenPrereq[]
  blocksCount: number
}

/** Vue achievement : colonnes = sections du backlog, nœuds par couche de dépendance. */
export function RoadmapGraph() {
  const { tree } = useTree()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [showDone] = useShowDone()
  // Épics dépliés (partagé avec les cartes EpicGraphNode) : la hauteur d'un nœud
  // déplié participe au layout, le composant racine doit donc s'y abonner.
  const [expandedEpics] = usePersistentStrings('graph:epics')
  if (!tree) return null

  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  if (sections.every((s) => s.tasks.length === 0)) {
    return (
      <div className="px-6 py-8 text-sm text-neutral-500">
        Aucune tâche à afficher — le graphe se construit à partir des tâches et de leurs dépendances.
      </div>
    )
  }
  const avail = computeAvailability(tree)
  const colOf = new Map(sections.map((s, i) => [s.key, i]))
  // Tâches candidates = premier niveau des sections actives (quick exclus).
  let taskEntries = sections.flatMap((s) => s.tasks.filter((t) => t.kind !== 'quick').map((t) => ({ task: t, sectionKey: s.key })))
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
  const nodes: GNode[] = []
  const colOfKey = new Map<string, number>()
  /** id de tâche visible → clé du nœud qui la porte (elle-même, ou son epic). */
  const nodeKeyOfTask = new Map<number, string>()
  const epicNodes = new Map<string, Extract<GNode, { kind: 'epic' }>>()
  /** Colonnes candidates d'ancrage par epic : min des NON-terminées / max de toutes. */
  const epicCols = new Map<string, { openMin: number | null; allMax: number }>()
  for (const { task, sectionKey } of taskEntries) {
    const col = colOf.get(sectionKey)!
    if (task.epic === null) {
      const key = `t:${task.id}`
      nodes.push({ key, kind: 'task', task })
      colOfKey.set(key, col)
      nodeKeyOfTask.set(task.id, key)
    } else {
      const key = `e:${task.epic}`
      let en = epicNodes.get(task.epic)
      if (!en) {
        en = { key, kind: 'epic', slug: task.epic, title: epicTitles.get(task.epic) ?? task.epic, tasks: [] }
        epicNodes.set(task.epic, en)
        nodes.push(en)
      }
      en.tasks.push(task)
      nodeKeyOfTask.set(task.id, key)
      const c = epicCols.get(task.epic) ?? { openMin: null, allMax: col }
      c.allMax = Math.max(c.allMax, col)
      if (task.status !== 'done') c.openMin = c.openMin === null ? col : Math.min(c.openMin, col)
      epicCols.set(task.epic, c)
    }
  }
  // Ancrage (#140-B, même règle que le mode Colonnes / epicAnchorStage) : la
  // colonne du ticket NON TERMINÉ le plus amont ; un epic 100 % done (visible
  // via le toggle « terminées » ou comme dépendance) est ancré à son dernier stage.
  for (const [slug, en] of epicNodes) {
    const c = epicCols.get(slug)!
    colOfKey.set(en.key, c.openMin ?? c.allMax)
  }

  // Dépendances au niveau NŒUD : deps des membres remappées vers les clés de
  // nœud, internes exclues, dédupliquées. (Deux epics entremêlés peuvent créer
  // un cycle au niveau nœud — le calcul de profondeur est défensif.)
  const depsOf = new Map<string, Set<string>>()
  for (const n of nodes) {
    const deps = new Set<string>()
    const members = n.kind === 'task' ? [n.task] : n.tasks
    for (const m of members) {
      for (const d of m.dependsOn) {
        const k = nodeKeyOfTask.get(d)
        if (k && k !== n.key) deps.add(k)
      }
    }
    depsOf.set(n.key, deps)
  }

  // Couches topologiques au niveau nœud (même logique que topoLayers, mais sur
  // les clés de nœud — cycle et clé inconnue traités défensivement).
  const depthCache = new Map<string, number>()
  const depthOf = (key: string, stack: Set<string>): number => {
    if (depthCache.has(key)) return depthCache.get(key)!
    if (stack.has(key)) return 0
    stack.add(key)
    const deps = [...(depsOf.get(key) ?? [])]
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((k) => depthOf(k, stack)))
    stack.delete(key)
    depthCache.set(key, d)
    return d
  }
  const layerOf = new Map(nodes.map((n) => [n.key, depthOf(n.key, new Set())]))

  const standaloneIds = new Set(nodes.flatMap((n) => (n.kind === 'task' ? [n.task.id] : [])))
  const hOfNode = (n: GNode): number =>
    n.kind === 'epic' && expandedEpics.includes(n.slug)
      ? CARD_H + 1 + n.tasks.length * MEMBER_H + 4
      : CARD_H

  // Rangée par colonne : la couche topo est un PLANCHER (une dépendante reste
  // sous sa prérequise) ; un nœud haut (epic déplié) réserve plusieurs rangées.
  const placed: PlacedNode[] = []
  const minId = (n: GNode) => (n.kind === 'task' ? n.task.id : Math.min(...n.tasks.map((t) => t.id)))
  for (let col = 0; col < sections.length; col++) {
    const colNodes = nodes
      .filter((n) => colOfKey.get(n.key) === col)
      .sort((a, b) => (layerOf.get(a.key)! - layerOf.get(b.key)!) || (minId(a) - minId(b)))
    let nextRow = 0
    for (const n of colNodes) {
      const row = Math.max(layerOf.get(n.key) ?? 0, nextRow)
      const h = hOfNode(n)
      nextRow = row + Math.max(1, Math.ceil((h + (ROW_H - CARD_H)) / ROW_H))
      if (n.kind === 'task') {
        const t = n.task
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
        placed.push({
          node: n, col, row, h,
          state: avail.get(t.id) ?? 'available', missing, hidden,
          blocksCount: t.kind === 'milestone' ? reverseDependents(tree, t.id).length : 0,
        })
      } else {
        placed.push({ node: n, col, row, h, state: 'available', missing: [], hidden: [], blocksCount: 0 })
      }
    }
  }
  const posByKey = new Map(placed.map((p) => [p.node.key, p]))

  const width = xOf(Math.max(1, sections.length) - 1) + CARD_W + PAD
  const height = Math.max(...placed.map((p) => yOf(p.row) + p.h), yOf(0) + CARD_H) + PAD

  // Routage orthogonal : les segments verticaux inter-colonnes passent dans la
  // gouttière adjacente à la source. Les arêtes s'ancrent sur l'EN-TÊTE du
  // nœud (hauteur carte), déplié ou non — la topologie visuelle est stable.
  const edges: string[] = []
  const seenEdges = new Set<string>()
  for (const p of placed) {
    for (const depKey of depsOf.get(p.node.key) ?? []) {
      const src = posByKey.get(depKey)
      if (!src) continue
      const sig = `${depKey}->${p.node.key}`
      if (seenEdges.has(sig)) continue
      seenEdges.add(sig)
      const scy = yOf(src.row) + CARD_H / 2
      const tcy = yOf(p.row) + CARD_H / 2
      if (src.col === p.col) {
        const cx = xOf(src.col) + CARD_W / 2
        edges.push(`M ${cx} ${yOf(src.row) + src.h} L ${cx} ${yOf(p.row)}`)
      } else {
        const forward = src.col < p.col
        const sx = xOf(src.col) + (forward ? CARD_W : 0)
        const tx = xOf(p.col) + (forward ? 0 : CARD_W)
        // Vertical dans la gouttière collée à la source, pas au milieu du saut.
        const gutterX = forward ? sx + COL_GAP / 2 : sx - COL_GAP / 2
        edges.push(`M ${sx} ${scy} L ${gutterX} ${scy} L ${gutterX} ${tcy} L ${tx} ${tcy}`)
      }
    }
  }

  const clamp = (n: number) => Math.min(2, Math.max(0.3, n))
  const zoomBy = (f: number) => setScale((s) => clamp(s * f))
  const fitWidth = () => {
    const cw = scrollRef.current?.clientWidth
    if (cw) setScale(clamp((cw - 16) / width))
  }

  return (
    <div className="relative h-full w-full">
      {/* Contrôles de zoom (épinglés, ne défilent pas avec le graphe) */}
      <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm">
        <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Dézoomer"
          className="px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100">−</button>
        <button type="button" onClick={fitWidth}
          className="border-x border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100">Ajuster</button>
        <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoomer"
          className="px-2.5 py-1 text-sm text-neutral-600 hover:bg-neutral-100">+</button>
      </div>

      <div ref={scrollRef} className="absolute inset-0 overflow-auto">
        {/* Boîte de layout à la taille mise à l'échelle (bornes de scroll correctes) */}
        <div style={{ width: width * scale, height: height * scale }}>
          <div className="relative" style={{ width, height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {/* Bandes de colonnes (fond) + labels de stages — vides estompés. */}
            {sections.map((s, i) => (
              <div key={s.key} className="absolute top-0 border-l border-neutral-100"
                style={{ left: xOf(i) - COL_GAP / 2, width: COL_W + COL_GAP, height }}>
                {/* Même hiérarchie d'encre que le titre de stage du mode Colonnes :
                    neutral-900 quand le stage est peuplé, estompé quand il est vide. */}
                <div
                  className={`truncate px-3 pt-3 text-xs font-semibold ${s.tasks.length === 0 ? 'text-neutral-300' : 'text-neutral-900'}`}
                  title={s.title}
                >
                  {s.title}
                </div>
              </div>
            ))}

            {/* Arêtes (derrière les cartes), avec tête de flèche = direction */}
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <defs>
                <marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" fill="#737373" />
                </marker>
              </defs>
              {edges.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#737373" strokeWidth={1} strokeDasharray="3 3" markerEnd="url(#rm-arrow)" />
              ))}
            </svg>

            {/* Nœuds */}
            {placed.map((p) =>
              p.node.kind === 'task' ? (
                <GraphCard key={p.node.key} placed={p} task={p.node.task} />
              ) : (
                <EpicGraphNode key={p.node.key} placed={p} epic={p.node} avail={avail} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GraphCard({ placed, task }: { placed: PlacedNode; task: TaskNode }) {
  const { state } = placed
  const { openTask, top } = usePanel()
  // Fond blanc TOUJOURS opaque (pas d'opacity sur le conteneur, sinon les arêtes
  // transparaissent) ; l'état estompé s'exprime par la bordure et l'encre.
  // Tâche ouverte dans le panneau → bordure accent (#36).
  const isOpenInPanel = top?.type === 'task' && top.id === task.id
  // Sélection = langage du Backlog (fond + filet gauche) ; disponibles sans
  // contour fort ; hover ≠ sélection (la carte ouverte reste accent sous la souris).
  const skin = isOpenInPanel
    ? 'border border-neutral-200 bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]'
    : 'border border-neutral-200 bg-white hover:border-neutral-400'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-neutral-500 line-through' : dim ? 'text-neutral-500' : 'text-neutral-900'
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      className={`absolute flex flex-col gap-1.5 px-3 py-2.5 text-left ${skin}`}
      style={{ left: xOf(placed.col), top: yOf(placed.row), width: CARD_W, minHeight: CARD_H }}>
      <div className="flex items-center gap-2">
        {state === 'locked'
          ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Verrouillée" />
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
          title={placed.hidden.length > 0 ? hiddenPrereqNote(placed.hidden) : undefined}
        >
          Prérequis manquants
          {placed.missing.length + placed.hidden.length > 0
            ? ` (${[...placed.missing, ...placed.hidden.map((h) => h.id)].map((d) => `#${d}`).join(' ')})`
            : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Disponible</span>
      ) : null /* done : contenu identique aux autres états, sans chips (cohérence) */}
      {/* Jalon (#133) : le poids du verrou, même donnée que le panneau (« Bloque »). */}
      {task.kind === 'milestone' && placed.blocksCount > 0 && (
        <span className="text-[11px] text-neutral-500">bloque {placed.blocksCount}</span>
      )}
      {/* Badge team (le QUI) — abrégé, coin bas droit. Même donnée = même rendu
          que le Backlog : Chip (design.md §2). */}
      <span className="absolute bottom-1 right-2"><Chip label={TEAM_ABBR[task.team]} /></span>
    </button>
  )
}

/**
 * Nœud-EPIC du graphe (#135) : en-tête au gabarit d'une carte (chevron + carré
 * EpicGlyph + titre font-medium + n tâches + complétion GLOBALE), déplié EN
 * PLACE — les membres deviennent des lignes compactes cliquables (→ panneau)
 * DANS le nœud, les arêtes restent ancrées sur l'en-tête. Pas de <button>
 * imbriqué : l'en-tête est LE trigger (aria-expanded), chaque membre est un
 * bouton frère. `data-panel-open` reproduit l'attribut Base UI pour que la
 * rotation `.chev` (index.css) s'applique à l'identique.
 */
function EpicGraphNode({ placed, epic, avail }: {
  placed: PlacedNode
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
      className="absolute border border-neutral-200 bg-white hover:border-neutral-400"
      style={{ left: xOf(placed.col), top: yOf(placed.row), width: CARD_W }}
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
            {epic.tasks.length} tâche{epic.tasks.length === 1 ? '' : 's'}{partial ? ' ici' : ''}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-1 w-14 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span
              className="font-mono text-[11px] text-neutral-500"
              title={`Complétion globale de l'epic : ${progress.done}/${progress.total}`}
            >
              {progress.done}/{progress.total}
            </span>
            <span className="sr-only">, {progress.done} sur {progress.total} tâches terminées</span>
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
                  ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Verrouillée" />
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
    </div>
  )
}
