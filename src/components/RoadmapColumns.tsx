import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { StatusGlyph } from './glyphs'
import { Chip } from './Chip'
import type { TaskNode } from '../lib/tasks'

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
      <div className="h-full bg-neutral-900" style={{ width: `${pct}%` }} />
    </div>
  )
}

function TaskCard({ task }: { task: TaskNode }) {
  const { openTask } = usePanel()
  return (
    <button type="button" onClick={() => openTask(task.id)}
      className="flex w-full flex-col gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left hover:border-neutral-400">
      <div className="flex items-center gap-2">
        <StatusGlyph status={task.status} />
        <span className="shrink-0 font-mono text-xs text-neutral-400">#{task.id}</span>
        <span className={`min-w-0 truncate text-sm ${task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {task.title}
        </span>
      </div>
      {(task.zone || task.size || task.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1">
          {task.zone && <Chip label={task.zone} />}
          {task.size && <Chip label={task.size} mono />}
          {task.tags.map((t) => <Chip key={t} label={t} />)}
        </div>
      )}
    </button>
  )
}

function Column({ title, tasks }: { title: string; tasks: TaskNode[] }) {
  const done = tasks.filter((t) => t.status === 'done').length
  return (
    <div className="flex w-[280px] shrink-0 flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">{title}</span>
          <span className="font-mono text-xs text-neutral-400">{done}/{tasks.length}</span>
        </div>
        <ProgressBar done={done} total={tasks.length} />
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        {tasks.length === 0 && <p className="text-xs text-neutral-400">Aucune tâche.</p>}
      </div>
    </div>
  )
}

/** Vue jalons du backlog : une colonne = une section active, dans l'ordre de priorité. */
export function RoadmapColumns() {
  const { tree } = useTree()
  if (!tree) return null
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  return (
    <div className="flex gap-4 overflow-x-auto px-6 py-8">
      {sections.map((s) => <Column key={s.key} title={s.title} tasks={s.tasks} />)}
    </div>
  )
}
