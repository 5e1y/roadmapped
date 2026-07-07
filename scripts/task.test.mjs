import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
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

/** Lance le CLI et capture code + stdout + stderr (spawnSync : stderr capturé même
 *  en cas de SUCCÈS — nécessaire pour les warnings non bloquants du done). */
function runTask(args) {
  const r = spawnSync('node', [scriptPath(), ...args], { encoding: 'utf8' })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
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

describe('CLI take / brief — liens titrés, contexte en 1 appel (#65)', () => {
  it('brief affiche les liées avec titre + statut inline (#id titre (statut))', () => {
    // #1 est liée à #2 (links: [2]) ; on crée #2 pour lui donner un titre.
    runTask(['add', '--section', SEC, '--title', 'Cible liée', '--team', 'design'])
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/liées:/)
    expect(r.stdout).toMatch(/#2 Cible liée \(à faire\)/)
  })

  it('brief liste refs une par ligne et rappelle la consigne done', () => {
    const r = runTask(['brief', '1'])
    expect(r.stdout).toMatch(/refs:/)
    expect(r.stdout).toMatch(/docs\/x\.md/)
    expect(r.stdout).toMatch(/done 1 --commit <sha> --outcome/)
    expect(r.stdout).toMatch(/--verification/) // task (non quick) : verification rappelée
  })

  it('take démarre la prochaine dispo et sort le brief précédé de « #id démarrée »', () => {
    const r = runTask(['take'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#1 démarrée/)
    expect(r.stdout).toMatch(/stage: 04-build/)
    // la tâche est réellement passée in_progress
    expect(readTask().status).toBe('in_progress')
  })

  it('take sans rien de dispo → message court', () => {
    const r = runTask(['take', '--team', 'legal']) // aucune tâche legal
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Aucune tâche disponible/)
  })

  it('show affiche les liées titrées (même helper que brief)', () => {
    runTask(['add', '--section', SEC, '--title', 'Autre cible', '--team', 'design'])
    const r = runTask(['show', '1'])
    expect(r.stdout).toMatch(/liées:.*#2 Autre cible \(à faire\)/)
  })
})

describe('CLI list --json — allégé par défaut, --json-full pour l\'intégral (#65)', () => {
  it('--json est allégé (id,title,status,team,stage,size,kind ; pas de detail/dates)', () => {
    const r = runTask(['list', '--json'])
    expect(r.code).toBe(0)
    const arr = JSON.parse(r.stdout)
    expect(Array.isArray(arr)).toBe(true)
    const t = arr.find((x) => x.id === 1)
    expect(t).toMatchObject({ id: 1, title: 'Tâche', status: 'todo', team: 'engineering', stage: '04-build', size: 'M', kind: 'task' })
    expect(t).not.toHaveProperty('detail')
    expect(t).not.toHaveProperty('createdAt')
  })

  it('--json-full renvoie l\'objet intégral (nextId + sections, detail présent)', () => {
    const r = runTask(['list', '--json-full'])
    const obj = JSON.parse(r.stdout)
    expect(obj).toHaveProperty('nextId')
    expect(obj).toHaveProperty('sections')
    const t = obj.sections.flatMap((s) => s.tasks).find((x) => x.id === 1)
    expect(t).toHaveProperty('detail')
    expect(t).toHaveProperty('createdAt')
  })
})

describe('CLI erreurs autoportantes — usage exact de la commande fautive (#65)', () => {
  it('un flag inconnu sur list imprime l\'usage de list (pas le USAGE global)', () => {
    const r = runTask(['list', '--wat', 'x'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/Flag inconnu : --wat/)
    expect(r.stderr).toMatch(/Usage : list/)
    expect(r.stderr).not.toMatch(/source de vérité du backlog/) // pas le USAGE global
  })

  it('un flag inconnu sur take imprime l\'usage de take', () => {
    const r = runTask(['take', '--nope'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/Usage : take/)
  })
})

describe('CLI quick — mini-tickets (#66)', () => {
  it('cycle complet en 2 commandes : quick --start puis done --outcome (sans verification) → OK', () => {
    const created = runTask(['quick', 'fix chevron', '--team', 'design', '--start'])
    expect(created.code).toBe(0)
    expect(created.stdout).toMatch(/#2 créée \(quick\)/)
    expect(created.stdout).toMatch(/#2 démarrée/)
    const done = runTask(['done', '2', '--outcome', 'chevron redressé'])
    expect(done.code).toBe(0)
    // Stage par défaut = 1er stage open : dans ce sandbox les 8 sont open → 01-idea.
    const t = load(readFileSync(join(tasksDir, '01-idea', '01-fix-chevron.yaml'), 'utf8'))
    expect(t.kind).toBe('quick')
    expect(t.status).toBe('done')
    expect(t.outcome).toBe('chevron redressé')
    expect(t.verification).toBeNull() // facultative pour un quick
  })

  it('quick sans stage → atterrit dans le premier stage open (01-idea ici)', () => {
    const r = runTask(['quick', 'petit truc', '--team', 'design'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#2 créée \(quick\)/)
    const t = load(readFileSync(join(tasksDir, '01-idea', '01-petit-truc.yaml'), 'utf8'))
    expect(t.kind).toBe('quick')
  })

  it('done d\'un quick SANS outcome échoue (outcome requis)', () => {
    runTask(['quick', 'sans issue', '--team', 'design', '--start'])
    const r = runTask(['done', '2'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/outcome/)
  })

  it('quick en size L est refusé (via update size L → rollback)', () => {
    runTask(['quick', 'gros truc', '--team', 'design'])
    const r = runTask(['update', '2', '--size', 'L'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/quick.*L|L.*quick/)
  })

  it('quick apparaît dans la file next (servi comme une task)', () => {
    runTask(['quick', 'à prendre', '--team', 'design'])
    const r = runTask(['next', '--count', '5', '--json'])
    const arr = JSON.parse(r.stdout)
    expect(arr.some((t) => t.id === 2 && t.kind === 'quick')).toBe(true)
  })
})

describe('CLI done — anti-exploration & rétrocompat kind (#66)', () => {
  it('done d\'une task SANS refs → succès + warning sur stderr', () => {
    runTask(['add', '--section', SEC, '--title', 'Sans refs', '--team', 'design']) // #2, refs vides
    runTask(['start', '2'])
    const r = runTask(['done', '2', '--outcome', 'livré'])
    expect(r.code).toBe(0) // non bloquant
    expect(r.stderr).toMatch(/refs/)
  })

  it('une task créée via CLI ne matérialise jamais « kind » dans son YAML', () => {
    runTask(['add', '--section', SEC, '--title', 'Normale née CLI', '--team', 'design'])
    const raw = readFileSync(join(tasksDir, SEC, '02-normale-nee-cli.yaml'), 'utf8')
    expect(raw).not.toContain('kind:')
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
