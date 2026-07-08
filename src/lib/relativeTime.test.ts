import { describe, it, expect } from 'vitest'
import { relativeTime, absoluteDate } from './relativeTime'

const NOW = Date.parse('2026-07-08T12:00:00')

describe('relativeTime (#126)', () => {
  it('< 1 min → à l’instant', () => {
    expect(relativeTime('2026-07-08T11:59:30', NOW)).toBe("à l'instant")
  })
  it('heures, jours, semaines, mois, années en français', () => {
    expect(relativeTime('2026-07-08T09:00:00', NOW)).toBe('il y a 3 heures')
    expect(relativeTime('2026-07-05T12:00:00', NOW)).toBe('il y a 3 jours')
    expect(relativeTime('2026-06-24T12:00:00', NOW)).toBe('il y a 2 semaines')
    expect(relativeTime('2026-05-08T12:00:00', NOW)).toBe('il y a 2 mois')
    expect(relativeTime('2025-07-08T12:00:00', NOW)).toBe('il y a 1 an')
  })
  it('numeric always : « il y a 1 jour » (pas « hier »)', () => {
    expect(relativeTime('2026-07-07T12:00:00', NOW)).toBe('il y a 1 jour')
  })
  it('accepte un timestamp ms (notes)', () => {
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe('il y a 1 heure')
  })
  it('entrée non parsable → renvoyée telle quelle', () => {
    expect(relativeTime('pas-une-date', NOW)).toBe('pas-une-date')
  })
})

describe('absoluteDate', () => {
  it('format fr-FR jj/mm/aaaa', () => {
    expect(absoluteDate('2026-07-08')).toBe('08/07/2026')
  })
})
