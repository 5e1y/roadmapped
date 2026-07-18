import { beforeEach, describe, it, expect } from 'vitest'
import { seedSeenBaseline, markTaskSeen } from './seenTasks'
import { readPersistentStrings, setPersistentStrings } from './uiPersist'
import type { TaskNode, TaskTree } from '../lib/tasks'

const SEEN = 'roadmapped:seenTasks'
const INIT = 'roadmapped:seenInit'

function node(id: number, updatedAt: string | null): TaskNode {
  return {
    id, kind: 'task', title: `T${id}`, status: 'todo', tags: [],
    detail: null, refs: [], links: [], dependsOn: [], epic: null,
    source: 'ai', createdAt: '2026-07-09', startedAt: null, updatedAt, completedAt: null,
    commit: null, outcome: null, verification: null, release: null,
    file: `docs/tasks/01-idea/${id}.yaml`, subtasks: [],
  }
}
const tree = (tasks: TaskNode[]): TaskTree => ({
  nextId: 9, epics: [], sections: [{ key: '01-idea', title: 'Idea', status: 'open', note: null, tasks }],
})

beforeEach(() => {
  // Reset localStorage + cache uiPersist pour ces deux clés (isolation).
  setPersistentStrings(SEEN, [])
  setPersistentStrings(INIT, [])
})

describe('seenTasks (#147 Live 5)', () => {
  it('baseline marque tout le tree comme vu (par empreinte id:updatedAt)', () => {
    seedSeenBaseline(tree([node(1, 'A'), node(2, 'B')]))
    expect(readPersistentStrings(SEEN).sort()).toEqual(['1:A', '2:B'])
    expect(readPersistentStrings(INIT)).toEqual(['1'])
  })

  it('baseline est idempotente (INIT posé → no-op)', () => {
    seedSeenBaseline(tree([node(1, 'A')]))
    seedSeenBaseline(tree([node(1, 'A'), node(2, 'B'), node(3, 'C')])) // ignoré
    expect(readPersistentStrings(SEEN)).toEqual(['1:A'])
  })

  it('markTaskSeen remplace l\'empreinte d\'un id (change = plus dans le set vu)', () => {
    seedSeenBaseline(tree([node(1, 'A'), node(2, 'B')]))
    // #1 a changé (updatedAt A→A2) : son ancienne empreinte n'est plus « vue »
    expect(readPersistentStrings(SEEN)).not.toContain('1:A2')
    markTaskSeen(node(1, 'A2'))
    const seen = readPersistentStrings(SEEN)
    expect(seen).toContain('1:A2')
    expect(seen).not.toContain('1:A') // ancienne empreinte retirée
    expect(seen).toContain('2:B') // les autres intacts
  })

  it('un id absent de la baseline (apparu après) n\'est pas dans le set vu', () => {
    seedSeenBaseline(tree([node(1, 'A')]))
    expect(readPersistentStrings(SEEN)).not.toContain('2:B')
  })
})
