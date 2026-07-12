import { describe, it, expect } from 'vitest'
import {
  kbNeighborhood, neighborhoodText, kbSearch, searchText, kbNode, nodeText,
  boundNeighborhood, briefNeighborhoodText,
} from './kbQuery'
import type { KbNode, KbEdge, KbGraph } from '../server/kb'
import type { TaskNode, TaskTree } from './tasks'

const task = (id: number, refs: string[], subtasks: TaskNode[] = []): TaskNode =>
  ({ id, refs, subtasks } as unknown as TaskNode)
const tree = (tasks: TaskNode[]): TaskTree =>
  ({ nextId: 99, epics: [], sections: [{ key: 'x', title: 'X', status: 'open', note: null, tasks }] } as unknown as TaskTree)
const node = (id: string, sourceFile: string | null, fileType = 'code'): KbNode =>
  ({ id, label: id.toUpperCase(), fileType, sourceFile, sourceLocation: null, community: -1 })
const edge = (source: string, target: string): KbEdge =>
  ({ source, target, relation: 'imports_from', confidence: 'EXTRACTED', weight: 1 })

const NODES: KbNode[] = [
  node('a', 'src/a.ts'), node('b', 'src/b.ts'), node('c', 'src/c.ts'), node('d', 'src/d.ts'),
]
const EDGES: KbEdge[] = [edge('a', 'b'), edge('a', 'c'), edge('c', 'd')]
const graph = (): KbGraph => ({ generatedAt: null, nodes: NODES, edges: EDGES, stats: { nodes: 4, edges: 3, communities: 0 } })

describe('kbNeighborhood + neighborhoodText', () => {
  it('renvoie directs (refs) + voisins 1 saut, réutilisant kbLink', () => {
    const nb = kbNeighborhood(tree([task(1, ['src/a.ts#foo'])]), graph(), 1)
    expect(nb.direct.map((n) => n.id)).toEqual(['a'])
    expect(nb.neighbors.map((n) => n.id)).toEqual(['b', 'c'])
    const txt = neighborhoodText(1, 'Fix A', nb)
    expect(txt).toContain('KB neighborhood of #1 — Fix A')
    expect(txt).toContain('directly touches (1)')
    expect(txt).toContain('connected 1 hop away (2)')
  })

  it('message clair quand la tâche n’a aucun ref matché', () => {
    const nb = kbNeighborhood(tree([task(1, [])]), graph(), 1)
    expect(neighborhoodText(1, null, nb)).toContain('none')
  })
})

describe('boundNeighborhood + briefNeighborhoodText — la section brief bornée (#325)', () => {
  const nb = (direct: KbNode[], neighbors: KbNode[]) => ({ direct, neighbors })

  it('cape les directs et rapporte les totaux d’avant bornage', () => {
    const direct = ['a', 'b', 'c'].map((id) => node(id, `src/${id}.ts`))
    const bn = boundNeighborhood(nb(direct, []), [], 2, 8)
    expect(bn.direct.map((n) => n.id)).toEqual(['a', 'b']) // ordre stable de kbLink
    expect(bn.directTotal).toBe(3)
  })

  it('directs en round-robin par fichier : chaque ref représentée avant d’empiler les symboles', () => {
    // 3 nœuds-symboles de a.ts puis 2 de b.ts : cap 4 → a,b s’alternent, b.ts visible.
    const direct = [
      node('a1', 'src/a.ts'), node('a2', 'src/a.ts'), node('a3', 'src/a.ts'),
      node('b1', 'src/b.ts'), node('b2', 'src/b.ts'),
    ]
    const bn = boundNeighborhood(nb(direct, []), [], 4, 8)
    expect(bn.direct.map((n) => n.id)).toEqual(['a1', 'b1', 'a2', 'b2'])
    expect(bn.directTotal).toBe(5)
  })

  it('trie les voisins par DEGRÉ décroissant puis cape (les plus connectés d’abord)', () => {
    const neighbors = ['low', 'high', 'mid'].map((id) => node(id, `src/${id}.ts`))
    // high : 3 arêtes ; mid : 2 ; low : 1.
    const edges: KbEdge[] = [
      edge('high', 'x'), edge('high', 'y'), edge('z', 'high'),
      edge('mid', 'x'), edge('mid', 'y'),
      edge('low', 'x'),
    ]
    const bn = boundNeighborhood(nb([node('a', 'src/a.ts')], neighbors), edges, 12, 2)
    expect(bn.neighbors.map((n) => n.id)).toEqual(['high', 'mid'])
    expect(bn.neighborTotal).toBe(3)
  })

  it('bris d’égalité de degré : id croissant (déterministe)', () => {
    const neighbors = ['bb', 'aa'].map((id) => node(id, `src/${id}.ts`))
    const bn = boundNeighborhood(nb([], neighbors), [], 12, 8)
    expect(bn.neighbors.map((n) => n.id)).toEqual(['aa', 'bb'])
  })

  it('aucun direct → null (section omise du brief, pas de bruit)', () => {
    expect(briefNeighborhoodText(boundNeighborhood(nb([], []), []))).toBeNull()
  })

  it('rend l’en-tête, les fichiers, et le « N of M » quand tronqué', () => {
    const direct = [node('a', 'src/a.ts')]
    const neighbors = ['b', 'c', 'd'].map((id) => node(id, `src/${id}.ts`))
    const txt = briefNeighborhoodText(boundNeighborhood(nb(direct, neighbors), [], 12, 2))!
    expect(txt).toContain('Knowledge base — what this task touches')
    expect(txt).toContain('direct (1):')
    expect(txt).toContain('src/a.ts')
    expect(txt).toContain('1 hop away (2 of 3, most connected first)')
    expect(txt.split('\n').length).toBe(6) // en-tête + direct(1+1) + hop(1+2) — borné, jamais 200 nœuds
  })
})

describe('kbSearch + searchText', () => {
  it('matche label/fichier, tronque à limit, rapporte le total', () => {
    const { hits, total } = kbSearch(graph(), 'src/', 2)
    expect(total).toBe(4)
    expect(hits).toHaveLength(2)
    expect(searchText('src/', hits, total)).toContain('4 KB node(s) match "src/" (showing 2)')
  })

  it('aucun match → message explicite', () => {
    const { hits, total } = kbSearch(graph(), 'zzz')
    expect(total).toBe(0)
    expect(searchText('zzz', hits, total)).toBe('No KB node matches "zzz".')
  })
})

describe('kbNode + nodeText', () => {
  it('détail + tickets touching this (index inverse), résout les titres', () => {
    const t = tree([task(7, ['src/a.ts']), task(3, ['src/a.ts'])])
    const detail = kbNode(t, graph(), 'a')!
    expect(detail.node.id).toBe('a')
    expect(detail.tickets).toEqual([3, 7])
    const txt = nodeText(detail, (id) => (id === 3 ? 'Ticket three' : null))
    expect(txt).toContain('tickets touching this (2)')
    expect(txt).toContain('#3 Ticket three')
    expect(txt).toContain('#7')
  })

  it('nœud inconnu → null', () => {
    expect(kbNode(tree([]), graph(), 'nope')).toBeNull()
  })
})
