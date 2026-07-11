import { describe, it, expect } from 'vitest'
import { buildKbLinkIndex } from './kbLink'
import type { KbNode, KbEdge } from '../server/kb'
import type { TaskNode, TaskTree } from './tasks'

// Fabriques minimales : kbLink ne lit que id/refs/subtasks d'une tâche et
// id/sourceFile d'un nœud — on caste le strict nécessaire (cf. docs.test seed).
const task = (id: number, refs: string[], subtasks: TaskNode[] = []): TaskNode =>
  ({ id, refs, subtasks } as unknown as TaskNode)
const tree = (tasks: TaskNode[]): TaskTree =>
  ({ nextId: 99, epics: [], sections: [{ key: 'x', title: 'X', status: 'open', note: null, tasks }] } as unknown as TaskTree)
const node = (id: string, sourceFile: string | null, fileType = 'code'): KbNode =>
  ({ id, label: id, fileType, sourceFile, sourceLocation: null, community: -1 })
const edge = (source: string, target: string): KbEdge =>
  ({ source, target, relation: 'imports_from', confidence: 'EXTRACTED', weight: 1 })

const NODES: KbNode[] = [
  node('a', 'src/a.ts'),
  node('b', 'src/b.ts'),
  node('c', 'src/c.ts'),
  node('d', 'src/d.ts'),
  node('spec', 'docs/specs/x.md', 'document'),
]
// a—b, a—c (undirected via b—a to test direction), c—d
const EDGES: KbEdge[] = [edge('a', 'b'), edge('b', 'a'), edge('a', 'c'), edge('c', 'd')]

describe('buildKbLinkIndex — neighborhoodOf', () => {
  it('joint refs → source_file (nœuds directs) + voisins à 1 saut', () => {
    const idx = buildKbLinkIndex(tree([task(1, ['src/a.ts'])]), NODES, EDGES)
    const nb = idx.neighborhoodOf(1)
    expect(nb.direct.map((n) => n.id)).toEqual(['a'])
    expect(nb.neighbors.map((n) => n.id)).toEqual(['b', 'c']) // pas d (2 sauts)
  })

  it('ignore l’ancre #symbol / :line dans la ref pour le match fichier', () => {
    const idx = buildKbLinkIndex(tree([task(1, ['src/a.ts#foo']), task(2, ['src/b.ts:12'])]), NODES, EDGES)
    expect(idx.neighborhoodOf(1).direct.map((n) => n.id)).toEqual(['a'])
    expect(idx.neighborhoodOf(2).direct.map((n) => n.id)).toEqual(['b'])
  })

  it('exclut des voisins un nœud qui est lui-même direct', () => {
    // La tâche cite a ET b : b est direct, donc absent des voisins (seul c reste).
    const idx = buildKbLinkIndex(tree([task(1, ['src/a.ts', 'src/b.ts'])]), NODES, EDGES)
    const nb = idx.neighborhoodOf(1)
    expect(nb.direct.map((n) => n.id)).toEqual(['a', 'b'])
    expect(nb.neighbors.map((n) => n.id)).toEqual(['c'])
  })

  it('adjacence NON-DIRIGÉE : un voisin trouvé quel que soit le sens de l’arête', () => {
    // b n'a que l'arête b→a (et a→b) : partir de b doit retrouver a.
    const idx = buildKbLinkIndex(tree([task(1, ['src/b.ts'])]), NODES, EDGES)
    expect(idx.neighborhoodOf(1).neighbors.map((n) => n.id)).toContain('a')
  })

  it('tâche sans ref (ou ref sans nœud) → voisinage vide', () => {
    const idx = buildKbLinkIndex(tree([task(1, []), task(2, ['src/inconnu.ts'])]), NODES, EDGES)
    expect(idx.neighborhoodOf(1)).toEqual({ direct: [], neighbors: [] })
    expect(idx.neighborhoodOf(2)).toEqual({ direct: [], neighbors: [] })
  })

  it('compte les refs des SOUS-TÂCHES', () => {
    const parent = task(1, [], [task(2, ['src/d.ts'])])
    const idx = buildKbLinkIndex(tree([parent]), NODES, EDGES)
    expect(idx.neighborhoodOf(2).direct.map((n) => n.id)).toEqual(['d'])
  })
})

describe('buildKbLinkIndex — ticketsOfNode (index inverse)', () => {
  it('renvoie les tâches qui citent le source_file du nœud, triées', () => {
    const idx = buildKbLinkIndex(
      tree([task(3, ['src/a.ts']), task(1, ['src/a.ts']), task(2, ['src/b.ts'])]),
      NODES, EDGES,
    )
    expect(idx.ticketsOfNode('a')).toEqual([1, 3])
    expect(idx.ticketsOfNode('b')).toEqual([2])
    expect(idx.ticketsOfNode('d')).toEqual([]) // personne ne cite d
  })
})
