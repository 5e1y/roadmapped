import { describe, expect, it } from 'vitest'
import { shouldReload } from './TreeContext'

/*
 * #367 (perf) : le listener SSE `change` ne rechargeait le tree ENTIER (~630 Ko)
 * qu'aveuglément, y compris sur des events qui ne touchent aucun ticket
 * (régénération Graphify, écriture de note). `shouldReload` filtre sur les
 * `paths` réels émis par broadcast()/schedule() dans src/server/api.ts.
 *
 * Exigence #1 : ne JAMAIS rater une vraie écriture de ticket → fail-safe = recharger.
 * La perf (éviter le reload superflu) est secondaire.
 */

describe('shouldReload — fail-safe (recharge)', () => {
  it('recharge si payload absent (undefined/null/vide)', () => {
    expect(shouldReload(undefined)).toBe(true)
    expect(shouldReload(null)).toBe(true)
    expect(shouldReload('')).toBe(true)
  })

  it('recharge si JSON malformé', () => {
    expect(shouldReload('{paths: not json')).toBe(true)
    expect(shouldReload('not json at all')).toBe(true)
  })

  it('recharge si paths manquant, non-array, ou vide', () => {
    expect(shouldReload(JSON.stringify({}))).toBe(true)
    expect(shouldReload(JSON.stringify({ paths: 'oops' }))).toBe(true)
    expect(shouldReload(JSON.stringify({ paths: [] }))).toBe(true)
  })

  it('recharge si un chemin est non-string inattendu', () => {
    expect(shouldReload(JSON.stringify({ paths: [42] }))).toBe(true)
    expect(shouldReload(JSON.stringify({ paths: [null] }))).toBe(true)
  })
})

describe('shouldReload — chemins de tâches (recharge)', () => {
  it('recharge sur la forme relative à docsDir (préfixe tasks/)', () => {
    // watch récursif de docsDir=`docs` → `tasks/NN-xxx/123.yaml`
    expect(shouldReload(JSON.stringify({ paths: ['tasks/01-todo/123-foo.yaml'] }))).toBe(true)
  })

  it('recharge sur la forme relative à tasksDir (sans préfixe, via extension .yaml)', () => {
    // watch de tasksDir=`docs/tasks` → `NN-xxx/123.yaml` (pas de préfixe tasks/)
    expect(shouldReload(JSON.stringify({ paths: ['05-design/183-foo.yaml'] }))).toBe(true)
  })

  it('recharge sur un chemin absolu docs/tasks/', () => {
    expect(shouldReload(JSON.stringify({ paths: ['docs/tasks/01-todo/9.yaml'] }))).toBe(true)
  })

  it('recharge dès qu’UN chemin sur plusieurs concerne une tâche', () => {
    expect(
      shouldReload(JSON.stringify({ paths: ['graph.json', 'notes/x.md', 'tasks/01-todo/1.yaml'] })),
    ).toBe(true)
  })

  it('recharge sur séparateurs Windows (backslash)', () => {
    expect(shouldReload(JSON.stringify({ paths: ['tasks\\01-todo\\1.yaml'] }))).toBe(true)
  })
})

describe('shouldReload — events hors tâches (pas de reload)', () => {
  it('ne recharge pas sur une régénération Graphify', () => {
    // watch de graphify-out/ → chemins relatifs à ce dir
    expect(shouldReload(JSON.stringify({ paths: ['graph.json'] }))).toBe(false)
    expect(
      shouldReload(JSON.stringify({ paths: ['graph.json', 'wiki/index.md', 'GRAPH_REPORT.md'] })),
    ).toBe(false)
  })

  it('ne recharge pas sur une écriture de note', () => {
    expect(shouldReload(JSON.stringify({ paths: ['notes/scratch.md'] }))).toBe(false)
  })
})
