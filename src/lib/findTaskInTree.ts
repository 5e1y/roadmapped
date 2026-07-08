import type { TaskTree, TaskNode } from './tasks'

/** Recherche pure d'une tâche par id dans l'arbre, sous-tâches comprises. */
export function findTaskInTree(tree: TaskTree, id: number): TaskNode | null {
  const search = (tasks: TaskNode[]): TaskNode | null => {
    for (const t of tasks) {
      if (t.id === id) return t
      const hit = search(t.subtasks)
      if (hit) return hit
    }
    return null
  }
  for (const s of tree.sections) {
    const hit = search(s.tasks)
    if (hit) return hit
  }
  return null
}
