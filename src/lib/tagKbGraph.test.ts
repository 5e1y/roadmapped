import { describe, it, expect } from 'vitest'
import { tagKbGraph, TAG_NODE_FILE_TYPE } from './tagKbGraph'
import type { TaskNode } from './tasks'

// Fabrique minimale : tagKbGraph ne lit (via tagGraph) que tags + subtasks + status.
const task = (id: number, tags: string[], subtasks: TaskNode[] = []): TaskNode =>
  ({ id, tags, subtasks, status: 'todo' } as unknown as TaskNode)

describe('tagKbGraph — adaptateur tags → KbGraphData (#375)', () => {
  it('mappe chaque tag sur un KbNode conforme au contrat (id=label=tag, fileType factice, sans source)', () => {
    const g = tagKbGraph([task(1, ['alpha', 'beta']), task(2, ['alpha'])])
    const alpha = g.nodes.find((n) => n.id === 'alpha')
    expect(alpha).toBeDefined()
    expect(alpha).toMatchObject({
      id: 'alpha',
      label: 'alpha',
      fileType: TAG_NODE_FILE_TYPE,
      sourceFile: null,
      sourceLocation: null,
      community: 0,
    })
    // Contrat KbNode : rationale est OPTIONNEL et non posé pour un tag.
    expect('rationale' in alpha!).toBe(false)
    // Tous les tags présents (alpha, beta), un nœud par tag distinct.
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['alpha', 'beta'])
  })

  it('mappe chaque co-occurrence sur un KbEdge EXTRACTED co-occurs pondéré', () => {
    // alpha+beta co-apparaissent sur 2 tickets → weight 2.
    const g = tagKbGraph([task(1, ['alpha', 'beta']), task(2, ['alpha', 'beta']), task(3, ['alpha'])])
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({
      source: 'alpha',
      target: 'beta',
      relation: 'co-occurs',
      confidence: 'EXTRACTED',
      weight: 2,
    })
  })

  it('remplit stats de façon cohérente (nodes/edges + une seule communauté)', () => {
    const g = tagKbGraph([task(1, ['a', 'b', 'c'])])
    expect(g.stats.nodes).toBe(g.nodes.length)
    expect(g.stats.edges).toBe(g.edges.length)
    expect(g.stats.communities).toBe(1)
    expect(g.generatedAt).toBeNull()
    // Tous les nœuds partagent la communauté 0 → le compte 1 est honnête.
    expect(new Set(g.nodes.map((n) => n.community))).toEqual(new Set([0]))
  })

  it('agrège les tickets ET leurs sous-tâches, et est vide sans tag', () => {
    const withSub = task(1, ['parent'], [task(2, ['child', 'parent'])])
    const g = tagKbGraph([withSub])
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['child', 'parent'])
    expect(tagKbGraph([task(9, [])]).nodes).toHaveLength(0)
    expect(tagKbGraph([]).edges).toHaveLength(0)
  })

  it('tout endpoint d\'arête existe parmi les nœuds (graphe intègre pour KbGraph)', () => {
    const g = tagKbGraph([task(1, ['x', 'y']), task(2, ['y', 'z']), task(3, ['x', 'z'])])
    const ids = new Set(g.nodes.map((n) => n.id))
    for (const e of g.edges) {
      expect(ids.has(e.source)).toBe(true)
      expect(ids.has(e.target)).toBe(true)
    }
  })
})
