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
  dir = mkdtempSync(join(tmpdir(), 'roadmapped-mcp-'))
  writeFileSync(join(dir, '_meta.yaml'), 'nextId: 1\n')
  seedStages(dir)
  addTask(dir, { section: '04-build', team: 'engineering', title: 'Une tâche', refs: ['docs/x.md'] }) // #1
  tools = makeTools(dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('MCP — tools de lecture (#91)', () => {
  it('expose les 13 tools (8 lecture + 5 écriture)', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['add', 'brief', 'done', 'list', 'next', 'quick', 'roadmap', 'show', 'sitrep', 'start', 'take', 'update', 'validate'],
    )
  })

  it('chaque tool porte une description et un inputSchema objet (= la doc)', () => {
    for (const t of tools) {
      expect(typeof t.description).toBe('string')
      expect(t.inputSchema.type).toBe('object')
    }
  })

  it('sitrep → texte daté, PAS de structuredContent (le texte est la charge utile, #95)', () => {
    const r = tool('sitrep').handler({})
    expect(r.content[0].text).toMatch(/^sitrep — \d{4}-\d{2}-\d{2}/)
    expect(r.structuredContent).toBeUndefined()
  })

  it('brief d’une tâche existante → texte dense (pas de structured qui le masquerait)', () => {
    const r = tool('brief').handler({ id: 1 })
    expect(r.isError).toBeFalsy()
    expect(r.content[0].text).toMatch(/Une tâche/)
    expect(r.structuredContent).toBeUndefined()
  })

  it('brief d’un id absent → isError (message autoportant)', () => {
    const r = tool('brief').handler({ id: 999 })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/No task #999/)
  })

  it('next sert la file disponible (texte)', () => {
    expect(tool('next').handler({}).content[0].text).toMatch(/#1\s+Une tâche/)
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
    expect(r.content[0].text).toMatch(/#1 started/)
    expect(tool('show').handler({ id: 1 }).structuredContent.status).toBe('in_progress')
  })
})

describe('MCP — tools d’écriture (#92)', () => {
  it('add crée une tâche (structured.id) sans casser la validation', () => {
    const r = tool('add').handler({ section: '04-build', title: 'Née par tool', team: 'design' })
    expect(r.isError).toBeFalsy()
    expect(r.structuredContent.id).toBe(2)
    expect(makeTools(dir).find((t) => t.name === 'validate').handler({}).structuredContent.ok).toBe(true)
  })

  it('quick --start crée un mini-ticket in_progress', () => {
    const r = tool('quick').handler({ title: 'Fix rapide', team: 'engineering', start: true })
    expect(r.structuredContent.kind).toBe('quick')
    expect(r.structuredContent.status).toBe('in_progress')
  })

  it('cycle complet PAR TOOLS : take → done, YAML relu conforme', () => {
    tool('take').handler({}) // démarre #1
    const done = tool('done').handler({ id: 1, outcome: 'livré via tool', verification: 'observé via tool' })
    expect(done.isError).toBeFalsy()
    expect(done.structuredContent.task.status).toBe('done')
    expect(done.structuredContent.task.outcome).toBe('livré via tool')
    // relecture indépendante du disque
    expect(makeTools(dir).find((t) => t.name === 'show').handler({ id: 1 }).structuredContent.status).toBe('done')
  })

  it('écriture invalide (team hors enum) → isError ET rollback (arbre inchangé)', () => {
    const before = makeTools(dir).find((t) => t.name === 'next').handler({ count: 9 }).content[0].text
    const r = tool('add').handler({ section: '04-build', title: 'Mauvaise team', team: 'wizardry' })
    expect(r.isError).toBe(true)
    // rollback : la validation reste OK et aucune tâche n'a été ajoutée
    expect(makeTools(dir).find((t) => t.name === 'validate').handler({}).structuredContent.ok).toBe(true)
    expect(makeTools(dir).find((t) => t.name === 'next').handler({ count: 9 }).content[0].text).toBe(before)
  })

  it('done d’un quick sans outcome → isError (message du noyau)', () => {
    const q = tool('quick').handler({ title: 'Sans outcome', team: 'engineering', start: true })
    const r = tool('done').handler({ id: q.structuredContent.id })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toMatch(/outcome requis/)
  })
})

describe('MCP — invariant de sortie (#95)', () => {
  // La spec MCP exige structuredContent = OBJET ; le SDK client rejette array/null (-32602).
  // Ce test appelle les 13 tools et vérifie l'invariant sur chaque résultat.
  const check = (r) => {
    if ('structuredContent' in r) {
      expect(r.structuredContent, 'structuredContent doit être un objet (pas null/array)').toBeTruthy()
      expect(Array.isArray(r.structuredContent)).toBe(false)
      expect(typeof r.structuredContent).toBe('object')
    }
    expect(typeof r.content[0].text).toBe('string')
  }
  it('les 13 tools renvoient structuredContent objet ou rien, jamais array/null', () => {
    check(tool('sitrep').handler({}))
    check(tool('brief').handler({ id: 1 }))
    check(tool('show').handler({ id: 1 }))
    check(tool('next').handler({ count: 9 }))
    check(tool('list').handler({}))
    check(tool('roadmap').handler({}))
    check(tool('validate').handler({}))
    check(tool('take').handler({}))                                                   // démarre #1
    check(tool('done').handler({ id: 1, outcome: 'x', verification: 'y' }))
    check(tool('add').handler({ section: '04-build', title: 'T', team: 'design' }))   // #2
    check(tool('update').handler({ id: 2, detail: 'd' }))
    check(tool('quick').handler({ title: 'Q', team: 'engineering' }))                 // #3
    check(tool('start').handler({ id: 2 }))
    check(tool('take').handler({ team: 'legal' }))  // file vide → l'ancien cas structured:null
    check(tool('next').handler({ team: 'legal' }))  // file vide → l'ancien cas structured:[]
  })
})
