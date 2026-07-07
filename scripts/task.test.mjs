import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

// Le fix de la Task 29 vit dans la couche CLI (cmdUpdate de task.mjs), pas dans
// taskWrites.ts : « --tags null » doit vider la liste ([]) au lieu de créer un
// tag littéral "null" (parité avec --depends-on null). On teste donc le vrai
// binaire, en sous-processus, contre un sandbox jetable — JAMAIS le docs/tasks
// réel (la config du sandbox pointe tasksDir sur un chemin ABSOLU temporaire).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let sandbox
let tasksDir
const scriptPath = () => join(sandbox, 'scripts', 'task.mjs')

/** Construit un sandbox autonome (script + lib + node_modules + config + tasks). */
function buildSandbox() {
  sandbox = mkdtempSync(join(tmpdir(), 'roadmaped-cli-'))
  mkdirSync(join(sandbox, 'scripts'))
  cpSync(join(repoRoot, 'scripts', 'task.mjs'), join(sandbox, 'scripts', 'task.mjs'))
  cpSync(join(repoRoot, 'src', 'lib'), join(sandbox, 'src', 'lib'), { recursive: true })
  symlinkSync(join(repoRoot, 'node_modules'), join(sandbox, 'node_modules'))

  tasksDir = join(sandbox, 'tasks')
  mkdirSync(join(tasksDir, '01-test'), { recursive: true })
  writeFileSync(join(sandbox, 'roadmaped.config.json'), JSON.stringify({ tasksDir }))
  writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 2\n')
  writeFileSync(
    join(tasksDir, '01-test', '_section.yaml'),
    'title: "Test"\nstatus: open\nnote: null\n',
  )
  writeFileSync(
    join(tasksDir, '01-test', '01-tache.yaml'),
    [
      'id: 1', 'code: null', 'title: Tâche', 'status: todo',
      'tags:', '  - alpha', '  - beta',
      'size: M', 'zone: null', 'detail: null',
      'refs:', '  - docs/x.md',
      'links:', '  - 2',
      'dependsOn: []', 'milestone: null', 'source: ai',
      'createdAt: "2026-07-07"', 'completedAt: null',
      'commit: null', 'verification: null', 'release: null', '',
    ].join('\n'),
  )
}

const runUpdate = (...args) =>
  execFileSync('node', [scriptPath(), 'update', '1', ...args], { encoding: 'utf8' })

const readTask = () =>
  load(readFileSync(join(tasksDir, '01-test', '01-tache.yaml'), 'utf8'))

beforeEach(buildSandbox)
afterEach(() => rmSync(sandbox, { recursive: true, force: true }))

describe('CLI update — champs liste avec "null"', () => {
  it('--tags null vide la liste ([]) au lieu de créer un tag littéral "null"', () => {
    runUpdate('--tags', 'null')
    expect(readTask().tags).toEqual([])
  })

  it('vide aussi refs et links avec "null"', () => {
    runUpdate('--refs', 'null', '--links', 'null')
    const t = readTask()
    expect(t.refs).toEqual([])
    expect(t.links).toEqual([])
  })

  it('conserve le comportement normal pour des valeurs réelles', () => {
    runUpdate('--tags', 'x,y', '--refs', 'a,b')
    const t = readTask()
    expect(t.tags).toEqual(['x', 'y'])
    expect(t.refs).toEqual(['a', 'b'])
  })

  it('--tags "" vide toujours la liste (contournement historique)', () => {
    runUpdate('--tags', '')
    expect(readTask().tags).toEqual([])
  })
})
