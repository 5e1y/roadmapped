import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePaths, findHostRoot, loadPathsAt } from './paths'

describe('resolvePaths', () => {
  it('applique les défauts (docs/tasks, docs) relatifs à la racine HÔTE', () => {
    const p = resolvePaths('/host', {})
    expect(p.tasksDir).toBe('/host/docs/tasks')
    expect(p.docsDir).toBe('/host/docs')
  })

  it('résout un chemin relatif de config depuis la racine hôte', () => {
    const p = resolvePaths('/host', { tasksDir: 'custom/tasks', docsDir: 'custom' })
    expect(p.tasksDir).toBe('/host/custom/tasks')
    expect(p.docsDir).toBe('/host/custom')
  })

  it('respecte un chemin absolu tel quel', () => {
    const p = resolvePaths('/host', { tasksDir: '/abs/tasks' })
    expect(p.tasksDir).toBe('/abs/tasks')
    expect(p.docsDir).toBe('/host/docs') // défaut pour docsDir
  })
})

describe('findHostRoot — dissociation racine-hôte / racine-paquet (#123)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'roadmapped-paths-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('remonte jusqu’au premier ancêtre portant roadmapped.config.json', () => {
    writeFileSync(join(dir, 'roadmapped.config.json'), '{}')
    const deep = join(dir, 'a', 'b', 'c')
    mkdirSync(deep, { recursive: true })
    expect(findHostRoot(deep)).toBe(dir)
  })

  it('rétrocompat : l’ancien roadmaped.config.json (un p) ancre aussi la racine', () => {
    writeFileSync(join(dir, 'roadmaped.config.json'), '{}')
    const deep = join(dir, 'sub')
    mkdirSync(deep)
    expect(findHostRoot(deep)).toBe(dir)
  })

  it('fallback .git : une racine git SANS config est un hôte non initialisé', () => {
    mkdirSync(join(dir, '.git'))
    const deep = join(dir, 'src', 'lib')
    mkdirSync(deep, { recursive: true })
    expect(findHostRoot(deep)).toBe(dir)
  })

  it('ne saute jamais hors du repo courant : .git plus proche gagne sur une config au-dessus', () => {
    writeFileSync(join(dir, 'roadmapped.config.json'), '{}') // config parasite au-dessus
    const repo = join(dir, 'mon-projet')
    mkdirSync(join(repo, '.git'), { recursive: true })
    expect(findHostRoot(join(repo))).toBe(repo)
  })

  it('ni config ni .git en remontant → startDir tel quel', () => {
    const deep = join(dir, 'nu')
    mkdirSync(deep)
    // dir est sous tmpdir : aucun ancêtre ne porte config ni .git
    expect(findHostRoot(deep)).toBe(deep)
  })
})

describe('loadPathsAt — lecture de config ancrée sur une racine explicite', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'roadmapped-paths-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('self-hosting inchangé : config à la racine, tasksDir=docs/tasks', () => {
    writeFileSync(join(dir, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'docs' }))
    const p = loadPathsAt(dir)
    expect(p.tasksDir).toBe(join(dir, 'docs/tasks'))
    expect(p.docsDir).toBe(join(dir, 'docs'))
  })

  it('config absente → défauts relatifs à la racine hôte (plus jamais ../)', () => {
    const p = loadPathsAt(dir)
    expect(p.tasksDir).toBe(join(dir, 'docs/tasks'))
    expect(p.docsDir).toBe(join(dir, 'docs'))
  })

  it('config illisible → défauts (l’outil doit démarrer quand même)', () => {
    writeFileSync(join(dir, 'roadmapped.config.json'), '{pas du json')
    const p = loadPathsAt(dir)
    expect(p.tasksDir).toBe(join(dir, 'docs/tasks'))
  })
})
