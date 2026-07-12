import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cachedKbLayout, ensureKbLayout, warmKbLayout, layoutInput } from './kbLayoutCache'
import { kbLayout, type KbLayoutInput } from './kbLayout'
import { filterKey } from './kbFilter'
import type { KbNode, KbEdge, KbGraph } from '../server/kb'

const node = (id: string): KbNode =>
  ({ id, label: id.toUpperCase(), fileType: 'code', sourceFile: `src/${id}.ts`, sourceLocation: null, community: 0 })
const edge = (source: string, target: string): KbEdge =>
  ({ source, target, relation: 'r', confidence: 'EXTRACTED', weight: 1 })

const NODES = [node('a'), node('b'), node('c')]
const EDGES = [edge('a', 'b'), edge('a', 'c')]
// Chaque test fabrique SON objet graphe : le cache est keyé par identité (WeakMap).
const graph = (): KbGraph => ({
  generatedAt: null, nodes: NODES, edges: EDGES,
  stats: { nodes: NODES.length, edges: EDGES.length, communities: 1 },
})
const input = (): KbLayoutInput => layoutInput({ nodes: NODES, edges: EDGES })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ensureKbLayout', () => {
  it('calcule en tranches (setTimeout) puis notifie avec le même résultat que kbLayout', () => {
    const g = graph()
    const done = vi.fn()
    ensureKbLayout(g, 'k', input(), done)
    expect(done).not.toHaveBeenCalled() // rien de synchrone : le job est découpé
    vi.runAllTimers()
    expect(done).toHaveBeenCalledTimes(1)
    const result = done.mock.calls[0][0]
    const sync = kbLayout(input())
    expect(result.width).toBe(sync.width)
    for (const [id, p] of sync.nodes) expect(result.nodes.get(id)).toEqual(p)
    expect(cachedKbLayout(g, 'k')).toBe(result)
  })

  it('cache chaud → onDone synchrone, aucun timer', () => {
    const g = graph()
    ensureKbLayout(g, 'k', input(), () => {})
    vi.runAllTimers()
    const done = vi.fn()
    ensureKbLayout(g, 'k', input(), done)
    expect(done).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('job en vol partagé : deux abonnés, UN seul calcul, deux notifications', () => {
    const g = graph()
    const a = vi.fn()
    const b = vi.fn()
    ensureKbLayout(g, 'k', input(), a)
    ensureKbLayout(g, 'k', input(), b)
    vi.runAllTimers()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(a.mock.calls[0][0]).toBe(b.mock.calls[0][0]) // même objet résultat
  })

  it('désabonnement : plus notifié, mais le job alimente quand même le cache', () => {
    const g = graph()
    const done = vi.fn()
    const off = ensureKbLayout(g, 'k', input(), done)
    off()
    vi.runAllTimers()
    expect(done).not.toHaveBeenCalled()
    expect(cachedKbLayout(g, 'k')).not.toBeNull()
  })

  it('clés distinctes = layouts distincts (un par jeu de filtres)', () => {
    const g = graph()
    ensureKbLayout(g, 'k1', input(), () => {})
    ensureKbLayout(g, 'k2', layoutInput({ nodes: NODES.slice(0, 2), edges: [EDGES[0]] }), () => {})
    vi.runAllTimers()
    expect(cachedKbLayout(g, 'k1')?.nodes.size).toBe(3)
    expect(cachedKbLayout(g, 'k2')?.nodes.size).toBe(2)
  })
})

describe('warmKbLayout', () => {
  it('préchauffe la vue par défaut (clé = aucun filtre)', () => {
    const g = graph()
    warmKbLayout(g)
    vi.runAllTimers()
    const key = filterKey({ communities: [], fileTypes: [], hideInferred: false })
    expect(cachedKbLayout(g, key)?.nodes.size).toBe(3)
  })

  it('graphe vide : ne lance rien', () => {
    warmKbLayout({ generatedAt: null, nodes: [], edges: [], stats: { nodes: 0, edges: 0, communities: 0 } })
    expect(vi.getTimerCount()).toBe(0)
  })
})
