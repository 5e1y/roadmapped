import { useRef, useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { computeAvailability, missingPrereqs, topoLayers, type Availability } from '../lib/roadmap'
import { StatusGlyph } from './glyphs'
import type { TaskNode } from '../lib/tasks'

const COL_W = 280, COL_GAP = 32, ROW_H = 96, CARD_W = 248, CARD_H = 72, PAD = 24, HEADER_H = 40

const xOf = (col: number) => PAD + col * (COL_W + COL_GAP)
const yOf = (row: number) => PAD + HEADER_H + row * ROW_H

interface Placed { task: TaskNode; col: number; row: number; state: Availability; missing: number[]; missingHidden: number }

/** Vue achievement : colonnes = sections du backlog, cartes par couche de dépendance. */
export function RoadmapGraph() {
  const { tree } = useTree()
  const { openTask } = usePanel()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
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
  // Nœuds = tâches de premier niveau des sections actives.
  const nodes = sections.flatMap((s) => s.tasks.map((t) => ({ task: t, sectionKey: s.key })))
  const nodeIds = new Set(nodes.map((n) => n.task.id))
  const layerOf = new Map<number, number>()
  topoLayers(nodes.map((n) => n.task)).forEach((layerTasks, layer) => layerTasks.forEach((t) => layerOf.set(t.id, layer)))

  // Rangée par colonne : la couche topo est un PLANCHER (une dépendante reste
  // sous sa prérequise), la rangée suivante libre évite toute collision.
  const placed: Placed[] = []
  for (const s of sections) {
    const col = colOf.get(s.key)!
    const tasks = [...s.tasks].sort((a, b) => (layerOf.get(a.id)! - layerOf.get(b.id)!) || a.id - b.id)
    let nextRow = 0
    for (const t of tasks) {
      const row = Math.max(layerOf.get(t.id) ?? 0, nextRow)
      nextRow = row + 1
      // Prérequis non faits (source partagée avec le mode Colonnes). On sépare
      // ceux qui ont une carte dans le graphe (#id cliquable) de ceux hors-vue
      // (sous-tâche, section en veille…) pour ne pas citer un #id introuvable.
      const allMissing = missingPrereqs(t, avail)
      const missing = allMissing.filter((d) => nodeIds.has(d))
      placed.push({ task: t, col, row, state: avail.get(t.id) ?? 'available', missing, missingHidden: allMissing.length - missing.length })
    }
  }
  const posById = new Map(placed.map((p) => [p.task.id, p]))

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const width = xOf(Math.max(1, sections.length) - 1) + CARD_W + PAD
  const height = yOf(rowCount - 1) + CARD_H + PAD

  // Routage orthogonal : les segments verticaux inter-colonnes passent dans la
  // gouttière adjacente à la source (pas au centre d'une colonne intermédiaire).
  const edges: string[] = []
  for (const p of placed) {
    for (const depId of p.task.dependsOn) {
      if (!nodeIds.has(depId)) continue
      const src = posById.get(depId)!
      const scy = yOf(src.row) + CARD_H / 2
      const tcy = yOf(p.row) + CARD_H / 2
      if (src.col === p.col) {
        const cx = xOf(src.col) + CARD_W / 2
        edges.push(`M ${cx} ${yOf(src.row) + CARD_H} L ${cx} ${yOf(p.row)}`)
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
            {/* Bandes de colonnes (fond) + labels de sections */}
            {sections.map((s, i) => (
              <div key={s.key} className="absolute top-0 border-l border-neutral-100"
                style={{ left: xOf(i) - COL_GAP / 2, width: COL_W + COL_GAP, height }}>
                <div className="truncate px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400" title={s.title}>{s.title}</div>
              </div>
            ))}

            {/* Arêtes (derrière les cartes), avec tête de flèche = direction */}
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <defs>
                <marker id="rm-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 L8 4 L0 8 z" fill="#a3a3a3" />
                </marker>
              </defs>
              {edges.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="#a3a3a3" strokeWidth={1} strokeDasharray="3 3" markerEnd="url(#rm-arrow)" />
              ))}
            </svg>

            {/* Cartes */}
            {placed.map((p) => (
              <GraphCard key={p.task.id} placed={p} onOpen={() => openTask(p.task.id)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function GraphCard({ placed, onOpen }: { placed: Placed; onOpen: () => void }) {
  const { task, state } = placed
  const { top } = usePanel()
  // Fond blanc TOUJOURS opaque (pas d'opacity sur le conteneur, sinon les arêtes
  // transparaissent) ; l'état estompé s'exprime par la bordure et l'encre.
  // Tâche ouverte dans le panneau → bordure accent (#36).
  const isOpenInPanel = top?.type === 'task' && top.id === task.id
  // Hover ≠ sélection : la carte ouverte reste accent sous la souris.
  const border = isOpenInPanel
    ? 'border-2 border-accent'
    : state === 'available'
      ? 'border-2 border-neutral-900 hover:border-neutral-400'
      : 'border border-neutral-200 hover:border-neutral-400'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-neutral-400 line-through' : dim ? 'text-neutral-400' : 'text-neutral-900'
  return (
    <button type="button" onClick={onOpen} title={task.title}
      className={`absolute flex flex-col gap-1.5 bg-white px-3 py-2.5 text-left ${border}`}
      style={{ left: xOf(placed.col), top: yOf(placed.row), width: CARD_W, minHeight: CARD_H }}>
      <div className="flex items-center gap-2">
        <StatusGlyph status={task.status} />
        <span className="shrink-0 font-mono text-xs text-neutral-400">#{task.id}</span>
        <span className={`min-w-0 truncate text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {state === 'locked' ? (
        <span className="text-[11px] text-neutral-400">
          Prérequis manquants{placed.missing.length ? ` (${placed.missing.map((d) => `#${d}`).join(' ')})` : ''}
          {placed.missingHidden > 0 ? ` (+${placed.missingHidden} hors graphe)` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Disponible</span>
      ) : null /* done : contenu identique aux autres états, sans chips (cohérence) */}
    </button>
  )
}
