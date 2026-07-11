import { describe, it, expect } from 'vitest'
import { communityOptions, fileTypeOptions, applyFilters, matchNodes } from './kbFilter'
import type { KbNode, KbEdge, KbGraph } from '../server/kb'

const node = (id: string, community: number, fileType = 'code', sourceFile: string | null = `src/${id}.ts`): KbNode =>
  ({ id, label: id.toUpperCase(), fileType, sourceFile, sourceLocation: null, community })
const edge = (source: string, target: string, confidence = 'EXTRACTED'): KbEdge =>
  ({ source, target, relation: 'r', confidence, weight: 1 })

const NODES: KbNode[] = [
  node('a', 0), node('b', 0), node('c', 0),
  node('d', 1, 'document', 'docs/d.md'),
  node('e', 1, 'document', 'docs/e.md'),
  node('f', -1), // sans communauté
]
// a est le god node de la communauté 0 (degré 2)
const EDGES: KbEdge[] = [edge('a', 'b'), edge('a', 'c'), edge('d', 'e', 'INFERRED')]
// KbNode/KbEdge déjà normalisés (pas de re-passage par normalizeGraph, qui attend
// du node-link snake_case brut).
const graph = (): KbGraph => ({
  generatedAt: null, nodes: NODES, edges: EDGES,
  stats: { nodes: NODES.length, edges: EDGES.length, communities: 2 },
})

describe('communityOptions', () => {
  it('une option par communauté (>=0), étiquetée par le god node, triée par taille', () => {
    const opts = communityOptions(NODES, EDGES)
    expect(opts.map((o) => o.value)).toEqual(['0', '1'])
    expect(opts[0]).toEqual({ value: '0', label: 'A', count: 3 }) // god = a (degré 2)
    expect(opts[1]).toEqual({ value: '1', label: 'D', count: 2 })
  })
})

describe('fileTypeOptions', () => {
  it('types distincts + compte, triés décroissant', () => {
    expect(fileTypeOptions(NODES)).toEqual([
      { value: 'code', label: 'code', count: 4 },
      { value: 'document', label: 'document', count: 2 },
    ])
  })
})

describe('applyFilters', () => {
  it('filtre par communauté (nœuds + arêtes internes)', () => {
    const { nodes, edges } = applyFilters(graph(), { communities: [0], fileTypes: [], hideInferred: false })
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(edges).toHaveLength(2) // a-b, a-c ; d-e écartée (nœuds hors filtre)
  })

  it('filtre par file_type', () => {
    const { nodes } = applyFilters(graph(), { communities: [], fileTypes: ['document'], hideInferred: false })
    expect(nodes.map((n) => n.id).sort()).toEqual(['d', 'e'])
  })

  it('hideInferred masque les arêtes non-EXTRACTED', () => {
    const { edges } = applyFilters(graph(), { communities: [], fileTypes: [], hideInferred: true })
    expect(edges.every((e) => e.confidence === 'EXTRACTED')).toBe(true)
    expect(edges).toHaveLength(2) // la d-e INFERRED disparaît
  })

  it('filtres vides = tout passe', () => {
    const { nodes, edges } = applyFilters(graph(), { communities: [], fileTypes: [], hideInferred: false })
    expect(nodes).toHaveLength(6)
    expect(edges).toHaveLength(3)
  })
})

describe('matchNodes', () => {
  it('matche label et source_file, insensible à la casse', () => {
    expect([...matchNodes(NODES, 'A')]).toEqual(['a']) // label "A"
    expect([...matchNodes(NODES, 'docs/d')]).toEqual(['d']) // source_file
  })

  it('requête vide → ensemble vide (pas de recherche active)', () => {
    expect(matchNodes(NODES, '   ').size).toBe(0)
  })
})
