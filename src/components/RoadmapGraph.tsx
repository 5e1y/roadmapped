import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { computeAvailability, topoLayers, type Availability } from '../lib/roadmap'
import { StatusGlyph } from './glyphs'
import { Chip } from './Chip'
import type { TaskNode } from '../lib/tasks'

const COL_W = 280, COL_GAP = 32, ROW_H = 96, CARD_W = 248, CARD_H = 72, PAD = 24, HEADER_H = 40

const xOf = (col: number) => PAD + col * (COL_W + COL_GAP)
const yOf = (row: number) => PAD + HEADER_H + row * ROW_H

interface Placed { task: TaskNode; col: number; row: number; state: Availability; missing: number[] }

/** Vue achievement : colonnes = sections du backlog, cartes par couche de dépendance. */
export function RoadmapGraph() {
  const { tree } = useTree()
  const { openTask } = usePanel()
  if (!tree) return null

  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
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
      // Prérequis MANQUANTS seulement : une dep absente de la map (archivée /
      // inconnue) est done de fait, une dep done ne bloque plus.
      const missing = t.dependsOn.filter((d) => {
        const st = avail.get(d)
        return st !== undefined && st !== 'done'
      })
      placed.push({ task: t, col, row, state: avail.get(t.id) ?? 'available', missing })
    }
  }
  const posById = new Map(placed.map((p) => [p.task.id, p]))

  const rowCount = Math.max(1, ...placed.map((p) => p.row + 1))
  const width = xOf(Math.max(1, sections.length) - 1) + CARD_W + PAD
  const height = yOf(rowCount - 1) + CARD_H + PAD

  // Routage orthogonal : horizontal entre colonnes (bord à bord), vertical
  // dans une même colonne.
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
        const midX = (sx + tx) / 2
        edges.push(`M ${sx} ${scy} L ${midX} ${scy} L ${midX} ${tcy} L ${tx} ${tcy}`)
      }
    }
  }

  return (
    <div className="relative" style={{ width, height }}>
      {/* Bandes de colonnes (fond) + labels de sections */}
      {sections.map((s, i) => (
        <div key={s.key} className="absolute top-0 border-l border-neutral-100"
          style={{ left: xOf(i) - COL_GAP / 2, width: COL_W + COL_GAP, height }}>
          <div className="truncate px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{s.title}</div>
        </div>
      ))}

      {/* Arêtes (derrière les cartes) */}
      <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
        {edges.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#a3a3a3" strokeWidth={1} strokeDasharray="3 3" />
        ))}
      </svg>

      {/* Cartes */}
      {placed.map((p) => (
        <GraphCard key={p.task.id} placed={p} onOpen={() => openTask(p.task.id)} />
      ))}
    </div>
  )
}

function GraphCard({ placed, onOpen }: { placed: Placed; onOpen: () => void }) {
  const { task, state } = placed
  const border =
    state === 'available' ? 'border-2 border-neutral-900'
    : state === 'done' ? 'border border-neutral-200 opacity-60'
    : 'border border-neutral-200 opacity-45'
  return (
    <button type="button" onClick={onOpen}
      className={`absolute flex flex-col gap-1.5 rounded-lg bg-white px-3 py-2.5 text-left ${border}`}
      style={{ left: xOf(placed.col), top: yOf(placed.row), width: CARD_W, minHeight: CARD_H }}>
      <div className="flex items-center gap-2">
        <StatusGlyph status={task.status} />
        <span className="shrink-0 font-mono text-xs text-neutral-400">#{task.id}</span>
        <span className={`min-w-0 truncate text-sm ${task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {task.title}
        </span>
      </div>
      {state === 'locked' ? (
        <span className="text-[11px] text-neutral-400">
          Prérequis manquants{placed.missing.length ? ` (${placed.missing.map((d) => `#${d}`).join(' ')})` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Disponible</span>
      ) : (
        (task.zone || task.size) && (
          <div className="flex flex-wrap items-center gap-1">
            {task.zone && <Chip label={task.zone} />}
            {task.size && <Chip label={task.size} mono />}
          </div>
        )
      )}
    </button>
  )
}
