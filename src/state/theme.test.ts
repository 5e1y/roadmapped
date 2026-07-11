import { describe, it, expect } from 'vitest'
import { resolveTheme, nextMode } from './theme'

describe('resolveTheme (#269)', () => {
  it('un choix explicite stocké prime sur le système', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
  it('sans choix stocké, suit le système', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })
  it('toute valeur stockée non reconnue retombe sur le système', () => {
    expect(resolveTheme('', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('DARK', false)).toBe('light') // sensible à la casse
  })
})

describe('nextMode (#270)', () => {
  it('cycle complet système → clair → sombre → système', () => {
    expect(nextMode('system')).toBe('light')
    expect(nextMode('light')).toBe('dark')
    expect(nextMode('dark')).toBe('system')
  })
})
