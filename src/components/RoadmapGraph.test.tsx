import { describe, it, expect } from 'vitest'
import { hiddenPrereqNote } from './RoadmapGraph'

describe('hiddenPrereqNote (#138 — prérequis sans carte propre localisés)', () => {
  it('cite le #id et le titre de l’epic qui le porte', () => {
    expect(hiddenPrereqNote([{ id: 12, epicTitle: 'Checkout' }]))
      .toBe("#12 — dans l'epic « Checkout »")
  })

  it('distingue le vraiment hors vue (archivé/masqué) de l’epic replié', () => {
    expect(hiddenPrereqNote([
      { id: 12, epicTitle: 'Checkout' },
      { id: 14, epicTitle: null },
    ])).toBe("#12 — dans l'epic « Checkout » · #14 — hors vue (archivée ou masquée)")
  })

  it('liste vide → chaîne vide (aucun tooltip)', () => {
    expect(hiddenPrereqNote([])).toBe('')
  })
})
