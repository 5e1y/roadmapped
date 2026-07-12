import { describe, it, expect } from 'vitest'
import { kbStaleness, kbStatusLine, kbDoneNudge, KB_STALE_COMMITS } from './kbStatus'

describe('kbStaleness — built_at_commit vs HEAD en nombre de commits', () => {
  it('pas de commit de build → unknown (vieux graphes, jamais punis)', () => {
    expect(kbStaleness(null, 5).state).toBe('unknown')
    expect(kbStaleness('', 5).state).toBe('unknown')
  })

  it('écart incalculable (pas de git, sha inconnu) → unknown', () => {
    expect(kbStaleness('abc1234', null).state).toBe('unknown')
    expect(kbStaleness('abc1234', -1).state).toBe('unknown')
    expect(kbStaleness('abc1234', 2.5).state).toBe('unknown')
  })

  it('sous le seuil → fresh (build ≠ HEAD seul serait trop nerveux)', () => {
    expect(kbStaleness('abc1234', 0).state).toBe('fresh')
    expect(kbStaleness('abc1234', KB_STALE_COMMITS - 1).state).toBe('fresh')
  })

  it('au seuil et au-delà → stale', () => {
    expect(kbStaleness('abc1234', KB_STALE_COMMITS).state).toBe('stale')
    expect(kbStaleness('abc1234', 500).state).toBe('stale')
  })

  it('seuil paramétrable (kb doctor --max-behind)', () => {
    expect(kbStaleness('abc1234', 3, 2).state).toBe('stale')
    expect(kbStaleness('abc1234', 3, 4).state).toBe('fresh')
    expect(kbStaleness('abc1234', 3, 4).threshold).toBe(4)
  })
})

describe('kbStatusLine — LA ligne KB du sitrep (1 ligne)', () => {
  it('graphe absent → pousse la 1ʳᵉ génération (/graphify .)', () => {
    const line = kbStatusLine({ kind: 'missing' })
    expect(line).toMatch(/^KB: graph not generated yet/)
    expect(line).toContain('/graphify .')
    expect(line).not.toContain('\n')
  })

  it('graphe illisible → pointe la régénération, sans crash', () => {
    expect(kbStatusLine({ kind: 'unreadable' })).toMatch(/unreadable.*\/graphify/)
  })

  it('présent + fresh à HEAD → nb de nœuds + (HEAD)', () => {
    const line = kbStatusLine({ kind: 'ok', nodes: 431, staleness: kbStaleness('abc1234def', 0) })
    expect(line).toBe('KB: 431 nodes · built at abc1234 (HEAD)')
  })

  it('présent + légèrement en retard → fresh, écart affiché', () => {
    const line = kbStatusLine({ kind: 'ok', nodes: 431, staleness: kbStaleness('abc1234', 3) })
    expect(line).toContain('3 commit(s) behind, fresh')
  })

  it('présent + périmé → ⚠ stale + écart + --update', () => {
    const line = kbStatusLine({ kind: 'ok', nodes: 431, staleness: kbStaleness('abc1234', 17) })
    expect(line).toMatch(/⚠ stale.*17 commits behind HEAD/)
    expect(line).toContain('--update')
  })

  it('fraîcheur inconnue → dit pourquoi, sans alarme', () => {
    expect(kbStatusLine({ kind: 'ok', nodes: 12, staleness: kbStaleness(null, null) }))
      .toBe('KB: 12 nodes · freshness unknown (no build commit recorded)')
  })
})

describe('kbDoneNudge — nudge de clôture, informatif seulement', () => {
  it('stale → une ligne qui nomme le refresh (jamais bloquant)', () => {
    const nudge = kbDoneNudge(kbStaleness('abc1234', 42))
    expect(nudge).toMatch(/42 commits behind/)
    expect(nudge).toContain('/graphify . --update')
    expect(nudge).toContain('kb refresh')
  })

  it('fresh ou unknown → silence (null)', () => {
    expect(kbDoneNudge(kbStaleness('abc1234', 1))).toBeNull()
    expect(kbDoneNudge(kbStaleness(null, null))).toBeNull()
  })
})
