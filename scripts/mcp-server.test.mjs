import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTools } from './mcp-server.mjs'
import { seedStages } from '../src/lib/stageFixtures.ts'
import { addTask } from '../src/lib/taskWrites.ts'

// Le registre est injectable (makeTools(ROOT)) → testable sur un sandbox jetable,
// jamais contre le vrai backlog. On teste les HANDLERS (la logique) sans monter stdio.
let dir
let tools
const tool = (name) => tools.find((t) => t.name === name)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roadmaped-mcp-'))
  writeFileSync(join(dir, '_meta.yaml'), 'nextId: 1\n')
  seedStages(dir)
  addTask(dir, { section: '04-build', team: 'engineering', title: 'Une tâche', refs: ['docs/x.md'] }) // #1
  tools = makeTools(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('MCP — tools de lecture (#91)', () => {
  it('expose exactement les 8 tools de lecture', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['brief', 'list', 'next', 'roadmap', 'show', 'sitrep', 'take', 'validate'],
    )
  })

  it('chaque tool porte une description et un inputSchema objet (= la doc)', () => {
    for (const t of tools) {
      expect(typeof t.description).toBe('string')
      expect(t.inputSchema.type).toBe('object')
    }
  })

  it('sitrep → texte daté + structured.validateOk', () => {
    const r = tool('sitrep').handler({})
    expect(r.content[0].text).toMatch(/^sitrep — \d{4}-\d{2}-\d{2}/)
    expect(r.structuredContent.validateOk).toBe(true)
  })

  it('brief d’une tâche existante → structuredContent.id', () => {
    const r = tool('brief').handler({ id: 1 })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.id).toBe(1)
  })

  it('brief d’un id absent → isError (message autoportant)', () => {
    const r = tool('brief').handler({ id: 999 })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/Aucune tâche #999/)
  })

  it('next sert la file disponible (structuré)', () => {
    expect(tool('next').handler({}).structuredContent[0].id).toBe(1)
  })

  it('validate → structured.ok sur un arbre sain', () => {
    expect(tool('validate').handler({}).structuredContent.ok).toBe(true)
  })

  it('list --tag debt filtre le ledger de dette', () => {
    addTask(dir, { section: '04-build', team: 'engineering', title: 'Dette assumée', tags: ['debt'], kind: 'quick' }) // #2
    const r = makeTools(dir).find((t) => t.name === 'list').handler({ tag: 'debt' })
    expect(r.content[0].text).toMatch(/Dette assumée/)
    expect(r.content[0].text).not.toMatch(/#1 {2}/)
  })

  it('take démarre la prochaine dispo et renvoie son brief', () => {
    const r = tool('take').handler({})
    expect(r.content[0].text).toMatch(/#1 démarrée/)
    expect(r.structuredContent.status).toBe('in_progress')
  })
})
