import { describe, it, expect } from 'vitest'
import { hiddenPrereqNote, roundedEdgePath, buildGraphModel, filterGraphToEpic, edgeStyle } from './RoadmapGraph'
import type { TaskNode, TaskTree, SectionNode } from '../lib/tasks'

describe('hiddenPrereqNote (#138 — prérequis sans carte propre localisés)', () => {
  it('cite le #id et le titre de l’epic qui le porte', () => {
    expect(hiddenPrereqNote([{ id: 12, epicTitle: 'Checkout' }]))
      .toBe("#12 — in epic “Checkout”")
  })

  it('distingue le vraiment hors vue (masqué) de l’epic replié', () => {
    expect(hiddenPrereqNote([
      { id: 12, epicTitle: 'Checkout' },
      { id: 14, epicTitle: null },
    ])).toBe("#12 — in epic “Checkout” · #14 — out of view (hidden)")
  })

  it('liste vide → chaîne vide (aucun tooltip)', () => {
    expect(hiddenPrereqNote([])).toBe('')
  })
})

describe('roundedEdgePath (arêtes dagre arrondies, graph-v2)', () => {
  it('deux points → segment droit simple', () => {
    expect(roundedEdgePath([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe('M 0 0 L 100 0')
  })

  it('sommet interne → adouci par un quart de courbe Q centré sur le sommet', () => {
    const d = roundedEdgePath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 8)
    // On s'arrête 8px avant le coin, la courbe passe PAR le coin, on repart 8px après.
    expect(d).toBe('M 0 0 L 92 0 Q 100 0 100 8 L 100 100')
  })

  it('segments plus courts que 2r : le rayon se replie sur la moitié du segment', () => {
    const d = roundedEdgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 8)
    expect(d).toBe('M 0 0 L 5 0 Q 10 0 10 5 L 10 10')
  })

  it('dégénéré : vide → chaîne vide, point double toléré', () => {
    expect(roundedEdgePath([])).toBe('')
    expect(roundedEdgePath([{ x: 3, y: 4 }, { x: 3, y: 4 }, { x: 10, y: 4 }])).toBe('M 3 4 L 10 4')
  })
})

describe('edgeStyle (#386 — grammaire du pointillé unifiée : dépendances = trait PLEIN)', () => {
  it('aucun ton n’émet de pointillé — le pointillé est réservé à l’inféré (KbGraph)', () => {
    for (const tone of ['default', 'strong', 'dim'] as const) {
      expect(edgeStyle(tone)).not.toHaveProperty('strokeDasharray')
    }
  })

  it('l’emphase du chemin survolé passe par la couleur + l’épaisseur, pas le motif', () => {
    // fort = plus foncé ET plus épais ; base et atténué gardent l’épaisseur de grille (1).
    expect(edgeStyle('strong')).toEqual({ stroke: 'var(--color-texthard)', strokeWidth: 1.5, markerEnd: 'url(#rm-arrow-strong)' })
    expect(edgeStyle('default')).toEqual({ stroke: 'var(--color-textsoft)', strokeWidth: 1, markerEnd: 'url(#rm-arrow)' })
    expect(edgeStyle('dim')).toEqual({ stroke: 'var(--color-border)', strokeWidth: 1, markerEnd: 'url(#rm-arrow-dim)' })
  })
})

// ── Filtre epic du graphe (#343) : mêmes cartes/état que la Roadmap ─────────
const baseTask: TaskNode = {
  id: 1, kind: 'task', title: 'Tâche', status: 'todo',
  tags: [],
  detail: null, refs: [], links: [], dependsOn: [], epic: null,
  source: 'ai', createdAt: '2026-06-24', startedAt: null, completedAt: null, commit: null,
  outcome: null, verification: null, release: null,
  file: 'docs/tasks/01-bug/01-t.yaml', subtasks: [],
}
const mk = (id: number, over: Partial<TaskNode> = {}): TaskNode => ({ ...baseTask, id, title: `Tâche ${id}`, ...over })
const sect = (key: string, tasks: TaskNode[]): SectionNode =>
  ({ key, title: key.replace(/^\d+-/, ''), status: 'open', note: null, tasks })

describe('filterGraphToEpic (#343 — epic sélectionné → tâches + frontières directes)', () => {
  // checkout (t1, t2) : t1 dépend de t3 (amont), t4 dépend de t2 (aval).
  // t5 est standalone sans lien ; l'epic « other » (t6) est étranger.
  const tree: TaskTree = {
    nextId: 20,
    sections: [
      sect('01-bug', [
        mk(1, { epic: 'checkout', dependsOn: [3] }),
        mk(2, { epic: 'checkout' }),
        mk(3),
        mk(4, { dependsOn: [2] }),
        mk(5),
        mk(6, { epic: 'other' }),
      ]),
    ],
    epics: [{ slug: 'checkout', title: 'Checkout' }, { slug: 'other', title: 'Other' }],
  }
  const model = buildGraphModel(tree, true, [])

  it('ne garde que le nœud-epic + ses voisins directs hors-epic, le reste disparaît', () => {
    const { model: filtered } = filterGraphToEpic(model, 'e:checkout')
    expect(new Set(filtered.nodes.map((m) => m.node.key)))
      .toEqual(new Set(['e:checkout', 't:3', 't:4']))
    // t:5 (isolé) et e:other (epic étranger) sont écartés.
    expect(filtered.nodes.some((m) => m.node.key === 't:5')).toBe(false)
    expect(filtered.nodes.some((m) => m.node.key === 'e:other')).toBe(false)
  })

  it('les frontières (amont ET aval) sont marquées estompées, pas l’epic', () => {
    const { borderKeys } = filterGraphToEpic(model, 'e:checkout')
    expect(borderKeys).toEqual(new Set(['t:3', 't:4']))
    expect(borderKeys.has('e:checkout')).toBe(false)
  })

  it('ne garde que les arêtes incidentes à l’epic (vers/depuis les frontières)', () => {
    const { model: filtered } = filterGraphToEpic(model, 'e:checkout')
    expect(new Set(filtered.edges.map((e) => `${e.from}->${e.to}`)))
      .toEqual(new Set(['t:3->e:checkout', 'e:checkout->t:4']))
  })
})
