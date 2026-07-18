import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logUsage } from './usageLog'

describe('logUsage', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'roadmapped-usage-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('append une ligne JSONL valide avec ts/kind/name', () => {
    logUsage('cli', 'list', dir)
    const lines = readFileSync(join(dir, '.roadmapped-usage.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0])
    expect(entry).toMatchObject({ kind: 'cli', name: 'list' })
    expect(typeof entry.ts).toBe('string')
  })

  it('empile plusieurs appels (une ligne par appel)', () => {
    logUsage('mcp', 'sitrep', dir)
    logUsage('view', 'backlog', dir)
    const lines = readFileSync(join(dir, '.roadmapped-usage.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).kind).toBe('mcp')
    expect(JSON.parse(lines[1]).kind).toBe('view')
  })

  it('ne jette jamais si le fichier est inaccessible (dossier en lecture seule)', () => {
    chmodSync(dir, 0o500)
    try {
      expect(() => logUsage('cli', 'anything', dir)).not.toThrow()
    } finally {
      chmodSync(dir, 0o700) // pour que afterEach puisse rmSync
    }
  })

  it('ne jette jamais si la racine n’existe pas', () => {
    expect(() => logUsage('cli', 'anything', join(dir, 'nope', 'deeper'))).not.toThrow()
  })
})
