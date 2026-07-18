import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync, spawn } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, cpSync, symlinkSync, renameSync, chmodSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

// On teste le vrai binaire, en sous-processus, contre un sandbox jetable — JAMAIS
// le docs/tasks réel (la config du sandbox pointe tasksDir sur un chemin ABSOLU
// temporaire). Depuis le refactor « jalons par type » (#230), la validation stricte
// exige les 9 TYPES canoniques : le sandbox les sème donc tous.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Les 9 types canoniques (miroir de TYPES dans src/lib/tasks.ts).
const STAGES = [
  ['01-bug', 'Bugs'],
  ['02-feature', 'Features'],
  ['03-chore', 'Chores'],
  ['04-brainstorm', 'Brainstorms'],
  ['05-design', 'Design'],
  ['06-marketing', 'Marketing'],
  ['07-communication', 'Communication'],
  ['08-legal', 'Legal'],
  ['09-business', 'Business'],
]
const SEC = '02-feature'

let sandbox
let tasksDir
const scriptPath = () => join(sandbox, 'scripts', 'task.mjs')
// Depuis #139, loadPaths() ancre les données sur le repo HÔTE (cwd remonté ou
// ROADMAPPED_ROOT), plus sur l'emplacement du script : chaque invocation du CLI
// épingle donc explicitement le sandbox comme racine hôte — sans ça, un test
// lancé depuis la racine du repo taperait le VRAI backlog.
const sbEnv = () => ({ ...process.env, ROADMAPPED_ROOT: sandbox })

/** Construit un sandbox autonome (script + lib + node_modules + config + 9 types). */
function buildSandbox() {
  sandbox = mkdtempSync(join(tmpdir(), 'roadmapped-cli-'))
  mkdirSync(join(sandbox, 'scripts'))
  cpSync(join(repoRoot, 'scripts', 'task.mjs'), join(sandbox, 'scripts', 'task.mjs'))
  cpSync(join(repoRoot, 'src', 'lib'), join(sandbox, 'src', 'lib'), { recursive: true })
  // #309 : le CLI `kb` lit le graphe via src/server/kb.ts (readKbGraph) — le sandbox
  // doit donc embarquer src/server aussi (kb.ts n'importe que node:fs).
  cpSync(join(repoRoot, 'src', 'server'), join(sandbox, 'src', 'server'), { recursive: true })
  symlinkSync(join(repoRoot, 'node_modules'), join(sandbox, 'node_modules'))

  tasksDir = join(sandbox, 'tasks')
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(sandbox, 'roadmapped.config.json'), JSON.stringify({ tasksDir }))
  writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 2\n')
  for (const [slug, title] of STAGES) {
    mkdirSync(join(tasksDir, slug), { recursive: true })
    writeFileSync(join(tasksDir, slug, '_section.yaml'), `title: "${title}"\nstatus: open\nnote: null\n`)
  }
  writeFileSync(
    join(tasksDir, SEC, '01-tache.yaml'),
    [
      'id: 1', 'title: Tâche', 'status: todo',
      'tags:', '  - alpha', '  - beta',
      'detail: null',
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
  const r = spawnSync('node', [scriptPath(), ...args], { encoding: 'utf8', env: sbEnv() })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

const runUpdate = (...args) =>
  execFileSync('node', [scriptPath(), 'update', '1', ...args], { encoding: 'utf8', env: sbEnv() })

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

describe('CLI add — --type requis (la nature, #230)', () => {
  it('refuse un add sans --type', () => {
    const r = runTask(['add', '--title', 'Sans type'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/--type/)
  })

  it('refuse un add avec un --heat non numérique (message autoportant)', () => {
    const r = runTask(['add', '--type', SEC, '--title', 'X', '--heat', 'brûlant'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/heat/)
  })

  it('accepte un add avec un --type valide', () => {
    const r = runTask(['add', '--type', SEC, '--title', 'Bien née'])
    expect(r.code).toBe(0)
  })

  it('accepte --section / --stage comme alias de --type', () => {
    expect(runTask(['add', '--section', SEC, '--title', 'Via section']).code).toBe(0)
    expect(runTask(['add', '--stage', SEC, '--title', 'Via stage']).code).toBe(0)
  })

  it('rejette --zone comme flag inconnu', () => {
    const r = runTask(['add', '--type', SEC, '--title', 'X', '--zone', 'store'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/Unknown flag.*--zone/)
  })
})

describe('CLI take / brief — liens titrés, contexte en 1 appel (#65)', () => {
  it('brief affiche les liées avec titre + statut inline (#id titre (statut))', () => {
    // #1 est liée à #2 (links: [2]) ; on crée #2 pour lui donner un titre.
    runTask(['add', '--type', SEC, '--title', 'Cible liée'])
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/linked:/)
    expect(r.stdout).toMatch(/#2 Cible liée \(todo\)/)
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
    expect(r.stdout).toMatch(/#1 started/)
    expect(r.stdout).toMatch(/type: 02-feature/)
    // la tâche est réellement passée in_progress
    expect(readTask().status).toBe('in_progress')
  })

  it('take sans rien de dispo → message court', () => {
    const r = runTask(['take', '--type', 'legal']) // aucune tâche legal
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/No task available/)
  })

  it('show affiche les liées titrées (même helper que brief)', () => {
    runTask(['add', '--type', SEC, '--title', 'Autre cible'])
    const r = runTask(['show', '1'])
    expect(r.stdout).toMatch(/linked:.*#2 Autre cible \(todo\)/)
  })
})

describe('CLI list --json — allégé par défaut, --json-full pour l\'intégral (#65)', () => {
  it('--json est allégé (id,title,status,type,kind,heat ; pas de detail/dates)', () => {
    const r = runTask(['list', '--json'])
    expect(r.code).toBe(0)
    const arr = JSON.parse(r.stdout)
    expect(Array.isArray(arr)).toBe(true)
    const t = arr.find((x) => x.id === 1)
    expect(t).toMatchObject({ id: 1, title: 'Tâche', status: 'todo', type: '02-feature', kind: 'task' })
    expect(t).not.toHaveProperty('team')
    expect(t).not.toHaveProperty('size') // #350 — size retiré du modèle
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
    expect(r.stderr).toMatch(/Unknown flag: --wat/)
    expect(r.stderr).toMatch(/Usage: list/)
    expect(r.stderr).not.toMatch(/source of truth/) // pas le USAGE global
  })

  it('un flag inconnu sur take imprime l\'usage de take', () => {
    const r = runTask(['take', '--nope'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/Usage: take/)
  })
})

describe('CLI quick — alias de création rapide d\'une task (#250 — kind quick supprimé)', () => {
  it('cycle complet en 2 commandes : quick --start puis done --outcome → OK, crée une TASK', () => {
    const created = runTask(['quick', 'fix chevron', '--type', '01-bug', '--start'])
    expect(created.code).toBe(0)
    expect(created.stdout).toMatch(/#2 created\./)
    expect(created.stdout).not.toMatch(/quick/) // le message ne parle plus de quick
    expect(created.stdout).toMatch(/#2 started/)
    const done = runTask(['done', '2', '--outcome', 'chevron redressé'])
    expect(done.code).toBe(0)
    const t = load(readFileSync(join(tasksDir, '01-bug', '01-fix-chevron.yaml'), 'utf8'))
    expect(t.kind ?? 'task').toBe('task') // kind omis du YAML (task par défaut)
    expect(t.status).toBe('done')
    expect(t.outcome).toBe('chevron redressé')
    expect(t.verification).toBeNull() // encouragée mais non bloquante
  })

  it('quick SANS --type → refusé (#293 : plus de défaut silencieux)', () => {
    const r = runTask(['quick', 'petit truc'])
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/--type is required/)
  })

  it('quick --type typé → crée la task dans le bon type', () => {
    const r = runTask(['quick', 'petit truc', '--type', '01-bug'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#2 created\./)
    const t = load(readFileSync(join(tasksDir, '01-bug', '01-petit-truc.yaml'), 'utf8'))
    expect(t).not.toHaveProperty('kind') // jamais matérialisé pour une task
  })

  it('done SANS outcome NE bloque PLUS (plus de requis propre au quick)', () => {
    runTask(['quick', 'sans issue', '--type', '01-bug', '--start'])
    const r = runTask(['done', '2'])
    expect(r.code).toBe(0)
    const t = load(readFileSync(join(tasksDir, '01-bug', '01-sans-issue.yaml'), 'utf8'))
    expect(t.status).toBe('done')
  })

  it('quick apparaît dans la file next (servi comme une task)', () => {
    runTask(['quick', 'à prendre', '--type', '01-bug'])
    const r = runTask(['next', '--count', '5', '--json'])
    const arr = JSON.parse(r.stdout)
    expect(arr.some((t) => t.id === 2 && (t.kind ?? 'task') === 'task')).toBe(true)
  })
})

describe('CLI done — anti-exploration & rétrocompat kind (#66)', () => {
  it('done d\'une task SANS refs → succès + warning sur stderr', () => {
    runTask(['add', '--type', SEC, '--title', 'Sans refs']) // #2, refs vides
    runTask(['start', '2'])
    const r = runTask(['done', '2', '--outcome', 'livré'])
    expect(r.code).toBe(0) // non bloquant
    expect(r.stderr).toMatch(/refs/)
  })

  it('une task créée via CLI ne matérialise jamais « kind » dans son YAML', () => {
    runTask(['add', '--type', SEC, '--title', 'Normale née CLI'])
    const raw = readFileSync(join(tasksDir, SEC, '02-normale-nee-cli.yaml'), 'utf8')
    expect(raw).not.toContain('kind:')
  })
})

describe('CLI list — filtre --type (la nature = la section, #230)', () => {
  it('ne renvoie que les tâches du type demandé', () => {
    // #2 dans 05-design, #3 dans 06-marketing ; le seed #1 est dans 02-feature.
    runTask(['add', '--type', '05-design', '--title', 'Une tâche design'])
    runTask(['add', '--type', '06-marketing', '--title', 'Une tâche marketing'])
    const r = runTask(['list', '--type', 'design']) // slug nu accepté
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Une tâche design/)
    expect(r.stdout).not.toMatch(/Une tâche marketing/)
    // La tâche seed (#1, dans 02-feature) n'apparaît pas non plus
    expect(r.stdout).not.toMatch(/#1 /)
  })
})

describe('CLI concurrence — verrou global de mutation (#83)', () => {
  it('N add réellement simultanés → N ids uniques consécutifs, zéro échec', async () => {
    // Lance N `add` VRAIMENT en parallèle (spawn async, tous démarrés avant d'attendre) sur
    // le MÊME sandbox : sans verrou, deux allouent le même nextId. Avec le verrou, chaque id
    // est unique, aucun process n'échoue, et validate reste OK.
    const N = 8
    const run = (i) =>
      new Promise((resolve) => {
        const p = spawn('node', [scriptPath(), 'add', '--type', SEC, '--title', `Concurrente ${i}`, '--json'], { encoding: 'utf8', env: sbEnv() })
        let out = ''
        p.stdout.on('data', (d) => { out += d })
        p.on('close', (code) => resolve({ code, out }))
      })
    const results = await Promise.all(Array.from({ length: N }, (_, i) => run(i)))
    expect(results.every((r) => r.code === 0)).toBe(true)
    const ids = results.map((r) => JSON.parse(r.out).id).sort((a, b) => a - b)
    expect(new Set(ids).size).toBe(N) // tous distincts
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => i + 2)) // consécutifs dès #2 (seed = #1)
    expect(runTask(['validate']).code).toBe(0)
  }, 20_000)
})

describe('CLI list — filtre --tag : le ledger de dette requêtable (#72)', () => {
  it('ne renvoie que les tâches portant le tag demandé', () => {
    runTask(['quick', 'Raccourci assumé', '--type', '01-bug', '--tags', 'debt']) // #2
    const r = runTask(['list', '--tag', 'debt'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/Raccourci assumé/)
    expect(r.stdout).not.toMatch(/#1 /) // la seed (tags alpha,beta) est exclue
  })

  it('un tag sans occurrence sort une liste vide (aucune section)', () => {
    const r = runTask(['list', '--tag', 'zzz-inexistant'])
    expect(r.code).toBe(0)
    expect(r.stdout.trim()).toBe('')
  })
})

describe('CLI sitrep — l\'état du monde en ≤30 lignes (#70)', () => {
  it('sort l\'en-tête, le compte in_progress, les prochaines et validate en un mot', () => {
    runTask(['start', '1']) // #1 → in_progress
    const r = runTask(['sitrep'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/^sitrep — \d{4}-\d{2}-\d{2}/)
    expect(r.stdout).toMatch(/in_progress \(1\)/)
    expect(r.stdout).toMatch(/#1 Tâche/)
    expect(r.stdout).toMatch(/validate: OK/)
    expect(r.stdout.split('\n').length).toBeLessThanOrEqual(30)
  })

  it('signale la dette ouverte (#debt) en alerte', () => {
    runTask(['quick', 'Dette ouverte', '--type', '01-bug', '--tags', 'debt']) // #2 todo
    const r = runTask(['sitrep'])
    expect(r.stdout).toMatch(/open debt item\(s\).*#2/)
  })
})

describe('CLI brief — extraits d\'ancre & fraîcheur (#69)', () => {
  it('une ref ancrée par symbole joint l\'extrait autour du symbole (lu au serve)', () => {
    // Ref résolue depuis le cwd (racine repo) : refExtract.ts existe et porte parseRef.
    runTask(['update', '1', '--refs', 'src/lib/refExtract.ts#parseRef'])
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/export function parseRef/)
    expect(r.stdout).toMatch(/src\/lib\/refExtract\.ts#parseRef/)
  })

  it('une ancre introuvable est signalée sans planter (pas d\'extrait inventé)', () => {
    runTask(['update', '1', '--refs', 'src/lib/refExtract.ts#symboleAbsent'])
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/anchor not found \(symbol "symboleAbsent"\)/)
  })
})

describe('CLI — rétrocompat config renommage (#110)', () => {
  it('un repo hôte avec l’ancien roadmaped.config.json (un p) fonctionne toujours', () => {
    renameSync(join(sandbox, 'roadmapped.config.json'), join(sandbox, 'roadmaped.config.json'))
    const r = runTask(['show', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#1/)
  })
})

describe('CLI guard — enforcement au commit (#100)', () => {
  // Le sandbox devient un vrai repo git : le guard se teste contre de VRAIS
  // fichiers stagés, et le hook contre de VRAIES tentatives de commit.
  const gitSb = (...args) => execFileSync('git', args, { cwd: sandbox, encoding: 'utf8' })
  const runGuard = () => {
    const r = spawnSync('node', [scriptPath(), 'guard'], { cwd: sandbox, encoding: 'utf8' })
    return { code: r.status ?? 1, stderr: r.stderr ?? '' }
  }
  const initGit = () => {
    gitSb('init', '-q')
    gitSb('config', 'user.email', 'guard@test.local')
    gitSb('config', 'user.name', 'Guard Test')
  }
  const stageProductFile = () => {
    writeFileSync(join(sandbox, 'produit.txt'), 'x')
    gitSb('add', 'produit.txt')
  }

  it('bloque un commit produit sans tâche in_progress — message : fichiers, quick, --no-verify', () => {
    initGit()
    stageProductFile()
    const r = runGuard()
    expect(r.code).toBe(1)
    expect(r.stderr).toMatch(/produit\.txt/)
    expect(r.stderr).toMatch(/quick "<title>" --type/)
    expect(r.stderr).toMatch(/--no-verify/)
  })

  it('passe quand une tâche est in_progress', () => {
    initGit()
    stageProductFile()
    execFileSync('node', [scriptPath(), 'start', '1'], { encoding: 'utf8', env: sbEnv() })
    expect(runGuard().code).toBe(0)
  })

  it('passe quand rien n’est stagé', () => {
    initGit()
    expect(runGuard().code).toBe(0)
  })

  it('passe pour la consignation pure (seuls des fichiers du backlog stagés)', () => {
    initGit()
    gitSb('add', 'tasks') // = le tasksDir du sandbox
    expect(runGuard().code).toBe(0)
  })

  it('passe pendant un merge (MERGE_HEAD présent)', () => {
    initGit()
    writeFileSync(join(sandbox, 'base.txt'), 'b')
    gitSb('add', 'base.txt')
    gitSb('commit', '-q', '--no-verify', '-m', 'base')
    writeFileSync(join(sandbox, '.git', 'MERGE_HEAD'), `${gitSb('rev-parse', 'HEAD').trim()}\n`)
    stageProductFile()
    expect(runGuard().code).toBe(0)
  })

  it('passe (muet) dans un repo roadmapped non initialisé (_meta.yaml absent)', () => {
    initGit()
    stageProductFile()
    rmSync(join(tasksDir, '_meta.yaml'))
    expect(runGuard().code).toBe(0)
  })

  it('hook de bout en bout : le VRAI commit est refusé sans ticket, accepté avec', () => {
    initGit()
    cpSync(join(repoRoot, 'scripts', 'githooks'), join(sandbox, 'scripts', 'githooks'), { recursive: true })
    gitSb('config', 'core.hooksPath', 'scripts/githooks')
    stageProductFile()
    const refused = spawnSync('git', ['commit', '-q', '-m', 'hors ticket'], { cwd: sandbox, encoding: 'utf8' })
    expect(refused.status).not.toBe(0)
    execFileSync('node', [scriptPath(), 'start', '1'], { encoding: 'utf8', env: sbEnv() })
    const accepted = spawnSync('git', ['commit', '-q', '-m', 'sous ticket'], { cwd: sandbox, encoding: 'utf8' })
    expect(accepted.status).toBe(0)
  })
})

describe('CLI — la KB load-bearing dans le cycle (#325)', () => {
  // Le graphe committé par Graphify (node-link NetworkX) : un nœud doc matchant
  // la ref du seed (#1 → docs/x.md) + un voisin code à 1 saut.
  const writeGraph = (extra = {}) => {
    mkdirSync(join(sandbox, 'graphify-out'), { recursive: true })
    writeFileSync(join(sandbox, 'graphify-out', 'graph.json'), JSON.stringify({
      directed: false, multigraph: false, graph: {},
      nodes: [
        { id: 'doc_x', label: 'Doc X', file_type: 'document', source_file: 'docs/x.md' },
        { id: 'roadmap_nextqueue', label: 'nextQueue', file_type: 'code', source_file: 'src/lib/roadmap.ts', source_location: 'L42' },
      ],
      links: [{ source: 'doc_x', target: 'roadmap_nextqueue', relation: 'cites', confidence: 'EXTRACTED', weight: 1 }],
      ...extra,
    }))
  }
  // Staleness = git du repo HÔTE : ces tests lancent le CLI avec cwd=sandbox
  // (sinon git() taperait le cwd de vitest, c.-à-d. le VRAI repo).
  const runHere = (args, env = {}) => {
    const r = spawnSync('node', [scriptPath(), ...args], { encoding: 'utf8', env: { ...sbEnv(), ...env }, cwd: sandbox })
    return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  const gitSb = (...args) => execFileSync('git', args, { cwd: sandbox, encoding: 'utf8' }).trim()
  const initGitWithCommits = (afterBuild) => {
    gitSb('init', '-q')
    gitSb('config', 'user.email', 'kb@test.local')
    gitSb('config', 'user.name', 'KB Test')
    gitSb('commit', '-q', '--allow-empty', '--no-verify', '-m', 'build point')
    const built = gitSb('rev-parse', 'HEAD')
    for (let i = 0; i < afterBuild; i++) gitSb('commit', '-q', '--allow-empty', '--no-verify', '-m', `after ${i}`)
    return built
  }

  it('brief SANS graphe → une ligne discrète « pas encore généré », jamais d’erreur', () => {
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/KB: graph not generated yet/)
    expect(r.stdout).toContain('/graphify .')
  })

  it('brief AVEC graphe → section « Knowledge base » embarquée : directs + voisins 1 saut, fichier:emplacement', () => {
    writeGraph()
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toContain('Knowledge base — what this task touches')
    expect(r.stdout).toMatch(/direct \(1\):/)
    expect(r.stdout).toContain('Doc X')
    expect(r.stdout).toMatch(/1 hop away \(1/)
    expect(r.stdout).toContain('src/lib/roadmap.ts:L42') // le voisin code, localisé
    expect(r.stdout).not.toMatch(/KB: graph not generated/)
  })

  it('take embarque la même section (la carte arrive SANS y penser)', () => {
    writeGraph()
    const r = runTask(['take'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#1 started/)
    expect(r.stdout).toContain('Knowledge base — what this task touches')
  })

  it('graphe présent mais refs sans nœud → section omise (pas de bruit, pas de nudge)', () => {
    writeGraph()
    runUpdate('--refs', 'ailleurs/inconnu.md')
    const r = runTask(['brief', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).not.toContain('Knowledge base —')
    expect(r.stdout).not.toMatch(/KB:/)
  })

  it('sitrep SANS graphe → LA ligne KB pousse la 1ʳᵉ génération', () => {
    const r = runTask(['sitrep'])
    expect(r.stdout).toMatch(/KB: graph not generated yet/)
  })

  it('sitrep AVEC graphe sans build commit → nb de nœuds + fraîcheur inconnue', () => {
    writeGraph()
    const r = runTask(['sitrep'])
    expect(r.stdout).toMatch(/KB: 2 nodes · freshness unknown/)
  })

  it('sitrep : graphe ≥10 commits derrière HEAD → ⚠ stale + --update', () => {
    const built = initGitWithCommits(12)
    writeGraph({ built_at_commit: built })
    const r = runHere(['sitrep'])
    expect(r.stdout).toMatch(/KB: 2 nodes · ⚠ stale \(built at \w{7}, 12 commits behind HEAD\)/)
  })

  it('sitrep : opt-out mémorisé (kb: false) → silence total sur la KB', () => {
    writeFileSync(join(sandbox, 'roadmapped.config.json'), JSON.stringify({ tasksDir, kb: false }))
    const r = runTask(['sitrep'])
    expect(r.code).toBe(0)
    expect(r.stdout).not.toMatch(/KB:/)
  })

  it('kb doctor : absent → exit 2 (scriptable)', () => {
    const r = runTask(['kb', 'doctor'])
    expect(r.code).toBe(2)
    expect(r.stdout).toMatch(/NOT generated/)
  })

  it('kb doctor : frais (build = HEAD) → exit 0', () => {
    const built = initGitWithCommits(0)
    writeGraph({ built_at_commit: built })
    const r = runHere(['kb', 'doctor'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/fresh — built at current HEAD/)
  })

  it('kb doctor : périmé → exit 3 ; le seuil --max-behind le requalifie', () => {
    const built = initGitWithCommits(12)
    writeGraph({ built_at_commit: built })
    const stale = runHere(['kb', 'doctor'])
    expect(stale.code).toBe(3)
    expect(stale.stdout).toMatch(/⚠ stale.*12 commits behind HEAD \(threshold 10\)/)
    const tolerant = runHere(['kb', 'doctor', '--max-behind', '20'])
    expect(tolerant.code).toBe(0)
    expect(tolerant.stdout).toMatch(/12 commit\(s\) behind HEAD \(threshold 20\)/)
  })

  it('done : graphe périmé → nudge refresh sur stderr, succès préservé', () => {
    const built = initGitWithCommits(11)
    writeGraph({ built_at_commit: built })
    runHere(['start', '1'])
    const r = runHere(['done', '1', '--outcome', 'livré'])
    expect(r.code).toBe(0)
    expect(r.stderr).toMatch(/KB graph is 11 commits behind/)
    expect(r.stderr).toContain('/graphify . --update')
  })

  it('done : sans graphe → aucun nudge KB', () => {
    runTask(['start', '1'])
    const r = runTask(['done', '1', '--outcome', 'livré'])
    expect(r.code).toBe(0)
    expect(r.stderr).not.toMatch(/KB graph/)
  })

  it.skipIf(process.platform === 'win32')('kb refresh : graphify introuvable → imprime la commande, exit 0 (jamais bloquant)', () => {
    const r = runHere(['kb', 'refresh'], { PATH: `${dirname(process.execPath)}:/usr/bin:/bin` })
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/graphify CLI not found/)
    expect(r.stdout).toContain('uv tool install graphifyy')
    expect(r.stdout).toContain('/graphify . --update')
  })

  it.skipIf(process.platform === 'win32')('kb refresh : invoque `<kb.graphifyBin> update` (code-only), --force transmis', () => {
    const fake = join(sandbox, 'fake-graphify')
    writeFileSync(fake, '#!/bin/sh\necho "$@" > "$(dirname "$0")/graphify-invoked.txt"\n')
    chmodSync(fake, 0o755)
    writeFileSync(join(sandbox, 'roadmapped.config.json'), JSON.stringify({ tasksDir, kb: { graphifyBin: fake } }))
    const r = runHere(['kb', 'refresh'])
    expect(r.code).toBe(0)
    expect(readFileSync(join(sandbox, 'graphify-invoked.txt'), 'utf8').trim()).toBe('update')
    const forced = runHere(['kb', 'refresh', '--force'])
    expect(forced.code).toBe(0)
    expect(readFileSync(join(sandbox, 'graphify-invoked.txt'), 'utf8').trim()).toBe('update --force')
  })
})

describe('CLI epic & jalons (#133)', () => {
  it('update --epic écrit epic et le YAML legacy migre (le champ milestone disparaît)', () => {
    runUpdate('--epic', 'refonte-graphe')
    const t = readTask()
    expect(t.epic).toBe('refonte-graphe')
    expect(t).not.toHaveProperty('milestone')
  })

  it('--milestone reste un alias déprécié de --epic (warning stderr, valeur appliquée)', () => {
    const r = runTask(['update', '1', '--milestone', 'socle'])
    expect(r.code).toBe(0)
    expect(r.stderr).toMatch(/deprecated/)
    expect(readTask().epic).toBe('socle')
  })

  it('update --epic null vide le champ', () => {
    runUpdate('--epic', 'socle')
    runUpdate('--epic', 'null')
    expect(readTask().epic).toBeNull()
  })

  it("add --kind milestone --blocks 1 crée le jalon ET l'ajoute aux dependsOn de #1", () => {
    const r = runTask(['add', '--type', SEC, '--title', 'Socle prêt', '--kind', 'milestone', '--blocks', '1'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/#2 now blocks: #1/)
    const jalon = load(readFileSync(join(tasksDir, SEC, '02-socle-pret.yaml'), 'utf8'))
    expect(jalon.kind).toBe('milestone')
    expect(readTask().dependsOn).toEqual([2]) // #1 dépend désormais du jalon #2
  })

  it('add --blocks refuse un id inexistant AVANT toute écriture (aucun jalon créé)', () => {
    const r = runTask(['add', '--type', SEC, '--title', 'Jalon', '--kind', 'milestone', '--blocks', '999'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/999/)
    expect(runTask(['show', '2']).code).not.toBe(0) // nextId non consommé
  })

  it('add --kind hors enum → erreur autoportante', () => {
    const r = runTask(['add', '--type', SEC, '--title', 'X', '--kind', 'mega'])
    expect(r.code).not.toBe(0)
    expect(r.stderr).toMatch(/--kind invalid/)
  })

  it("roadmap affiche l'avancement global puis les epics auto-découverts", () => {
    runUpdate('--epic', 'socle')
    const r = runTask(['roadmap'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/overall progress: 0\/1 \(0%\)/)
    expect(r.stdout).toMatch(/socle {2}0\/1/)
    expect(r.stdout).toMatch(/#1 Tâche/)
  })

  it('sitrep porte la ligne avancement (globalProgress)', () => {
    const r = runTask(['sitrep'])
    expect(r.code).toBe(0)
    expect(r.stdout).toMatch(/progress: 0\/1 \(0%\)/)
  })
})
