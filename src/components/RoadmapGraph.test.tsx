import { describe, it, expect } from 'vitest'
import { hiddenPrereqNote, roundedEdgePath } from './RoadmapGraph'

describe('hiddenPrereqNote (#138 — prérequis sans carte propre localisés)', () => {
  it('cite le #id et le titre de l’epic qui le porte', () => {
    expect(hiddenPrereqNote([{ id: 12, epicTitle: 'Checkout' }]))
      .toBe("#12 — dans l'epic « Checkout »")
  })

  it('distingue le vraiment hors vue (masqué) de l’epic replié', () => {
    expect(hiddenPrereqNote([
      { id: 12, epicTitle: 'Checkout' },
      { id: 14, epicTitle: null },
    ])).toBe("#12 — dans l'epic « Checkout » · #14 — hors vue (masquée)")
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
