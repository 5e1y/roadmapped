import { describe, it, expect } from 'vitest'
import { tagGraph, layoutTagGraph, LAYOUT_W, LAYOUT_H } from './tagGraph'
import type { TaskNode } from './tasks'

/** Fabrique minimale de TaskNode (mêmes défauts que les autres tests). */
function task(over: Partial<TaskNode>): TaskNode {
  return {
    id: 1, kind: 'task', code: null, title: 't', status: 'todo',
    tags: [], size: null, team: 'engineering',
    detail: null, refs: [], links: [], dependsOn: [], epic: null,
    source: 'ai', createdAt: '2026-07-01', startedAt: null, completedAt: null,
    commit: null, outcome: null, verification: null, release: null,
    file: 'docs/tasks/04-build/01-t.yaml', subtasks: [],
    ...over,
  }
}

describe('tagGraph', () => {
  it('compte les tags des tickets ouverts et ignore les done', () => {
    const g = tagGraph([
      task({ id: 1, tags: ['ux', 'fable'] }),
      task({ id: 2, status: 'in_progress', tags: ['fable'] }),
      task({ id: 3, status: 'done', tags: ['ux', 'debt'] }),
    ])
    expect(g.nodes).toEqual([
      { tag: 'fable', count: 2 },
      { tag: 'ux', count: 1 },
    ])
    expect(g.edges).toEqual([{ a: 'fable', b: 'ux', weight: 1 }])
  })

  it('inclut les sous-tâches ouvertes (même règle de charge que le radar)', () => {
    const g = tagGraph([
      task({ id: 1, status: 'done', tags: ['spec'], subtasks: [
        task({ id: 2, tags: ['spec', 'data-model'] }),
      ] }),
    ])
    expect(g.nodes).toEqual([
      { tag: 'data-model', count: 1 },
      { tag: 'spec', count: 1 },
    ])
    expect(g.edges).toEqual([{ a: 'data-model', b: 'spec', weight: 1 }])
  })

  it('pondère les arêtes par nombre de co-occurrences, extrémités triées', () => {
    const g = tagGraph([
      task({ id: 1, tags: ['ux', 'a11y'] }),
      task({ id: 2, tags: ['a11y', 'ux', 'debt'] }),
    ])
    expect(g.edges[0]).toEqual({ a: 'a11y', b: 'ux', weight: 2 })
    expect(g.edges).toContainEqual({ a: 'debt', b: 'ux', weight: 1 })
    expect(g.edges).toContainEqual({ a: 'a11y', b: 'debt', weight: 1 })
  })

  it('dédoublonne les tags répétés dans un même ticket (pas de self-edge)', () => {
    const g = tagGraph([task({ id: 1, tags: ['ux', 'ux'] })])
    expect(g.nodes).toEqual([{ tag: 'ux', count: 1 }])
    expect(g.edges).toEqual([])
  })

  it('plafonne aux N tags les plus fréquents et écarte les arêtes orphelines', () => {
    const g = tagGraph([
      task({ id: 1, tags: ['a', 'b'] }),
      task({ id: 2, tags: ['a', 'b'] }),
      task({ id: 3, tags: ['a', 'c'] }),
    ], 2)
    expect(g.nodes.map((n) => n.tag)).toEqual(['a', 'b'])
    expect(g.edges).toEqual([{ a: 'a', b: 'b', weight: 2 }]) // a–c écartée
  })

  it('sans tags ouverts : graphe vide', () => {
    expect(tagGraph([task({ id: 1 }), task({ id: 2, status: 'done', tags: ['x'] })]))
      .toEqual({ nodes: [], edges: [] })
  })
})

describe('layoutTagGraph', () => {
  const sample = tagGraph([
    task({ id: 1, tags: ['ux', 'fable'] }),
    task({ id: 2, tags: ['spec', 'fable'] }),
    task({ id: 3, tags: ['marketing'] }),
    task({ id: 4, tags: ['marketing'] }),
    task({ id: 5, tags: ['open-source', 'skill'] }),
    task({ id: 6, tags: ['open-source'] }),
  ])

  it('place chaque nœud dans le cadre, sans NaN', () => {
    const placed = layoutTagGraph(sample)
    expect(placed).toHaveLength(sample.nodes.length)
    for (const p of placed) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(LAYOUT_W)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(LAYOUT_H)
      expect(p.r).toBeGreaterThan(0)
    }
  })

  it('est déterministe (mêmes données ⇒ mêmes positions)', () => {
    expect(layoutTagGraph(sample)).toEqual(layoutTagGraph(sample))
  })

  it('sépare les nœuds (pas deux pastilles empilées)', () => {
    const placed = layoutTagGraph(sample)
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const d = Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y)
        expect(d).toBeGreaterThan(placed[i].r + placed[j].r)
      }
    }
  })

  it('rapproche les tags liés plus que la moyenne des non-liés', () => {
    const placed = layoutTagGraph(sample)
    const at = new Map(placed.map((p) => [p.tag, p]))
    const dist = (a: string, b: string) =>
      Math.hypot(at.get(a)!.x - at.get(b)!.x, at.get(a)!.y - at.get(b)!.y)
    const linked = sample.edges.map((e) => dist(e.a, e.b))
    const linkedSet = new Set(sample.edges.map((e) => `${e.a} ${e.b}`))
    const unlinked: number[] = []
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const [a, b] = [placed[i].tag, placed[j].tag].sort()
        if (!linkedSet.has(`${a} ${b}`)) unlinked.push(dist(a, b))
      }
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    expect(avg(linked)).toBeLessThan(avg(unlinked))
  })

  it('nœud unique : centré, graphe vide : []', () => {
    const solo = layoutTagGraph({ nodes: [{ tag: 'ux', count: 1 }], edges: [] })
    expect(solo).toHaveLength(1)
    expect(Math.abs(solo[0].x - LAYOUT_W / 2)).toBeLessThan(3)
    expect(layoutTagGraph({ nodes: [], edges: [] })).toEqual([])
  })
})
