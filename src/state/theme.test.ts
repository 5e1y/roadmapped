import { describe, it, expect, afterEach } from 'vitest'
import { resolveTheme, nextMode, resolveThemeName, setThemeName, THEME_NAMES } from './theme'

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

describe('resolveThemeName (#394)', () => {
  it('un nom connu stocké est conservé', () => {
    for (const n of THEME_NAMES) expect(resolveThemeName(n)).toBe(n)
  })
  it('null / inconnu / mauvaise casse retombe sur la base Roadmapped', () => {
    expect(resolveThemeName(null)).toBe('roadmapped')
    expect(resolveThemeName('')).toBe('roadmapped')
    expect(resolveThemeName('vscode')).toBe('roadmapped')
    expect(resolveThemeName('GitHub')).toBe('roadmapped') // sensible à la casse
  })
})

describe('setThemeName (#394) — attribut + persistance', () => {
  afterEach(() => {
    delete document.documentElement.dataset.themeName
    try { localStorage.removeItem('ui:theme-name') } catch { /* ignore */ }
  })
  it('un thème non-base pose data-theme-name et le persiste', () => {
    setThemeName('claude')
    expect(document.documentElement.dataset.themeName).toBe('claude')
    expect(localStorage.getItem('ui:theme-name')).toBe('claude')
  })
  it('Roadmapped EFFACE l\'attribut (base = absence de bloc) mais persiste le choix', () => {
    setThemeName('github')
    setThemeName('roadmapped')
    expect(document.documentElement.dataset.themeName).toBeUndefined()
    expect(localStorage.getItem('ui:theme-name')).toBe('roadmapped')
  })
})
