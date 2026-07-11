import { describe, it, expect } from 'vitest'
import { relativeTime, absoluteDate } from './relativeTime'

const NOW = Date.parse('2026-07-08T12:00:00')

describe('relativeTime (#126)', () => {
  it('< 1 min → just now', () => {
    expect(relativeTime('2026-07-08T11:59:30', NOW)).toBe('just now')
  })
  it('hours, days, weeks, months, years in English', () => {
    expect(relativeTime('2026-07-08T09:00:00', NOW)).toBe('3 hours ago')
    expect(relativeTime('2026-07-05T12:00:00', NOW)).toBe('3 days ago')
    expect(relativeTime('2026-06-24T12:00:00', NOW)).toBe('2 weeks ago')
    expect(relativeTime('2026-05-08T12:00:00', NOW)).toBe('2 months ago')
    expect(relativeTime('2025-07-08T12:00:00', NOW)).toBe('1 year ago')
  })
  it('numeric always: « 1 day ago » (not « yesterday »)', () => {
    expect(relativeTime('2026-07-07T12:00:00', NOW)).toBe('1 day ago')
  })
  it('accepte un timestamp ms (notes)', () => {
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe('1 hour ago')
  })
  it('entrée non parsable → renvoyée telle quelle', () => {
    expect(relativeTime('pas-une-date', NOW)).toBe('pas-une-date')
  })
  // #292 : une DATE SEULE ne porte que le jour — jamais d'heures/minutes (« 10 hours
  // ago » pour aujourd'hui était le bug). Granularité JOUR calendaire, TZ-indépendant :
  // quelle que soit l'heure du jour, une date seule d'aujourd'hui = « today ».
  it('date seule : granularité jour (« today », jamais des heures)', () => {
    expect(relativeTime('2026-07-08', NOW)).toBe('today') // NOW = midi ; jadis « 12 hours ago »
    expect(relativeTime('2026-07-08', Date.parse('2026-07-08T23:59:00'))).toBe('today')
    expect(relativeTime('2026-07-08', Date.parse('2026-07-08T00:00:01'))).toBe('today')
    expect(relativeTime('2026-07-07', NOW)).toBe('1 day ago')
    expect(relativeTime('2026-07-05', NOW)).toBe('3 days ago')
    expect(relativeTime('2026-06-24', NOW)).toBe('2 weeks ago')
  })
})

describe('absoluteDate', () => {
  it('en-US format « Jul 8, 2026 »', () => {
    expect(absoluteDate('2026-07-08')).toBe('Jul 8, 2026')
  })
})
