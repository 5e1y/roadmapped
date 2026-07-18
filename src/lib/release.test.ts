import { describe, it, expect } from 'vitest'
import { compareReleasesDesc, groupByRelease, PRE_RELEASE } from './release'

describe('compareReleasesDesc', () => {
  it('trie décroissant (plus récente d\'abord)', () => {
    const sorted = ['0.1.0', '0.2.3', '0.2.2', '0.1.0'].sort(compareReleasesDesc)
    expect(sorted).toEqual(['0.2.3', '0.2.2', '0.1.0', '0.1.0'])
  })
  it('compare NUMÉRIQUEMENT, pas lexicalement : 0.10.0 > 0.9.0', () => {
    expect(compareReleasesDesc('0.10.0', '0.9.0')).toBeLessThan(0)
    expect([...['0.9.0', '0.10.0', '0.11.0']].sort(compareReleasesDesc)).toEqual(['0.11.0', '0.10.0', '0.9.0'])
  })
  it('pre-release TOUJOURS en dernier', () => {
    expect(compareReleasesDesc(PRE_RELEASE, '0.1.0')).toBeGreaterThan(0)
    expect(compareReleasesDesc('0.1.0', PRE_RELEASE)).toBeLessThan(0)
    expect(['0.1.0', PRE_RELEASE, '0.2.0'].sort(compareReleasesDesc)).toEqual(['0.2.0', '0.1.0', PRE_RELEASE])
  })
  it('ignore le préfixe v de tête', () => {
    expect(compareReleasesDesc('v0.2.0', '0.1.0')).toBeLessThan(0)
    expect(compareReleasesDesc('v1.0.0', 'v1.0.0')).toBe(0)
  })
  it('segments de longueur inégale', () => {
    expect(compareReleasesDesc('1.2', '1.2.0')).toBe(0)
    expect(compareReleasesDesc('1.2.1', '1.2')).toBeLessThan(0)
  })
})

describe('groupByRelease', () => {
  const item = (id: number, release: string | null) => ({ id, release })
  const releaseOf = (i: { release: string | null }) => i.release

  it('groupe par release, tri décroissant, pre-release en dernier', () => {
    const groups = groupByRelease(
      [item(1, '0.1.0'), item(2, '0.2.3'), item(3, null), item(4, '0.2.3'), item(5, '0.2.2')],
      releaseOf,
    )
    expect(groups.map((g) => g.release)).toEqual(['0.2.3', '0.2.2', '0.1.0', PRE_RELEASE])
    expect(groups.map((g) => g.items.length)).toEqual([2, 1, 1, 1])
  })

  it('les done sans release tombent dans pre-release', () => {
    const groups = groupByRelease([item(1, null), item(2, null)], releaseOf)
    expect(groups).toHaveLength(1)
    expect(groups[0].release).toBe(PRE_RELEASE)
    expect(groups[0].items.map((i) => i.id)).toEqual([1, 2])
  })

  it('préserve l\'ordre des items dans un groupe', () => {
    const groups = groupByRelease([item(3, '0.1.0'), item(1, '0.1.0'), item(2, '0.1.0')], releaseOf)
    expect(groups[0].items.map((i) => i.id)).toEqual([3, 1, 2])
  })

  it('tri numérique des groupes (0.10.0 avant 0.9.0)', () => {
    const groups = groupByRelease([item(1, '0.9.0'), item(2, '0.10.0')], releaseOf)
    expect(groups.map((g) => g.release)).toEqual(['0.10.0', '0.9.0'])
  })
})
