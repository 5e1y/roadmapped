import { describe, it, expect } from 'vitest'
import { kbLayout, type KbLayoutInput } from './kbLayout'
import { normalizeGraph } from '../server/kb'
import sample from './__fixtures__/kbGraph.sample.json'

/** L'échantillon node-link → input de layout (mêmes clés que la prod). */
function inputFromSample(): KbLayoutInput {
  const g = normalizeGraph(sample, null)
  return {
    nodes: g.nodes.map((n) => ({ id: n.id })),
    edges: g.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
  }
}

describe('kbLayout', () => {
  it('place chaque nœud dans la boîte (déterministe, sans NaN)', () => {
    const input = inputFromSample()
    const out = kbLayout(input)
    expect(out.nodes.size).toBe(input.nodes.length)
    for (const p of out.nodes.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(out.width)
      expect(p.y).toBeLessThanOrEqual(out.height)
    }
  })

  it('mêmes données ⇒ mêmes positions (aucun aléa)', () => {
    const a = kbLayout(inputFromSample())
    const b = kbLayout(inputFromSample())
    for (const [id, p] of a.nodes) {
      expect(b.nodes.get(id)).toEqual(p)
    }
  })

  it('rayon ∝ degré : le nœud le plus connecté est le plus gros', () => {
    const input = inputFromSample()
    const out = kbLayout(input)
    const placed = [...out.nodes.values()].sort((x, y) => y.degree - x.degree)
    const top = placed[0]
    const leaf = [...out.nodes.values()].find((p) => p.degree === 1)!
    expect(top.r).toBeGreaterThan(leaf.r)
  })

  it('graphe vide → boîte minimale, aucune position', () => {
    const out = kbLayout({ nodes: [], edges: [] })
    expect(out.nodes.size).toBe(0)
    expect(out.width).toBeGreaterThan(0)
  })
})
