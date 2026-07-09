import { describe, it, expect } from 'vitest'
import { isOutdated } from './updateNotifier'

describe('isOutdated (#207)', () => {
  it('détecte une version publiée plus récente', () => {
    expect(isOutdated('0.1.0', '0.2.0')).toBe(true)
    expect(isOutdated('0.1.0', '0.1.1')).toBe(true)
    expect(isOutdated('0.1.0', '1.0.0')).toBe(true)
    expect(isOutdated('1.2.9', '1.3.0')).toBe(true)
  })

  it('ne notifie pas si à jour ou en avance', () => {
    expect(isOutdated('0.2.0', '0.2.0')).toBe(false)
    expect(isOutdated('0.2.0', '0.1.9')).toBe(false)
    expect(isOutdated('1.0.0', '0.9.9')).toBe(false)
  })

  it('ignore le suffixe pré-release (comparaison x.y.z)', () => {
    expect(isOutdated('0.1.0', '0.1.0-beta.1')).toBe(false) // même x.y.z
    expect(isOutdated('0.1.0-beta', '0.2.0')).toBe(true)
  })

  it('tolère les composantes manquantes', () => {
    expect(isOutdated('1', '1.0.1')).toBe(true)
    expect(isOutdated('1.0', '1.0.0')).toBe(false)
  })
})
