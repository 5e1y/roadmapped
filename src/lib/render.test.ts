import { describe, it, expect } from 'vitest'
import { taskLine, refLine, sitrepText } from './render'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

function task(id: number, over: Partial<TaskNode> = {}): TaskNode {
  return {
    id, kind: 'task', code: null, title: `T${id}`, status: 'todo', tags: [], size: null,
    team: 'engineering', detail: null, refs: [], links: [], dependsOn: [], milestone: null,
    source: 'ai', createdAt: '2026-07-07', completedAt: null, commit: null, outcome: null,
    verification: null, release: null, file: `docs/tasks/04-build/${id}.yaml`, subtasks: [], ...over,
  }
}
const tree = (tasks: TaskNode[]): TaskTree => {
  const sec = (key: string, ts: TaskNode[]): SectionNode => ({ key, title: key, status: 'open', note: null, tasks: ts })
  return { nextId: 99, sections: [sec('04-build', tasks)], archive: [], roadmaps: [] }
}

describe('taskLine', () => {
  it('glyphe + id + titre + chips (size/team/quick/tags)', () => {
    expect(taskLine(task(1, { size: 'M', tags: ['ux'] }), '')).toBe('[ ] #1   T1  (M engineering ux)')
  })
  it('un quick porte le chip quick', () => {
    expect(taskLine(task(2, { kind: 'quick' }), '')).toContain('(engineering quick)')
  })
})

describe('refLine', () => {
  it('titre + statut FR inline', () => {
    expect(refLine(tree([task(1, { status: 'done', title: 'Faite' })]), 1)).toBe('#1 Faite (faite)')
  })
  it('id inconnu → marqué (inconnu)', () => {
    expect(refLine(tree([]), 42)).toBe('#42 (inconnu)')
  })
})

describe('sitrepText', () => {
  it('en-tête daté, compte in_progress, prochaines, validate en un mot', () => {
    const out = sitrepText(tree([task(1, { status: 'in_progress' }), task(2)]), [])
    expect(out).toMatch(/^sitrep — \d{4}-\d{2}-\d{2}/)
    expect(out).toMatch(/in_progress \(1\)/)
    expect(out).toMatch(/prochaines: #2 T2/)
    expect(out).toMatch(/validate: OK/)
    expect(out.split('\n').length).toBeLessThanOrEqual(30)
  })
  it('validate rouge + dette ouverte remontent en alertes', () => {
    const out = sitrepText(tree([task(3, { tags: ['debt'] })]), ['boom'])
    expect(out).toMatch(/validate: 1 erreur/)
    expect(out).toMatch(/dette\(s\) ouverte\(s\).*#3/)
    expect(out).toMatch(/validate rouge/)
  })

  // #101 : la dérive « commits sans ticket » devient visible en ouverture de session.
  it('signale les commits non consignés quand aucune tâche n’est in_progress', () => {
    const out = sitrepText(tree([task(1)]), [], { count: 3, sinceId: 42 })
    expect(out).toMatch(/⚠ 3 commit\(s\) non consigné\(s\) depuis #42/)
  })
  it('muet si une in_progress existe (travail en cours = commits normaux), si null ou si 0', () => {
    expect(sitrepText(tree([task(1, { status: 'in_progress' })]), [], { count: 3, sinceId: 42 })).not.toMatch(/non consigné/)
    expect(sitrepText(tree([task(1)]), [], null)).not.toMatch(/non consigné/)
    expect(sitrepText(tree([task(1)]), [], { count: 0, sinceId: 42 })).not.toMatch(/non consigné/)
  })
})
