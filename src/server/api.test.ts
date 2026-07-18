import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { routeApi, runAction, apiGuard, hostnameOf } from './api'
import { ensureGitignore } from './notes'

describe('apiGuard (#360) — durcissement API locale', () => {
  const H = (o: Record<string, string>) => o as Parameters<typeof apiGuard>[1]
  it('hostnameOf ôte scheme, port et crochets IPv6', () => {
    expect(hostnameOf('localhost:3000')).toBe('localhost')
    expect(hostnameOf('http://127.0.0.1:8080')).toBe('127.0.0.1')
    expect(hostnameOf('[::1]:5173')).toBe('::1')
    expect(hostnameOf(undefined)).toBe('')
  })
  it('GET local → autorisé', () => {
    expect(apiGuard('GET', H({ host: 'localhost:3000' }))).toBeNull()
  })
  it('Host non-local → 403 (DNS-rebinding)', () => {
    expect(apiGuard('GET', H({ host: 'evil.com' }))?.status).toBe(403)
  })
  it('mutation avec Origin cross-site → 403 (CSRF)', () => {
    const v = apiGuard('POST', H({ host: 'localhost:3000', origin: 'https://evil.com', 'content-type': 'application/json', 'content-length': '10' }))
    expect(v?.status).toBe(403)
  })
  it('mutation avec corps text/plain → 415 (esquive de preflight)', () => {
    const v = apiGuard('POST', H({ host: 'localhost:3000', 'content-type': 'text/plain', 'content-length': '10' }))
    expect(v?.status).toBe(415)
  })
  it('PATCH same-origin JSON → autorisé', () => {
    expect(apiGuard('PATCH', H({ host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', 'content-length': '10' }))).toBeNull()
  })
  it('POST sans corps (/api/update) → autorisé, couvert par l\'Origin', () => {
    expect(apiGuard('POST', H({ host: 'localhost:3000', 'content-length': '0' }))).toBeNull()
  })
  it('mutation sans Origin (curl/CLI, pas un vecteur browser) → autorisée', () => {
    expect(apiGuard('POST', H({ host: 'localhost:3000', 'content-type': 'application/json', 'content-length': '5' }))).toBeNull()
  })
})

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
    expect(routeApi('PATCH', '/api/tasks/42', { heat: 50 })).toEqual({
      type: 'patchTask', id: 42, body: { heat: 50 },
    })
  })

  it('POST /api/tasks/:id/archive → notFound (archivage retiré #154)', () => {
    expect(routeApi('POST', '/api/tasks/42/archive', null)).toEqual({ type: 'notFound' })
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

describe('routeApi — epics (#133, ex-roadmaps)', () => {
  it('PUT /api/epics → putEpics avec body', () => {
    expect(routeApi('PUT', '/api/epics', { epics: [] })).toEqual({
      type: 'putEpics', body: { epics: [] },
    })
  })
  it("l'ancienne route PUT /api/roadmaps n'existe plus (404)", () => {
    expect(routeApi('PUT', '/api/roadmaps', { roadmaps: [] }).type).toBe('notFound')
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

describe('runAction — getTree expose le repo hôte (#204)', () => {
  it('renvoie hostRoot + repoName (basename) — primitive header + sonde bin', () => {
    // tasksDir/docsDir pointent sur les vrais dossiers du repo (arbre valide) ;
    // root est un chemin nommé arbitraire — c'est son basename qu'on vérifie.
    const root = '/somewhere/cool-repo'
    const res = runAction(
      { root, tasksDir: join(process.cwd(), 'docs/tasks'), docsDir: join(process.cwd(), 'docs'), kbGraphFile: join(process.cwd(), 'graphify-out/graph.json') },
      { type: 'getTree' },
    )
    const payload = res.payload as { ok: boolean; hostRoot: string; repoName: string }
    expect(payload.ok).toBe(true)
    expect(payload.hostRoot).toBe(root)
    expect(payload.repoName).toBe('cool-repo')
  })
})

describe('runAction — Notepad CRUD + sécurité reveal (#86)', () => {
  let docsDir: string
  const paths = () => ({ root: '/unused', tasksDir: '/unused', docsDir, kbGraphFile: '/unused/graph.json' })
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
