import { describe, it, expect } from 'vitest'
import { isDualStack, pushEntry, type PanelEntry } from './PanelContext'

const task = (id: number): PanelEntry => ({ type: 'task', id })
const kb = (nodeId: string): PanelEntry => ({ type: 'kb-node', nodeId })
const section = (key: string): PanelEntry => ({ type: 'section', key })

describe('isDualStack (#313)', () => {
  it('vrai UNIQUEMENT pour [.., kb-node, task] — un task ouvert depuis un kb-node', () => {
    expect(isDualStack([kb('a'), task(1)])).toBe(true)
    expect(isDualStack([task(2), kb('a'), task(1)])).toBe(true)
  })
  it('faux pour tous les autres sommets de pile', () => {
    expect(isDualStack([])).toBe(false)
    expect(isDualStack([task(1)])).toBe(false)
    expect(isDualStack([kb('a')])).toBe(false)
    expect(isDualStack([task(1), kb('a')])).toBe(false)
    expect(isDualStack([task(1), task(2)])).toBe(false)
    expect(isDualStack([section('backlog'), task(1)])).toBe(false)
  })
})

describe('pushEntry (#313)', () => {
  it('initialise la pile quand elle est vide', () => {
    expect(pushEntry([], task(1))).toEqual([task(1)])
  })
  it('no-op si le cran demandé est déjà au sommet (double-clic)', () => {
    const stack = [kb('a'), task(1)]
    expect(pushEntry(stack, task(1))).toBe(stack)
  })
  it('empile les flux simples inchangés (task sur task, kb sur task, section…)', () => {
    expect(pushEntry([task(1)], task(2))).toEqual([task(1), task(2)])
    expect(pushEntry([task(1)], kb('a'))).toEqual([task(1), kb('a')])
    expect(pushEntry([section('s')], task(1))).toEqual([section('s'), task(1)])
  })
  it('ouvre le mode double : task poussé sur un kb-node empile normalement', () => {
    const next = pushEntry([kb('a')], task(1))
    expect(next).toEqual([kb('a'), task(1)])
    expect(isDualStack(next)).toBe(true)
  })
  it('en mode double, un autre task REMPLACE celui de droite (pas d\'empilement)', () => {
    expect(pushEntry([kb('a'), task(1)], task(2))).toEqual([kb('a'), task(2)])
    // le dessous de pile est préservé tel quel
    expect(pushEntry([task(9), kb('a'), task(1)], task(2))).toEqual([task(9), kb('a'), task(2)])
  })
  it('en mode double, un cran non-task empile normalement (sortie du mode double)', () => {
    const next = pushEntry([kb('a'), task(1)], kb('b'))
    expect(next).toEqual([kb('a'), task(1), kb('b')])
    expect(isDualStack(next)).toBe(false)
  })
})
