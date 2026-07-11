import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeGraph, readKbGraph } from './kb'

describe('normalizeGraph — tolérance défensive (schéma pré-1.0)', () => {
  it('lit le node-link NetworkX (links), map les champs, communities distinctes', () => {
    const g = normalizeGraph({
      nodes: [
        { id: 'a', label: 'A', file_type: 'code', source_file: 'src/a.ts', source_location: 'L1', community: 0 },
        { id: 'b', label: 'B', file_type: 'document', source_file: 'docs/b.md', community: 1 },
      ],
      links: [{ source: 'a', target: 'b', relation: 'imports_from', confidence: 'EXTRACTED', weight: 2 }],
    }, '2026-07-11T00:00:00.000Z')
    expect(g.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(g.nodes[0].sourceFile).toBe('src/a.ts')
    expect(g.nodes[1].sourceLocation).toBeNull()
    expect(g.edges).toEqual([{ source: 'a', target: 'b', relation: 'imports_from', confidence: 'EXTRACTED', weight: 2 }])
    expect(g.stats).toEqual({ nodes: 2, edges: 1, communities: 2 })
    expect(g.generatedAt).toBe('2026-07-11T00:00:00.000Z')
  })

  it('accepte `edges` au lieu de `links`, et des endpoints en OBJET {id}', () => {
    const g = normalizeGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: { id: 'a' }, target: { id: 'b' } }],
    }, null)
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'a', target: 'b', confidence: 'EXTRACTED' })
  })

  it('community absente → -1 ; label absent → id ; file_type absent → unknown', () => {
    const g = normalizeGraph({ nodes: [{ id: 'x' }], links: [] }, null)
    expect(g.nodes[0]).toMatchObject({ id: 'x', label: 'x', fileType: 'unknown', community: -1 })
    expect(g.stats.communities).toBe(0)
  })

  it('écarte les arêtes vers un nœud absent et dédoublonne les nœuds', () => {
    const g = normalizeGraph({
      nodes: [{ id: 'a' }, { id: 'a' }],
      links: [{ source: 'a', target: 'ghost' }, { source: 'a', target: 'a' }],
    }, null)
    expect(g.nodes).toHaveLength(1) // dédup
    expect(g.edges).toHaveLength(1) // la→ghost écartée, la boucle a→a conservée
  })

  it('entrée vide / non-objet → graphe vide sans crash', () => {
    expect(normalizeGraph(null, null).stats).toEqual({ nodes: 0, edges: 0, communities: 0 })
    expect(normalizeGraph({}, null).nodes).toEqual([])
  })
})

describe('readKbGraph — I/O', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'roadmapped-kb-')) })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('fichier absent → { ok:true, graph:null } (état normal, empty state)', () => {
    expect(readKbGraph(join(dir, 'nope.json'))).toEqual({ ok: true, graph: null })
  })

  it('JSON cassé → 422', () => {
    const f = join(dir, 'graph.json')
    writeFileSync(f, '{pas du json')
    const res = readKbGraph(f)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(422)
  })

  it('JSON valide → graphe normalisé + generatedAt (mtime)', () => {
    const f = join(dir, 'graph.json')
    writeFileSync(f, JSON.stringify({ nodes: [{ id: 'a' }], links: [] }))
    const res = readKbGraph(f)
    expect(res.ok).toBe(true)
    if (res.ok && res.graph) {
      expect(res.graph.nodes.map((n) => n.id)).toEqual(['a'])
      expect(res.graph.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
