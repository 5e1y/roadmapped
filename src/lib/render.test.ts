import { describe, it, expect } from 'vitest'
import { taskLine, refLine, sitrepText, auditText, stalePassepartout } from './render'
import type { CommitAudit } from './render'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

function task(id: number, over: Partial<TaskNode> = {}): TaskNode {
  return {
    id, kind: 'task', code: null, title: `T${id}`, status: 'todo', tags: [], size: null,
    detail: null, refs: [], links: [], dependsOn: [], epic: null,
    source: 'ai', createdAt: '2026-07-07', startedAt: null, completedAt: null, commit: null, outcome: null,
    verification: null, release: null, file: `docs/tasks/04-build/${id}.yaml`, subtasks: [], ...over,
  }
}
const tree = (tasks: TaskNode[]): TaskTree => {
  const sec = (key: string, ts: TaskNode[]): SectionNode => ({ key, title: key, status: 'open', note: null, tasks: ts })
  return { nextId: 99, sections: [sec('04-build', tasks)], epics: [] }
}

describe('taskLine', () => {
  it('glyphe + id + titre + chips (size/heat/tags ; team retirée #230)', () => {
    expect(taskLine(task(1, { size: 'M', tags: ['ux'] }), '')).toBe('[ ] #1   T1  (M ux)')
  })
  it('un heat > 0 porte le chip « heat N » (absent = froid, aucun chip)', () => {
    expect(taskLine(task(1, { heat: 80 }), '')).toBe('[ ] #1   T1  (heat 80)')
    expect(taskLine(task(1, { heat: 0 }), '')).toBe('[ ] #1   T1')
  })
  it('un jalon porte le chip milestone (#133)', () => {
    expect(taskLine(task(3, { kind: 'milestone' }), '')).toContain('(milestone)')
  })
})

describe('refLine', () => {
  it('titre + statut FR inline', () => {
    expect(refLine(tree([task(1, { status: 'done', title: 'Faite' })]), 1)).toBe('#1 Faite (done)')
  })
  it('id inconnu → marqué (unknown)', () => {
    expect(refLine(tree([]), 42)).toBe('#42 (unknown)')
  })
})

describe('sitrepText', () => {
  it('en-tête daté, compte in_progress, prochaines, validate en un mot', () => {
    const out = sitrepText(tree([task(1, { status: 'in_progress' }), task(2)]), [])
    expect(out).toMatch(/^sitrep — \d{4}-\d{2}-\d{2}/)
    expect(out).toMatch(/in_progress \(1\)/)
    expect(out).toMatch(/next: #2 T2/)
    expect(out).toMatch(/validate: OK/)
    expect(out.split('\n').length).toBeLessThanOrEqual(30)
  })

  // #133 : l'avancement global visible en ouverture de session, sans ouvrir le dashboard.
  it('porte la ligne avancement (done/total + pourcentage, globalProgress)', () => {
    const out = sitrepText(tree([task(1, { status: 'done' }), task(2), task(3), task(4)]), [])
    expect(out).toMatch(/progress: 1\/4 \(25%\)/)
  })
  it('avancement 0/0 sur un backlog vide (pas de division par zéro)', () => {
    expect(sitrepText(tree([]), [])).toMatch(/progress: 0\/0 \(0%\)/)
  })
  it('validate rouge + dette ouverte remontent en alertes', () => {
    const out = sitrepText(tree([task(3, { tags: ['debt'] })]), ['boom'])
    expect(out).toMatch(/validate: 1 error/)
    expect(out).toMatch(/open debt item\(s\).*#3/)
    expect(out).toMatch(/validate failing/)
  })

  it('signale les tâches done avec un feedback non résolu (#149)', () => {
    const withOpen = task(1, { status: 'done', completedAt: '2026-07-07', feedback: [{ date: '2026-07-09T10:00:00', author: 'remi', text: 'revoir', resolved: false }] })
    const out = sitrepText(tree([withOpen]), [])
    expect(out).toMatch(/done task\(s\) with open feedback/)
    expect(out).toContain('#1')
  })

  it('ne signale pas un feedback déjà résolu (#149)', () => {
    const resolved = task(2, { status: 'done', completedAt: '2026-07-07', feedback: [{ date: '2026-07-09T10:00:00', author: 'remi', text: 'ok', resolved: true }] })
    expect(sitrepText(tree([resolved]), [])).not.toMatch(/open feedback/)
  })

  // #101 : la dérive « commits sans ticket » devient visible en ouverture de session.
  it('signale les commits non consignés quand aucune tâche n’est in_progress', () => {
    const out = sitrepText(tree([task(1)]), [], { count: 3, sinceId: 42 })
    expect(out).toMatch(/⚠ 3 unlogged commit\(s\) since #42/)
  })
  it('muet si une in_progress existe (travail en cours = commits normaux), si null ou si 0', () => {
    expect(sitrepText(tree([task(1, { status: 'in_progress' })]), [], { count: 3, sinceId: 42 })).not.toMatch(/unlogged/)
    expect(sitrepText(tree([task(1)]), [], null)).not.toMatch(/unlogged/)
    expect(sitrepText(tree([task(1)]), [], { count: 0, sinceId: 42 })).not.toMatch(/unlogged/)
  })
})

describe('stalePassepartout (#105)', () => {
  const today = '2026-07-08'
  it('aucune in_progress → []', () => {
    expect(stalePassepartout(tree([task(1)]), today)).toEqual([])
  })
  it('une in_progress fraîche → [] (couverture légitime)', () => {
    expect(stalePassepartout(tree([task(1, { status: 'in_progress', createdAt: today })]), today)).toEqual([])
  })
  it('une in_progress ancienne (≥7j) → signalée avec âge', () => {
    const out = stalePassepartout(tree([task(1, { status: 'in_progress', createdAt: '2026-06-01' })]), today)
    expect(out).toEqual([{ id: 1, title: 'T1', ageDays: 37 }])
  })
  it('âge depuis startedAt, pas createdAt (#82) : créée il y a longtemps mais démarrée aujourd’hui → non ancienne', () => {
    const out = stalePassepartout(tree([task(1, { status: 'in_progress', createdAt: '2026-06-01', startedAt: today })]), today)
    expect(out).toEqual([])
  })
  it('une fraîche couvre même si une ancienne traîne → []', () => {
    const out = stalePassepartout(tree([
      task(1, { status: 'in_progress', createdAt: '2026-06-01' }),
      task(2, { status: 'in_progress', createdAt: today }),
    ]), today)
    expect(out).toEqual([])
  })
})

describe('auditText (#104)', () => {
  const c = (over: Partial<CommitAudit>): CommitAudit => ({ sha: 'abc123', subject: 'x', ref: null, status: 'orphan', ...over })
  it('indisponible hors dépôt (null)', () => {
    expect(auditText(null)).toMatch(/unavailable/)
  })
  it('aucun commit → coche verte', () => {
    expect(auditText([])).toMatch(/no commits.*✔/)
  })
  it('compte lié/orphelin/mort et détaille les problèmes', () => {
    const out = auditText([
      c({ sha: 'aaa', subject: 'feat: x (#16)', ref: 16, status: 'ok' }),
      c({ sha: 'bbb', subject: 'chore: bidouille', ref: null, status: 'orphan' }),
      c({ sha: 'ccc', subject: 'feat: y (#999)', ref: 999, status: 'dangling' }),
    ])
    expect(out).toMatch(/✔ 1 linked.*⚠ 1 orphan.*⚠ 1 dead reference/)
    expect(out).toMatch(/orphan    bbb chore: bidouille/)
    expect(out).toMatch(/dead ref  ccc feat: y \(#999\)  \(#999 unknown\)/)
    expect(out).not.toMatch(/aaa/) // les commits liés ne polluent pas la sortie
  })
})
