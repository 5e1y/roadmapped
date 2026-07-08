import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { routeApi, runAction } from './api'
import { ensureGitignore } from './notes'

describe('routeApi', () => {
  it('GET /api/tree', () => {
    expect(routeApi('GET', '/api/tree', null)).toEqual({ type: 'getTree' })
  })

  it('POST /api/tasks → createTask avec body', () => {
    expect(routeApi('POST', '/api/tasks', { title: 'X' })).toEqual({
      type: 'createTask', body: { title: 'X' },
    })
  })

  it('PATCH /api/tasks/:id → patchTask id numérique', () => {
    expect(routeApi('PATCH', '/api/tasks/42', { team: 'engineering' })).toEqual({
      type: 'patchTask', id: 42, body: { team: 'engineering' },
    })
  })

  it('POST /api/tasks/:id/archive → archiveTask', () => {
    expect(routeApi('POST', '/api/tasks/42/archive', null)).toEqual({ type: 'archiveTask', id: 42 })
  })

  it('DELETE /api/tasks/:id → deleteTask', () => {
    expect(routeApi('DELETE', '/api/tasks/42', null)).toEqual({ type: 'deleteTask', id: 42 })
  })

  it('POST /api/sections → notFound (création de section supprimée)', () => {
    expect(routeApi('POST', '/api/sections', { title: 'S' })).toEqual({ type: 'notFound' })
  })

  it('PATCH /api/sections/:dir → patchSection (dir décodé)', () => {
    expect(routeApi('PATCH', '/api/sections/01-x', { title: 'X2' })).toEqual({
      type: 'patchSection', dir: '01-x', body: { title: 'X2' },
    })
  })

  it('route inconnue → notFound', () => {
    expect(routeApi('GET', '/api/nope', null)).toEqual({ type: 'notFound' })
    expect(routeApi('POST', '/other', null)).toEqual({ type: 'notFound' })
  })
})

describe('routeApi — durcissement traversal', () => {
  it('PATCH /api/sections/:dir rejette un dir contenant .. ou / (encodé)', () => {
    expect(routeApi('PATCH', '/api/sections/..%2F..%2Fetc', { title: 'X' }).type).toBe('badRequest')
    expect(routeApi('PATCH', '/api/sections/%2e%2e', { title: 'X' }).type).toBe('badRequest')
  })

  it('POST /api/tasks rejette une section qui est un chemin', () => {
    expect(routeApi('POST', '/api/tasks', { section: '../evil', title: 'T' }).type).toBe('badRequest')
    expect(routeApi('POST', '/api/tasks', { section: 'a/b', title: 'T' }).type).toBe('badRequest')
  })
})

describe('routeApi — percent-encoding malformé', () => {
  it('PATCH /api/sections/%ZZ → badRequest (pas d’URIError)', () => {
    expect(routeApi('PATCH', '/api/sections/%ZZ', { title: 'X' }).type).toBe('badRequest')
  })
})

describe('routeApi — roadmaps (phase 2)', () => {
  it('PUT /api/roadmaps → putRoadmaps avec body', () => {
    expect(routeApi('PUT', '/api/roadmaps', { roadmaps: [] })).toEqual({
      type: 'putRoadmaps', body: { roadmaps: [] },
    })
  })
})

describe('routeApi — docs (phase 3)', () => {
  it('GET /api/docs → getDocsTree', () => {
    expect(routeApi('GET', '/api/docs', null)).toEqual({ type: 'getDocsTree' })
  })

  it('GET /api/docs/content?path=... → getDocContent avec path décodé', () => {
    expect(routeApi('GET', '/api/docs/content?path=FORMATS.md', null)).toEqual({
      type: 'getDocContent', path: 'FORMATS.md',
    })
    expect(routeApi('GET', '/api/docs/content?path=plans%2Factive%2Ffoo.md', null)).toEqual({
      type: 'getDocContent', path: 'plans/active/foo.md',
    })
  })

  it('rejette un path manquant → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content', null).type).toBe('badRequest')
  })

  it('rejette un path traversal (.. brut ou encodé) → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content?path=../secret.md', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=%2e%2e/secret.md', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=/etc/secret.md', null).type).toBe('badRequest')
  })

  it('rejette une extension non-.md → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content?path=FORMATS.txt', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=FORMATS', null).type).toBe('badRequest')
  })
})

describe('routeApi — Notepad (#86)', () => {
  it('route les 6 routes notes + reveal sur leur action', () => {
    expect(routeApi('GET', '/api/notes', null)).toEqual({ type: 'listNotes' })
    expect(routeApi('POST', '/api/notes', { content: 'x' })).toEqual({ type: 'createNote', body: { content: 'x' } })
    expect(routeApi('GET', '/api/notes/idee', null)).toEqual({ type: 'readNote', slug: 'idee' })
    expect(routeApi('PUT', '/api/notes/idee', { content: 'y' })).toEqual({ type: 'writeNote', slug: 'idee', body: { content: 'y' } })
    expect(routeApi('DELETE', '/api/notes/idee', null)).toEqual({ type: 'deleteNote', slug: 'idee' })
    expect(routeApi('POST', '/api/notes/idee/archive', null)).toEqual({ type: 'archiveNote', slug: 'idee' })
    expect(routeApi('POST', '/api/reveal', { path: '/x' })).toEqual({ type: 'reveal', body: { path: '/x' } })
  })
})

describe('runAction — Notepad CRUD + sécurité reveal (#86)', () => {
  let docsDir: string
  const paths = () => ({ tasksDir: '/unused', docsDir })
  const run = (method: string, url: string, body: unknown = null) =>
    runAction(paths(), routeApi(method, url, body))
  beforeEach(() => { docsDir = mkdtempSync(join(tmpdir(), 'roadmapped-notes-')) })
  afterEach(() => rmSync(docsDir, { recursive: true, force: true }))

  it('create → read → autosave relu sur disque', () => {
    const created = run('POST', '/api/notes', { content: 'Mon idée\ndétail' })
    const slug = (created.payload as any).slug
    expect(created.status).toBe(200)
    expect(existsSync(join(docsDir, 'notes', `${slug}.md`))).toBe(true)
    const read = run('GET', `/api/notes/${slug}`)
    expect((read.payload as any).content).toBe('Mon idée\ndétail')
  })

  it('write renomme au fil de l’eau quand la 1re ligne change', () => {
    const slug = (run('POST', '/api/notes', { content: 'Brouillon' }).payload as any).slug
    const w = run('PUT', `/api/notes/${slug}`, { content: 'Titre définitif\ncorps' })
    expect((w.payload as any).slug).toBe('titre-definitif')
    expect(readFileSync(join(docsDir, 'notes', 'titre-definitif.md'), 'utf8')).toContain('corps')
    expect(existsSync(join(docsDir, 'notes', `${slug}.md`))).toBe(false) // ancien slug parti
  })

  it('list trie par modification décroissante ; archive puis delete', () => {
    const a = (run('POST', '/api/notes', { content: 'A' }).payload as any).slug
    run('POST', '/api/notes', { content: 'B' })
    expect((run('GET', '/api/notes').payload as any).notes.length).toBe(2)
    expect(run('POST', `/api/notes/${a}/archive`).status).toBe(200)
    expect((run('GET', '/api/notes').payload as any).notes.length).toBe(1) // archive exclue
    const b = (run('GET', '/api/notes').payload as any).notes[0].slug
    expect(run('DELETE', `/api/notes/${b}`).status).toBe(200)
    expect((run('GET', '/api/notes').payload as any).notes.length).toBe(0)
  })

  it('reveal REFUSE un chemin hors du HOME (403)', () => {
    expect(run('POST', '/api/reveal', { path: '/etc/passwd' }).status).toBe(403)
  })
  it('reveal refuse un chemin non absolu (400) et un fichier inexistant dans HOME (404)', () => {
    expect(run('POST', '/api/reveal', { path: 'relatif.txt' }).status).toBe(400)
    expect(run('POST', '/api/reveal', { path: join(homedir(), '__ne-existe-pas-roadmapped__.xyz') }).status).toBe(404)
  })
})

describe('ensureGitignore — idempotent (#87)', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'roadmapped-gi-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ajoute la ligne une fois, jamais deux', () => {
    const gi = join(dir, '.gitignore')
    expect(ensureGitignore(gi, 'docs/notes/')).toBe(true)
    expect(ensureGitignore(gi, 'docs/notes/')).toBe(false) // déjà présente
    expect(readFileSync(gi, 'utf8').split('\n').filter((l) => l === 'docs/notes/').length).toBe(1)
  })
})
