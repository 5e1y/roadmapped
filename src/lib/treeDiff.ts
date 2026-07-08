import type { TaskTree, TaskNode } from './tasks'

/**
 * Diff prev/next du tree (#147, Live 2). Primitive des couches UX live : la console
 * d'actions (#190) et les toasts s'en nourrissent. Calculé une fois par resync SSE,
 * à partir du tree précédent conservé côté TreeContext.
 */
export interface TreeDiff {
  /** Transitions de statut (todo/in_progress/done) — la matière des toasts et de la console. */
  statusChanges: { id: number; title: string; from: TaskNode['status']; to: TaskNode['status'] }[]
  /** Ids apparus (nouveaux tickets). */
  appeared: { id: number; title: string }[]
  /** Ids disparus (supprimés). */
  removed: number[]
  /** Édités : même id, contenu changé HORS transition de statut. */
  edited: { id: number; title: string }[]
}

/** Aplati le tree en map id→node (sous-tâches comprises). */
export function flattenTasks(tree: TaskTree): Map<number, TaskNode> {
  const map = new Map<number, TaskNode>()
  const visit = (t: TaskNode) => { map.set(t.id, t); t.subtasks.forEach(visit) }
  tree.sections.forEach((s) => s.tasks.forEach(visit))
  return map
}

/** Signature de contenu d'un node, hors sous-tâches (elles sont des entrées à part). */
function signature(t: TaskNode): string {
  return JSON.stringify({ ...t, subtasks: undefined })
}

export function diffTrees(prev: TaskTree, next: TaskTree): TreeDiff {
  const before = flattenTasks(prev)
  const after = flattenTasks(next)
  const diff: TreeDiff = { statusChanges: [], appeared: [], removed: [], edited: [] }

  for (const [id, node] of after) {
    const old = before.get(id)
    if (!old) {
      diff.appeared.push({ id, title: node.title })
    } else if (old.status !== node.status) {
      diff.statusChanges.push({ id, title: node.title, from: old.status, to: node.status })
    } else if (signature(old) !== signature(node)) {
      diff.edited.push({ id, title: node.title })
    }
  }
  for (const id of before.keys()) {
    if (!after.has(id)) diff.removed.push(id)
  }
  return diff
}
