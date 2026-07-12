import { describe, it, expect } from 'vitest'
import { KbSimDriver, revealTarget } from './kbSimDriver'
import type { KbLayoutInput } from '../lib/kbLayout'

/**
 * #317 — la POLITIQUE d'entrée progressive du pilote : cadence pure
 * (revealTarget) + état de départ du driver (lot initial seulement, morphTo
 * révèle tout). La boucle rAF elle-même n'existe pas ici (jsdom sans rAF —
 * start() no-op par design) : elle est vérifiée en CDP sur le vrai graphe.
 */

/** Chaîne de `n` nœuds (n−1 arêtes) — assez gros pour déclencher le stagger. */
function chain(n: number): KbLayoutInput {
  return {
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges: Array.from({ length: n - 1 }, (_, i) => ({ source: `n${i}`, target: `n${i + 1}` })),
  }
}

describe('revealTarget (#317 — cadence d\'entrée)', () => {
  it('lot initial à t=0, puis +BATCH tous les EVERY ticks, jusqu\'au total', () => {
    expect(revealTarget(0, 869)).toBe(90)
    expect(revealTarget(7, 869)).toBe(90)
    expect(revealTarget(8, 869)).toBe(200)
    expect(revealTarget(999, 869)).toBe(869)
  })

  it('monotone, et 869 nœuds entrés en ≤ 90 ticks (~1,5 s à 60 fps)', () => {
    let prev = 0
    let done = Infinity
    for (let t = 0; t <= 120; t++) {
      const v = revealTarget(t, 869)
      expect(v).toBeGreaterThanOrEqual(prev)
      expect(v).toBeLessThanOrEqual(869)
      prev = v
      if (v === 869 && done === Infinity) done = t
    }
    expect(done).toBeLessThanOrEqual(90)
  })

  it('petit graphe : tout est là dès le tick 0 (pas de stagger perceptible)', () => {
    expect(revealTarget(0, 30)).toBe(30)
    expect(revealTarget(0, 90)).toBe(90)
  })
})

describe('KbSimDriver — génération staggered (#317)', () => {
  it('démarre avec SEULEMENT le lot initial actif (DOM + forces)', () => {
    const key = {}
    const input = chain(300)
    const driver = new KbSimDriver(key, input, [])
    expect(driver.sim.total).toBe(300)
    expect(driver.sim.revealed).toBe(90)
    expect(driver.sim.placed.size).toBe(90)
    driver.dispose()
  })

  it('en dessous du lot initial : tout est révélé dès la création', () => {
    const driver = new KbSimDriver({}, chain(12), [])
    expect(driver.sim.revealed).toBe(12)
    expect(driver.sim.placed.size).toBe(12)
    driver.dispose()
  })

  it('morphTo (filtre) révèle la nouvelle vue en entier', () => {
    const driver = new KbSimDriver({}, chain(300), [])
    const sub = chain(150)
    driver.morphTo({}, sub, [])
    expect(driver.sim.revealed).toBe(150)
    expect(driver.sim.placed.size).toBe(150)
    driver.dispose()
  })

  it('applyParams (#318) : réchauffe la sim (tuning live) et re-dérive les rayons', () => {
    const driver = new KbSimDriver({}, chain(40), [])
    let guard = 0
    while (!driver.sim.settled && guard++ < 2000) driver.sim.tick()
    expect(driver.sim.settled).toBe(true)
    const before = [...driver.sim.placed.values()][0].r
    driver.applyParams({ R_MIN: 10, R_MAX: 30 })
    expect(driver.sim.settled).toBe(false)
    expect([...driver.sim.placed.values()][0].r).not.toBe(before)
    driver.dispose()
  })
})
