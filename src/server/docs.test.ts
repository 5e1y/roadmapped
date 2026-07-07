import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocsTree, readDocContent, unsafeDocPath } from './docs'

let dir: string

/**
 * Fabrique un docsDir jetable :
 *   FORMATS.md, .hidden.md (caché), notes.txt (non-.md)
 *   plans/active/foo.md, plans/archive/ (vide → doit disparaître)
 *   tasks/x.yaml (pas de .md → le dossier doit disparaître)
 *   node_modules/pollution.md (ignoré)
 */
function seed(): void {
  writeFileSync(join(dir, 'FORMATS.md'), '# Formats\n\nContenu.')
  writeFileSync(join(dir, '.hidden.md'), '# Caché')
  writeFileSync(join(dir, 'notes.txt'), 'pas du markdown')
  mkdirSync(join(dir, 'plans', 'active'), { recursive: true })
  writeFileSync(join(dir, 'plans', 'active', 'foo.md'), '# Foo')
  mkdirSync(join(dir, 'plans', 'archive'), { recursive: true })
  mkdirSync(join(dir, 'tasks', '01-x'), { recursive: true })
  writeFileSync(join(dir, 'tasks', '01-x', 'a.yaml'), 'id: 1\n')
  mkdirSync(join(dir, 'node_modules'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', 'pollution.md'), '# Non')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roadmaped-docs-'))
  seed()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('buildDocsTree', () => {
  it('liste dossiers puis fichiers, alpha, .md uniquement', () => {
    const tree = buildDocsTree(dir)
    expect(tree.map((n) => n.name)).toEqual(['plans', 'FORMATS.md'])
  })

  it('trie les fichiers en ordre naturel (10 après 2, pas alpha)', () => {
    writeFileSync(join(dir, '2-second.md'), '# 2')
    writeFileSync(join(dir, '10-tenth.md'), '# 10')
    const names = buildDocsTree(dir).map((n) => n.name)
    expect(names.indexOf('2-second.md')).toBeLessThan(names.indexOf('10-tenth.md'))
  })

  it('exclut les entrées cachées et non-.md', () => {
    const tree = buildDocsTree(dir)
    const names = tree.map((n) => n.name)
    expect(names).not.toContain('.hidden.md')
    expect(names).not.toContain('notes.txt')
  })

  it('exclut node_modules', () => {
    const tree = buildDocsTree(dir)
    expect(tree.map((n) => n.name)).not.toContain('node_modules')
  })

  it('un dossier sans .md descendant (récursif) disparaît (plans/archive, tasks)', () => {
    const tree = buildDocsTree(dir)
    const plans = tree.find((n) => n.name === 'plans')!
    expect(plans.children!.map((n) => n.name)).toEqual(['active'])
    expect(tree.map((n) => n.name)).not.toContain('tasks')
  })

  it('path relatif POSIX correct sur les enfants imbriqués', () => {
    const tree = buildDocsTree(dir)
    const plans = tree.find((n) => n.name === 'plans')!
    const active = plans.children!.find((n) => n.name === 'active')!
    const foo = active.children!.find((n) => n.name === 'foo.md')!
    expect(foo.path).toBe('plans/active/foo.md')
  })
})

describe('readDocContent', () => {
  it('lit le contenu brut d’un .md existant', () => {
    const res = readDocContent(dir, 'FORMATS.md')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.content).toContain('# Formats')
  })

  it('lit un .md imbriqué', () => {
    const res = readDocContent(dir, 'plans/active/foo.md')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.content).toContain('# Foo')
  })

  it('404 si le fichier est absent', () => {
    const res = readDocContent(dir, 'nope.md')
    expect(res).toEqual({ ok: false, status: 404, error: expect.any(String) })
  })

  it('400 si extension ≠ .md', () => {
    const res = readDocContent(dir, 'notes.txt')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(400)
  })

  it('400 sur path traversal (.. ou absolu), le fichier reste illisible', () => {
    writeFileSync(join(dir, '..', 'outside-secret.md'), 'fuite')
    try {
      const res = readDocContent(dir, '../outside-secret.md')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.status).toBe(400)
    } finally {
      rmSync(join(dir, '..', 'outside-secret.md'), { force: true })
    }
  })
})

describe('unsafeDocPath', () => {
  it('accepte un chemin relatif simple ou imbriqué', () => {
    expect(unsafeDocPath('FORMATS.md')).toBe(false)
    expect(unsafeDocPath('plans/active/foo.md')).toBe(false)
  })

  it('rejette .. , absolu, null, vide', () => {
    expect(unsafeDocPath('../x.md')).toBe(true)
    expect(unsafeDocPath('/etc/x.md')).toBe(true)
    expect(unsafeDocPath(null)).toBe(true)
    expect(unsafeDocPath('')).toBe(true)
  })
})
