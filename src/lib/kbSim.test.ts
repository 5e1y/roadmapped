import { describe, it, expect } from 'vitest'
import {
  createKbSim, applyRepulsion, orderByDegree,
  KB_SIM, KB_SIM_LIMITS, resolveKbSimParams, sanitizeKbSimOverrides,
} from './kbSim'
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

  it('approxime la répulsion naïve O(n²) (θ défaut = 0.5 → erreur moyenne < 5 %)', () => {
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
    }
  })

  it('#319 — pas de mur : les positions peuvent SORTIR de la boîte de layout', () => {
    // Nœuds isolés (aucun ressort de rappel) + centrage coupé : la répulsion
    // les écarte jusqu'à sa portée (~800 px) — bien au-delà de la boîte
    // minimale (600). Avant #319, le clamp PAD les empilait au bord.
    const lone = { nodes: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}` })), edges: [] }
    const sim = createKbSim(lone, { CENTER_K: 0 })
    sim.tick(300)
    let out = false
    for (const p of sim.placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      if (p.x < 0 || p.x > sim.width || p.y < 0 || p.y > sim.height) out = true
    }
    expect(out).toBe(true)
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

  it('alpha decay : la sim se REFROIDIT et s\'arrête en ~240 ticks (#321)', () => {
    const sim = createKbSim(inputFromSample())
    const t = ticksToSettle(sim)
    expect(t).toBeGreaterThan(200)
    expect(t).toBeLessThan(320)
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

  it('rayons ∝ degré (parité DA kbLayout) : hub plus gros que feuille, bornés [7, 40] (#321)', () => {
    const sim = createKbSim(star())
    const hub = sim.placed.get('hub')!
    const leaf = sim.placed.get('e')!
    expect(hub.r).toBeGreaterThan(leaf.r)
    for (const p of sim.placed.values()) {
      expect(p.r).toBeGreaterThanOrEqual(7)
      expect(p.r).toBeLessThanOrEqual(40)
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

describe('params injectés (#318 — defaults + overrides)', () => {
  it('#321 — les défauts tunés et validés par Rémi via le panneau Display', () => {
    expect(KB_SIM.LINK_DIST).toBe(160)
    expect(KB_SIM.CHARGE_BASE).toBe(-200)
    expect(KB_SIM.CENTER_K).toBe(0.04)
    expect(KB_SIM.VELOCITY_KEEP).toBe(0.5) // Friction UI = 1 − 0.5 = 0.50
    expect(KB_SIM.ALPHA_DECAY).toBe(1 - Math.pow(0.001, 1 / 240)) // settle = 240 ticks
    expect(KB_SIM.THETA).toBe(0.5) // θ² dérivé = 0.25
    expect(KB_SIM.R_MIN).toBe(7)
    expect(KB_SIM.R_MAX).toBe(40)
  })

  it('resolveKbSimParams : sans override = copie des défauts', () => {
    const p = resolveKbSimParams()
    expect(p).toEqual({ ...KB_SIM })
    expect(p).not.toBe(KB_SIM)
  })

  it('fusionne un override PARTIEL, ignore undefined et non-finis', () => {
    const p = resolveKbSimParams({
      LINK_DIST: 90,
      CHARGE_BASE: Number.NaN,
      CENTER_K: undefined,
      THETA: Infinity,
    })
    expect(p.LINK_DIST).toBe(90)
    expect(p.CHARGE_BASE).toBe(KB_SIM.CHARGE_BASE)
    expect(p.CENTER_K).toBe(KB_SIM.CENTER_K)
    expect(p.THETA).toBe(KB_SIM.THETA)
    expect(p.R_MAX).toBe(KB_SIM.R_MAX)
  })

  it('sanitize : rejette tout ce qui n\'est pas un objet de nombres finis sur des clés connues', () => {
    expect(sanitizeKbSimOverrides(null)).toEqual({})
    expect(sanitizeKbSimOverrides('x')).toEqual({})
    expect(sanitizeKbSimOverrides([1, 2])).toEqual({})
    // Clé inconnue, valeur string, NaN, clé non-customisable : tout tombe.
    expect(sanitizeKbSimOverrides({ LINK_DIST: '90', CHARGE_BASE: NaN, WAT: 5, ALPHA_MIN: 0.5 })).toEqual({})
  })

  it('sanitize : clampe aux bornes KB_SIM_LIMITS (localStorage trafiqué)', () => {
    const o = sanitizeKbSimOverrides({ LINK_DIST: 9999, CHARGE_BASE: -9999, THETA: 0, R_MAX: 12 })
    expect(o.LINK_DIST).toBe(KB_SIM_LIMITS.LINK_DIST[1])
    expect(o.CHARGE_BASE).toBe(KB_SIM_LIMITS.CHARGE_BASE[0])
    expect(o.THETA).toBe(KB_SIM_LIMITS.THETA[0])
    expect(o.R_MAX).toBe(12)
  })

  it('createKbSim(input, params) : l\'override CHANGE la physique (LINK_DIST)', () => {
    const a = createKbSim(star())
    const b = createKbSim(star(), { LINK_DIST: 55 })
    a.tick(150)
    b.tick(150)
    const hubToA = (s: ReturnType<typeof createKbSim>) => {
      const h = s.placed.get('hub')!
      const q = s.placed.get('a')!
      return Math.hypot(h.x - q.x, h.y - q.y)
    }
    // Ressorts plus courts (55 < défaut 160) ⇒ voisins plus près du hub.
    expect(hubToA(b)).toBeLessThan(hubToA(a))
  })

  it('setParams à chaud : re-dérive rayons/charges, positions et vélocités INTACTES', () => {
    const sim = createKbSim(star())
    sim.tick(60)
    const before = new Map([...sim.placed].map(([id, p]) => [id, { x: p.x, y: p.y }]))
    const hubR = sim.placed.get('hub')!.r
    sim.setParams({ R_MAX: 48 })
    // Rayon re-dérivé sur les objets placed (mêmes identités — mémos React stables).
    expect(sim.placed.get('hub')!.r).toBeGreaterThan(hubR)
    for (const [id, p] of sim.placed) {
      expect(p.x).toBe(before.get(id)!.x)
      expect(p.y).toBe(before.get(id)!.y)
    }
    // La sim continue de tourner sainement avec les nouveaux params.
    sim.kick(0.5)
    sim.tick(60)
    for (const p of sim.placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('setParams() sans argument : retour aux défauts', () => {
    const sim = createKbSim(star(), { R_MAX: 48 })
    const withOverride = sim.placed.get('hub')!.r
    sim.setParams()
    expect(sim.placed.get('hub')!.r).toBeLessThan(withOverride)
    expect(sim.placed.get('hub')!.r).toBeLessThanOrEqual(KB_SIM.R_MAX)
  })
})

describe('entrée progressive (#317 — reveal staggered)', () => {
  it('orderByDegree : hubs d\'abord, départage par id, arêtes intactes', () => {
    const o = orderByDegree(star())
    expect(o.nodes.map((n) => n.id)).toEqual(['hub', 'c', 'd', 'a', 'b', 'e', 'lone'])
    expect(o.edges).toEqual(star().edges)
  })

  it('initialReveal : seuls les premiers nœuds EXISTENT (placed, forces)', () => {
    const sim = createKbSim(orderByDegree(star()), undefined, { initialReveal: 3 })
    expect(sim.revealed).toBe(3)
    expect(sim.total).toBe(7)
    expect(sim.placed.size).toBe(3)
    expect(sim.placed.has('hub')).toBe(true)
    expect(sim.placed.has('lone')).toBe(false)
    sim.tick(50)
    // Les non-entrés ne rejoignent pas d'eux-mêmes.
    expect(sim.placed.size).toBe(3)
    for (const p of sim.placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('reveal : monotone, clampé, spawn PRÈS d\'un voisin déjà entré, réchauffe', () => {
    const sim = createKbSim(orderByDegree(star()), undefined, { initialReveal: 1 })
    ticksToSettle(sim)
    expect(sim.settled).toBe(true)
    const hub = sim.placed.get('hub')!
    sim.reveal(2) // fait entrer 'c' — voisin direct du hub
    expect(sim.revealed).toBe(2)
    const c = sim.placed.get('c')!
    expect(Math.hypot(c.x - hub.x, c.y - hub.y)).toBeLessThan(40)
    // Le lot réchauffe : une sim refroidie repart.
    expect(sim.settled).toBe(false)
    // Monotone : jamais de retour en arrière.
    sim.reveal(1)
    expect(sim.revealed).toBe(2)
    // Clampé au total, tout le monde finit dans placed.
    sim.reveal(99)
    expect(sim.revealed).toBe(7)
    expect(sim.placed.size).toBe(7)
    sim.tick(200)
    for (const p of sim.placed.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it('déterministe avec le MÊME calendrier de reveal', () => {
    const mk = () => createKbSim(orderByDegree(inputFromSample()), undefined, { initialReveal: 4 })
    const run = (s: ReturnType<typeof mk>) => {
      s.tick(10); s.reveal(8); s.tick(10); s.reveal(14); s.tick(60)
    }
    const a = mk()
    const b = mk()
    run(a)
    run(b)
    expect(a.placed.size).toBe(b.placed.size)
    for (const [id, p] of a.placed) {
      const q = b.placed.get(id)!
      expect(q.x).toBe(p.x)
      expect(q.y).toBe(p.y)
    }
  })

  it('morph pendant le reveal : la nouvelle vue est ENTIÈREMENT révélée', () => {
    const sim = createKbSim(orderByDegree(star()), undefined, { initialReveal: 2 })
    sim.tick(10)
    sim.morph(star())
    expect(sim.revealed).toBe(sim.total)
    expect(sim.placed.size).toBe(7)
  })
})
