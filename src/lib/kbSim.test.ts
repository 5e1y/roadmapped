import { describe, it, expect } from 'vitest'
import { createKbSim, applyRepulsion, KB_SIM } from './kbSim'
import type { KbLayoutInput } from './kbLayout'
import { normalizeGraph } from '../server/kb'
import sample from './__fixtures__/kbGraph.sample.json'

/** L'échantillon node-link → input de sim (mêmes clés que la prod). */
function inputFromSample(): KbLayoutInput {
  const g = normalizeGraph(sample, null)
  return {
    nodes: g.nodes.map((n) => ({ id: n.id })),
    edges: g.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
  }
}

/** Petit graphe synthétique : une étoile (hub) + une chaîne + un isolé. */
function star(): KbLayoutInput {
  return {
    nodes: ['hub', 'a', 'b', 'c', 'd', 'e', 'lone'].map((id) => ({ id })),
    edges: [
      { source: 'hub', target: 'a' },
      { source: 'hub', target: 'b' },
      { source: 'hub', target: 'c' },
      { source: 'c', target: 'd' },
      { source: 'd', target: 'e' },
    ],
  }
}

const ticksToSettle = (sim: ReturnType<typeof createKbSim>, max = 1000): number => {
  let t = 0
  while (!sim.settled && t < max) { sim.tick(); t++ }
  return t
}

describe('applyRepulsion (Barnes-Hut, #316)', () => {
  /** Répulsion naïve O(n²) — l'étalon de la comparaison. */
  function naive(n: number, x: Float64Array, y: Float64Array, s: Float64Array, alpha: number) {
    const vx = new Float64Array(n)
    const vy = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const dx = x[j] - x[i]
        const dy = y[j] - y[i]
        let l = dx * dx + dy * dy
        if (l >= KB_SIM.DIST_MAX2 || l === 0) continue
        if (l < KB_SIM.DIST_MIN2) l = Math.sqrt(KB_SIM.DIST_MIN2 * l)
        vx[i] += (dx * s[j] * alpha) / l
        vy[i] += (dy * s[j] * alpha) / l
      }
    }
    return { vx, vy }
  }

  /** Nuage déterministe (phyllotaxie) — aucune superposition, aucun aléa. */
  function cloud(n: number) {
    const x = new Float64Array(n)
    const y = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      const r = 12 * Math.sqrt(i + 0.5)
      const a = i * 2.399963229728653
      x[i] = 500 + r * Math.cos(a)
      y[i] = 500 + r * Math.sin(a)
    }
    return { x, y }
  }

  it('approxime la répulsion naïve O(n²) (θ = 0.9 → erreur moyenne < 5 %)', () => {
    const n = 300
    const { x, y } = cloud(n)
    const s = new Float64Array(n).fill(-60)
    const vx = new Float64Array(n)
    const vy = new Float64Array(n)
    applyRepulsion(n, x, y, s, vx, vy, 1)
    const ref = naive(n, x, y, s, 1)
    let errSum = 0
    for (let i = 0; i < n; i++) {
      const mag = Math.hypot(ref.vx[i], ref.vy[i])
      const err = Math.hypot(vx[i] - ref.vx[i], vy[i] - ref.vy[i])
      expect(Number.isFinite(vx[i])).toBe(true)
      expect(Number.isFinite(vy[i])).toBe(true)
      errSum += mag > 0 ? err / mag : 0
    }
    expect(errSum / n).toBeLessThan(0.05)
  })

  it('écarte deux points superposés (jiggle déterministe, pas de NaN)', () => {
    const x = Float64Array.from([10, 10, 40])
    const y = Float64Array.from([10, 10, 10])
    const s = new Float64Array(3).fill(-30)
    const vx = new Float64Array(3)
    const vy = new Float64Array(3)
    applyRepulsion(3, x, y, s, vx, vy, 1)
    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(vx[i])).toBe(true)
      expect(Number.isFinite(vy[i])).toBe(true)
    }
    // Les deux superposés sont poussés (force non nulle).
    expect(Math.hypot(vx[0], vy[0])).toBeGreaterThan(0)
    expect(Math.hypot(vx[1], vy[1])).toBeGreaterThan(0)
  })
})

describe('createKbSim (#316 — sim live)', () => {
  it('génération : départ en petit nuage au centre, puis le réseau S\'ÉCARTE', () => {
    const sim = createKbSim(inputFromSample())
    const cx = sim.width / 2
    const cy = sim.height / 2
    const spread = () => {
      let m = 0
      for (const p of sim.placed.values()) m = Math.max(m, Math.hypot(p.x - cx, p.y - cy))
      return m
    }
    const start = spread()
    // Nuage initial : rayon ∝ CLUSTER_R·√n — bien plus petit que la boîte.
    expect(start).toBeLessThan(KB_SIM.CLUSTER_R * Math.sqrt(sim.placed.size + 1) + 1)
    sim.tick(120)
    expect(spread()).toBeGreaterThan(start * 2)
    for (const p of sim.placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(sim.width)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(sim.height)
    }
  })

  it('déterministe : deux sims sur les mêmes données ⇒ mêmes positions', () => {
    const a = createKbSim(inputFromSample())
    const b = createKbSim(inputFromSample())
    a.tick(100)
    b.tick(100)
    for (const [id, p] of a.placed) {
      const q = b.placed.get(id)!
      expect(q.x).toBe(p.x)
      expect(q.y).toBe(p.y)
    }
  })

  it('alpha decay : la sim se REFROIDIT et s\'arrête en ~180 ticks', () => {
    const sim = createKbSim(inputFromSample())
    const t = ticksToSettle(sim)
    expect(t).toBeGreaterThan(120)
    expect(t).toBeLessThan(260)
    // Stabilisée : un tick supplémentaire ne déplace (quasiment) plus rien.
    const before = new Map([...sim.placed].map(([id, p]) => [id, { x: p.x, y: p.y }]))
    sim.tick()
    for (const [id, p] of sim.placed) {
      const b = before.get(id)!
      expect(Math.hypot(p.x - b.x, p.y - b.y)).toBeLessThan(0.5)
    }
  })

  it('kick réchauffe une sim stabilisée (elle repart, puis se repose)', () => {
    const sim = createKbSim(star())
    ticksToSettle(sim)
    expect(sim.settled).toBe(true)
    sim.kick(0.5)
    expect(sim.settled).toBe(false)
    expect(ticksToSettle(sim)).toBeGreaterThan(0)
  })

  it('alphaTarget (drag) : la sim reste CHAUDE tant que le plancher est posé', () => {
    const sim = createKbSim(star())
    sim.setAlphaTarget(KB_SIM.DRAG_TARGET)
    sim.tick(400)
    expect(sim.settled).toBe(false)
    expect(sim.alpha).toBeGreaterThan(KB_SIM.DRAG_TARGET * 0.9)
    sim.setAlphaTarget(0)
    ticksToSettle(sim)
    expect(sim.settled).toBe(true)
  })

  it('pin : le nœud épinglé reste EXACTEMENT sous le curseur, les voisins suivent', () => {
    const sim = createKbSim(star())
    sim.tick(60)
    const target = { x: sim.width * 0.8, y: sim.height * 0.2 }
    const neighborBefore = { ...sim.placed.get('a')! }
    sim.pin('hub', target.x, target.y)
    sim.setAlphaTarget(KB_SIM.DRAG_TARGET)
    sim.tick(40)
    const hub = sim.placed.get('hub')!
    expect(hub.x).toBe(target.x)
    expect(hub.y).toBe(target.y)
    // Le voisin direct a été tiré vers la nouvelle position du hub (ressort).
    const a = sim.placed.get('a')!
    const distBefore = Math.hypot(neighborBefore.x - target.x, neighborBefore.y - target.y)
    const distAfter = Math.hypot(a.x - target.x, a.y - target.y)
    expect(distAfter).toBeLessThan(distBefore)
    // unpin : le nœud rejoint la sim (il redevient mobile).
    sim.unpin('hub')
    sim.setAlphaTarget(0)
    sim.tick(30)
    expect(Math.hypot(sim.placed.get('hub')!.x - target.x, sim.placed.get('hub')!.y - target.y)).toBeGreaterThan(0)
  })

  it('morph : survivants en place (identité stable), entrants près de leurs voisins, sim réchauffée', () => {
    const sim = createKbSim(star())
    ticksToSettle(sim)
    const hubBefore = sim.placed.get('hub')!
    const posBefore = { x: hubBefore.x, y: hubBefore.y }

    // Sous-graphe élargi : les mêmes nœuds + un entrant accroché au hub,
    // moins l'isolé (disparu).
    sim.morph({
      nodes: ['hub', 'a', 'b', 'c', 'd', 'e', 'new1'].map((id) => ({ id })),
      edges: [
        { source: 'hub', target: 'a' },
        { source: 'hub', target: 'b' },
        { source: 'hub', target: 'c' },
        { source: 'c', target: 'd' },
        { source: 'd', target: 'e' },
        { source: 'hub', target: 'new1' },
      ],
    })
    // Survivant : même objet KbPlaced (les mémos React restent stables), même position.
    expect(sim.placed.get('hub')).toBe(hubBefore)
    expect(hubBefore.x).toBe(posBefore.x)
    expect(hubBefore.y).toBe(posBefore.y)
    // Disparu : retiré.
    expect(sim.placed.has('lone')).toBe(false)
    // Entrant : présent, posé PRÈS de son voisin déjà placé (pas au centre).
    const entrant = sim.placed.get('new1')!
    expect(Math.hypot(entrant.x - posBefore.x, entrant.y - posBefore.y)).toBeLessThan(60)
    // Réchauffée : la sim repart.
    expect(sim.settled).toBe(false)
    expect(sim.alpha).toBeGreaterThanOrEqual(KB_SIM.MORPH_ALPHA)
  })

  it('rayons ∝ degré (parité DA kbLayout) : hub plus gros que feuille, bornés [5, 22]', () => {
    const sim = createKbSim(star())
    const hub = sim.placed.get('hub')!
    const leaf = sim.placed.get('e')!
    expect(hub.r).toBeGreaterThan(leaf.r)
    for (const p of sim.placed.values()) {
      expect(p.r).toBeGreaterThanOrEqual(5)
      expect(p.r).toBeLessThanOrEqual(22)
    }
  })

  it('graphe vide : settled immédiat, aucun nœud, boîte non nulle', () => {
    const sim = createKbSim({ nodes: [], edges: [] })
    expect(sim.settled).toBe(true)
    expect(sim.placed.size).toBe(0)
    expect(sim.width).toBeGreaterThan(0)
    sim.tick(10) // ne jette pas
  })
})
