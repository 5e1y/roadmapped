import { describe, it, expect } from 'vitest'
import { diffTrees, flattenTasks } from './treeDiff'
import type { TaskNode, TaskTree } from './tasks'

function node(partial: Partial<TaskNode> & { id: number }): TaskNode {
  return {
    kind: 'task', title: `Task ${partial.id}`, status: 'todo',
    tags: [], detail: null, refs: [], links: [],
    dependsOn: [], epic: null, source: 'ai', createdAt: '2026-07-09', startedAt: null,
    completedAt: null, commit: null, outcome: null, verification: null, release: null,
    file: `docs/tasks/01-idea/${partial.id}.yaml`, subtasks: [], ...partial,
  }
}

function tree(tasks: TaskNode[]): TaskTree {
  return { nextId: 999, epics: [], sections: [{ key: '01-idea', title: 'Idea', status: 'open', note: null, tasks }] }
}

describe('diffTrees', () => {
  it('detects a status change (and only that, even when startedAt shifts with it)', () => {
    const prev = tree([node({ id: 1, status: 'todo' })])
    const next = tree([node({ id: 1, status: 'in_progress', startedAt: '2026-07-09T10:00' })])
    const d = diffTrees(prev, next)
    expect(d.statusChanges).toEqual([{ id: 1, title: 'Task 1', from: 'todo', to: 'in_progress' }])
    expect(d.edited).toHaveLength(0)
  })

  it('detects an appeared and a removed task', () => {
    const prev = tree([node({ id: 1 })])
    const next = tree([node({ id: 2 })])
    const d = diffTrees(prev, next)
    expect(d.appeared).toEqual([{ id: 2, title: 'Task 2' }])
    expect(d.removed).toEqual([1])
  })

  it('detects a content edit distinct from a status change', () => {
    const prev = tree([node({ id: 1, detail: 'a' })])
    const next = tree([node({ id: 1, detail: 'b' })])
    const d = diffTrees(prev, next)
    expect(d.edited).toEqual([{ id: 1, title: 'Task 1' }])
    expect(d.statusChanges).toHaveLength(0)
  })

  it('reports nothing when trees are identical', () => {
    const prev = tree([node({ id: 1 }), node({ id: 2, status: 'done' })])
    const next = tree([node({ id: 1 }), node({ id: 2, status: 'done' })])
    const d = diffTrees(prev, next)
    expect(d).toEqual({ statusChanges: [], appeared: [], removed: [], edited: [] })
  })

  it('recurses into subtasks', () => {
    const prev = tree([node({ id: 1, subtasks: [node({ id: 10, status: 'todo' })] })])
    const next = tree([node({ id: 1, subtasks: [node({ id: 10, status: 'done' })] })])
    const d = diffTrees(prev, next)
    expect(d.statusChanges).toEqual([{ id: 10, title: 'Task 10', from: 'todo', to: 'done' }])
    expect(flattenTasks(next).size).toBe(2)
  })
})
