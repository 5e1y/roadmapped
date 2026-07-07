import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

// On teste le vrai binaire, en sous-processus, contre un sandbox jetable — JAMAIS
// le docs/tasks réel (la config du sandbox pointe tasksDir sur un chemin ABSOLU
// temporaire). Depuis le refactor stages+teams, la validation stricte exige les
// 8 stages canoniques : le sandbox les sème donc tous.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Les 8 stages canoniques (miroir de STAGES dans src/lib/tasks.ts).
const STAGES = [
  ['01-idea', 'Idea Stage'],
  ['02-initial', 'Initial Stage'],
  ['03-identity', 'Identity Stage'],
  ['04-build', 'Build Stage'],
  ['05-gtm', 'GTM Stage'],
  ['06-launch', 'Launch Stage'],
  ['07-scale', 'Scale Stage'],
  ['08-mature', 'Mature Stage'],
]
const SEC = '04-build'

let sandbox
let tasksDir
const scriptPath = () => join(sandbox, 'scripts', 'task.mjs')

/** Construit un sandbox autonome (script + lib + node_modules + config + 8 stages). */
function buildSandbox() {
  sandbox = mkdtempSync(join(tmpdir(), 'roadmaped-cli-'))
  mkdirSync(join(sandbox, 'scripts'))
  cpSync(join(repoRoot, 'scripts', 'task.mjs'), join(sandbox, 'scripts', 'task.mjs'))
  cpSync(join(repoRoot, 'src', 'lib'), join(sandbox, 'src', 'lib'), { recursive: true })
  symlinkSync(join(repoRoot, 'node_modules'), join(sandbox, 'node_modules'))

  tasksDir = join(sandbox, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(sandbox, 'roadmaped.config.json'), JSON.stringify({ tasksDir }))
  writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 2\n')
  for (const [slug, title] of STAGES) {
    mkdirSync(join(tasksDir, slug), { recursive: true })
    writeFileSync(join(tasksDir, slug, '_section.yaml'), `title: "${title}"\nstatus: open\nnote: null\n`)
  }
  writeFileSync(
    join(tasksDir, SEC, '01-tache.yaml'),
    [
      'id: 1', 'code: null', 'title: Tâche', 'status: todo',
      'tags:', '  - alpha', '  - beta',
      'size: M', 'team: engineering', 'detail: null',
      'refs:', '  - docs/x.md',
      'links:', '  - 2',
      'dependsOn: []', 'milestone: null', 'source: ai',
      'createdAt: "2026-07-07"', 'completedAt: null',
      'commit: null', 'verification: null', 'release: null', '',
    ].join('\n'),
  )
}

/** Lance le CLI et capture code de sortie + sorties (ne throw jamais). */
function runTask(args) {
  try {
    const stdout = execFileSync('node', [scriptPath(), ...args], { encoding: 'utf8' })
    return { code: 0, stdout, stderr: '' }
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

const runUpdate = (...args) =>
  execFileSync('node', [scriptPath(), 'update', '1', ...args], { encoding: 'utf8' })

const readTask = () =>
  load(readFileSync(join(tasksDir, SEC, '01-tache.yaml'), 'utf8'))

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

describe('CLI add — team obligatoire (enum fixe)', () => {
  it('refuse un add sans --team', () => {
    const r = runTask(['add', '--section', SEC, '--title', 'Sans team'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/--team/)
  })

  it('refuse un add avec une --team hors enum (message listant les valeurs)', () => {
    const r = runTask(['add', '--section', SEC, '--title', 'X', '--team', 'wizardry'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/team/)
    expect(r.stderr).toMatch(/engineering/) // le message énumère les teams valides
  })

  it('accepte un add avec une --team valide', () => {
    const r = runTask(['add', '--section', SEC, '--title', 'Bien née', '--team', 'design'])
    expect(r.code).toBe(0)
  })

  it('rejette --zone comme flag inconnu', () => {
    const r = runTask(['add', '--section', SEC, '--title', 'X', '--team', 'engineering', '--zone', 'store'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/inconnu.*--zone/)
  })
})

describe('CLI list — filtre --team', () => {
  it('ne renvoie que les tâches de la team demandée', () => {
    runTask(['add', '--section', SEC, '--title', 'Une tâche design', '--team', 'design'])
    runTask(['add', '--section', SEC, '--title', 'Une tâche finance', '--team', 'finance'])
    const r = runTask(['list', '--team', 'design'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Une tâche design/)
    expect(r.stdout).not.toMatch(/Une tâche finance/)
    // La tâche seed (#1, engineering) n'apparaît pas non plus
    expect(r.stdout).not.toMatch(/#1 /)
  })
})
