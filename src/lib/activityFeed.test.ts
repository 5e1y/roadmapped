import { describe, expect, it } from 'vitest'
import { groupByDay, dayLabel, localMidnight } from './activityFeed'

/*
 * Le regroupement par jour du feed Activity (#377). Dates construites en LOCAL
 * (new Date(y, m, d, ...)) → test indépendant du fuseau de la CI. `now` est fixé
 * au 19/07/2026 10:00 local, comme dans le contexte de la vue.
 */

const NOW = new Date(2026, 6, 19, 10, 0, 0).getTime() // 19 juil. 2026, 10:00 local

const at = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  ({ receivedAt: new Date(y, mo - 1, d, h, mi, s).getTime() })

describe('localMidnight', () => {
  it('ramène un epoch ms au minuit local de son jour calendaire', () => {
    const noon = new Date(2026, 6, 19, 12, 34, 56).getTime()
    expect(localMidnight(noon)).toBe(new Date(2026, 6, 19, 0, 0, 0, 0).getTime())
  })
})

describe('dayLabel', () => {
  it('étiquette aujourd\'hui / hier / date courte', () => {
    const today = localMidnight(NOW)
    const yesterday = new Date(2026, 6, 18, 0, 0, 0).getTime()
    const older = new Date(2026, 6, 15, 0, 0, 0).getTime()
    expect(dayLabel(today, NOW)).toBe("Aujourd'hui")
    expect(dayLabel(yesterday, NOW)).toBe('Hier')
    expect(dayLabel(older, NOW)).toBe('2026-07-15')
  })
})

describe('groupByDay', () => {
  it('retourne [] pour un log vide', () => {
    expect(groupByDay([], NOW)).toEqual([])
  })

  it('groupe par jour local, en-têtes corrects, ordre récent→ancien préservé', () => {
    const log = [
      at(2026, 7, 19, 9, 0, 0), // aujourd'hui
      at(2026, 7, 19, 0, 0, 0), // aujourd'hui (minuit pile)
      at(2026, 7, 18, 8, 0, 0), // hier
      at(2026, 7, 17, 14, 0, 0), // avant-hier
    ]
    const groups = groupByDay(log, NOW)
    expect(groups.map((g) => g.label)).toEqual(["Aujourd'hui", 'Hier', '2026-07-17'])
    expect(groups.map((g) => g.entries.length)).toEqual([2, 1, 1])
    // Contiguïté : les 2 entrées d'aujourd'hui restent dans l'ordre du log.
    expect(groups[0].entries).toEqual([log[0], log[1]])
  })

  it('scinde à la frontière de minuit locale (23:59:59 hier vs 00:00:00 aujourd\'hui)', () => {
    const log = [
      at(2026, 7, 19, 0, 0, 0), // aujourd'hui, minuit pile
      at(2026, 7, 18, 23, 59, 59), // hier, 1 seconde avant
    ]
    const groups = groupByDay(log, NOW)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.label)).toEqual(["Aujourd'hui", 'Hier'])
  })
})
