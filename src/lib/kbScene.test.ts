import { describe, it, expect } from 'vitest'
import { edgePaths, buildAdjacency, revealDelays, nodesBox } from './kbScene'
import type { KbPlaced } from './kbLayout'

const place = (id: string, x: number, y: number, degree = 1): [string, KbPlaced] =>
  [id, { id, x, y, r: 5, degree }]

const PLACED = new Map<string, KbPlaced>([
  place('a', 0, 0, 3),
  place('b', 10, 0, 2),
  place('c', 0, 10, 1),
])

describe('edgePaths', () => {
  it('agrège plein (EXTRACTED) et pointillé (le reste) en 2 chaînes de path', () => {
    const { solid, dashed } = edgePaths(
      [
        { source: 'a', target: 'b', confidence: 'EXTRACTED' },
        { source: 'a', target: 'c', confidence: 'INFERRED' },
        { source: 'b', target: 'c', confidence: 'AMBIGUOUS' },
      ],
      PLACED,
    )
    expect(solid).toBe('M0 0L10 0')
    expect(dashed).toBe('M0 0L0 10M10 0L0 10')
  })

  it('ignore les arêtes dont une extrémité n\'est pas placée', () => {
    const { solid, dashed } = edgePaths(
      [{ source: 'a', target: 'zz', confidence: 'EXTRACTED' }],
      PLACED,
    )
    expect(solid).toBe('')
    expect(dashed).toBe('')
  })

  it('`only` restreint aux arêtes touchant CE nœud (surcouche de survol)', () => {
    const edges = [
      { source: 'a', target: 'b', confidence: 'EXTRACTED' },
      { source: 'b', target: 'c', confidence: 'EXTRACTED' },
    ]
    const { solid } = edgePaths(edges, PLACED, 'a')
    expect(solid).toBe('M0 0L10 0') // b-c écartée
  })

  it('arrondit les coordonnées à 2 décimales (poids du DOM)', () => {
    const placed = new Map<string, KbPlaced>([place('a', 1.23456, 2.98765), place('b', 3, 4)])
    const { solid } = edgePaths([{ source: 'a', target: 'b', confidence: 'EXTRACTED' }], placed)
    expect(solid).toBe('M1.23 2.99L3 4')
  })
})

describe('nodesBox (bbox du re-centrage KB, #311)', () => {
  it('englobe TOUS les nœuds, rayon compris', () => {
    // a(0,0,r5), b(10,0,r5), c(0,10,r5) → [-5..15] × [-5..15]
    const box = nodesBox(PLACED)
    expect(box).toEqual({ x: -5, y: -5, w: 20, h: 20 })
  })

  it('restreint au sous-ensemble `ids` (fit des résultats de recherche)', () => {
    const box = nodesBox(PLACED, new Set(['b'])) // seul b(10,0,r5)
    expect(box).toEqual({ x: 5, y: -5, w: 10, h: 10 })
  })

  it('ignore les ids absents ; ensemble vide/aucun nœud → null', () => {
    expect(nodesBox(PLACED, new Set(['zz']))).toBeNull()
    expect(nodesBox(new Map())).toBeNull()
  })
})

describe('buildAdjacency', () => {
  it('adjacence symétrique (voisinage à 1 saut)', () => {
    const adj = buildAdjacency([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
    ])
    expect([...adj.get('a')!].sort()).toEqual(['b', 'c'])
    expect([...adj.get('b')!]).toEqual(['a'])
    expect([...adj.get('c')!]).toEqual(['a'])
  })
})

describe('revealDelays', () => {
  it('hubs d\'abord : le degré le plus fort tombe dans le premier lot', () => {
    const d = revealDelays(PLACED, 1)
    expect(d.get('a')).toBe(0) // degré 3
    expect(d.get('b')).toBe(1)
    expect(d.get('c')).toBe(2)
  })

  it('regroupe par lots de batchSize', () => {
    const d = revealDelays(PLACED, 2)
    expect(d.get('a')).toBe(0)
    expect(d.get('b')).toBe(0)
    expect(d.get('c')).toBe(1)
  })

  it('déterministe à degré égal (départage par id)', () => {
    const placed = new Map<string, KbPlaced>([place('z', 0, 0, 1), place('a', 1, 1, 1)])
    const d = revealDelays(placed, 1)
    expect(d.get('a')).toBe(0)
    expect(d.get('z')).toBe(1)
  })
})
