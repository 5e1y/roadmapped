import { describe, it, expect, beforeEach } from 'vitest'
import { cachedTreeWithErrors, invalidateTreeCache, type TreeAndErrors } from './treeCache'

const fakeEntry = (): TreeAndErrors => ({ tree: { sections: [], epics: [] } as unknown as TreeAndErrors['tree'], errors: [] })

describe('treeCache (#366)', () => {
  beforeEach(() => invalidateTreeCache()) // isole chaque test

  it('ne calcule qu\'une fois tant que non invalidé (hit = zéro recompute)', () => {
    let calls = 0
    const compute = () => { calls++; return fakeEntry() }
    cachedTreeWithErrors('/a', compute)
    cachedTreeWithErrors('/a', compute)
    cachedTreeWithErrors('/a', compute)
    expect(calls).toBe(1)
  })

  it('renvoie exactement l\'objet mémoïsé (même référence)', () => {
    const entry = fakeEntry()
    const first = cachedTreeWithErrors('/a', () => entry)
    const second = cachedTreeWithErrors('/a', fakeEntry) // le compute ne doit PAS être appelé
    expect(second).toBe(first)
    expect(second).toBe(entry)
  })

  it('invalidateTreeCache(dir) force un recompute pour CE dir seulement', () => {
    let a = 0, b = 0
    cachedTreeWithErrors('/a', () => { a++; return fakeEntry() })
    cachedTreeWithErrors('/b', () => { b++; return fakeEntry() })
    invalidateTreeCache('/a')
    cachedTreeWithErrors('/a', () => { a++; return fakeEntry() })
    cachedTreeWithErrors('/b', () => { b++; return fakeEntry() })
    expect(a).toBe(2) // recalculé après invalidation
    expect(b).toBe(1) // intact
  })

  it('invalidateTreeCache() sans argument purge tout', () => {
    let calls = 0
    const compute = () => { calls++; return fakeEntry() }
    cachedTreeWithErrors('/a', compute)
    cachedTreeWithErrors('/b', compute)
    invalidateTreeCache()
    cachedTreeWithErrors('/a', compute)
    cachedTreeWithErrors('/b', compute)
    expect(calls).toBe(4)
  })
})
