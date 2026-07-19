import { describe, expect, it } from 'vitest'
import { eventsFromDiff, verbForStatus } from './LiveActivity'
import type { TreeDiff } from '../lib/treeDiff'

/*
 * Le check runnable du live V2 (#205) : la dérivation diff → événements est la
 * seule logique non triviale du provider (le reste est de l'accumulation
 * d'état). Le rendu (badge, popover, flash) se vérifie à l'œil.
 */

const emptyDiff: TreeDiff = { statusChanges: [], appeared: [], removed: [], edited: [] }

describe('verbForStatus', () => {
  it('maps status transitions to verbs', () => {
    expect(verbForStatus('todo', 'done')).toBe('finished')
    expect(verbForStatus('in_progress', 'done')).toBe('finished')
    expect(verbForStatus('todo', 'in_progress')).toBe('started')
    expect(verbForStatus('done', 'in_progress')).toBe('reopened')
    expect(verbForStatus('in_progress', 'todo')).toBe('moved to todo')
    expect(verbForStatus('done', 'todo')).toBe('moved to todo')
  })
})

describe('eventsFromDiff', () => {
  it('returns nothing for an empty diff', () => {
    expect(eventsFromDiff(emptyDiff, '10:00:00')).toEqual([])
  })

  it('derives one timestamped event per diff entry, in diff order', () => {
    const diff: TreeDiff = {
      appeared: [{ id: 7, title: 'New task' }],
      statusChanges: [{ id: 3, title: 'Ship it', from: 'in_progress', to: 'done' }],
      edited: [{ id: 5, title: 'Tweaked' }],
      removed: [9],
    }
    expect(eventsFromDiff(diff, '10:00:00')).toEqual([
      { at: '10:00:00', verb: 'created', id: 7, title: 'New task' },
      { at: '10:00:00', verb: 'finished', id: 3, title: 'Ship it', from: 'in_progress', to: 'done' },
      { at: '10:00:00', verb: 'edited', id: 5, title: 'Tweaked' },
      { at: '10:00:00', verb: 'removed', id: 9, title: '' },
    ])
  })

  it('leaves removed entries without a title — the tree no longer has one', () => {
    const [e] = eventsFromDiff({ ...emptyDiff, removed: [42] }, '10:00:00')
    expect(e).toEqual({ at: '10:00:00', verb: 'removed', id: 42, title: '' })
  })

  it('stamps the current clock time when none is given', () => {
    const [e] = eventsFromDiff({ ...emptyDiff, appeared: [{ id: 1, title: 'x' }] })
    expect(e.at).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
