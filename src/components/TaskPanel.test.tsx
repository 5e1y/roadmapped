import { describe, it, expect } from 'vitest'
import { relItemOf } from './TaskPanel'
import type { TaskNode } from '../lib/tasks'

const base: TaskNode = {
  id: 12, kind: 'task', code: null, title: 'Brancher le paiement', status: 'todo',
  tags: [], size: null, detail: null, refs: [], links: [],
  dependsOn: [], epic: null, source: 'user', createdAt: '2026-07-01', startedAt: null,
  completedAt: null, commit: null, outcome: null, verification: null, release: null,
  file: 'docs/tasks/04-build/12-paiement.yaml', subtasks: [],
}

describe('relItemOf (#125 — aperçu des combobox de relations)', () => {
  it('porte #id, titre, statut et stage court', () => {
    const item = relItemOf(base)
    expect(item.value).toBe('12')
    expect(item.label).toBe('#12 Brancher le paiement')
    expect(item.preview).toEqual({
      id: 12, title: 'Brancher le paiement', status: 'todo', kind: 'task',
      stage: 'build',
    })
  })

  it('dérive le stage court du dossier du fichier YAML', () => {
    const item = relItemOf({ ...base, status: 'done', file: 'docs/tasks/05-gtm/12-paiement.yaml' })
    expect(item.preview?.stage).toBe('gtm')
    expect(item.preview?.status).toBe('done')
  })

  it('conserve le kind (glyphe jalon côté rendu)', () => {
    expect(relItemOf({ ...base, kind: 'milestone' }).preview?.kind).toBe('milestone')
  })
})
