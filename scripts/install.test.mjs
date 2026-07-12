import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { load } from 'js-yaml'
import {
  ensureConfig, ensureSkeleton, ensureDevDependency, mergeMcpEntry, mergeMcpServer, installGuardHook, ensureSessionHook, ensureClaudeMd, ensureGraphify, runInit, runUpgrade,
} from './install.mjs'

// Tout se joue dans un repo HÔTE jetable — jamais le repo réel. On teste :
//   - chaque étape de plomberie (config, squelette, devDep, MCP, hook CHAÎNÉ)
//   - l'idempotence de `init` (relancer ne change rien, ne réécrase jamais des données)
//   - le bug racine #123 : le bin lancé depuis un hôte lit les tâches de l'HÔTE,
//     pas celles de l'install (dispatcher bout-en-bout, en sous-processus).

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const binPath = join(repoRoot, 'bin', 'roadmapped.mjs')

let host
const silent = () => {}

// Étape KB hermétique pour les tests d'orchestration : aucun binaire réel
// (python/uv/pipx) sondé ni installé, download coupé (pas de bootstrap uv réel),
// env neutre (le CI ambiant ne change pas le scénario) — « rien qui installe
// graphifyy ni uv pour de vrai » (#322/#324).
const kbOff = { exec: () => null, fetchImpl: async () => { throw new Error('offline') }, env: {} }

beforeEach(() => {
  host = mkdtempSync(join(tmpdir(), 'roadmapped-host-'))
  execFileSync('git', ['init', '-q'], { cwd: host })
})
afterEach(() => rmSync(host, { recursive: true, force: true }))

/** Photographie récursive { chemin relatif → contenu } d'un dossier (hors .git). */
function snapshot(dir, base = dir) {
  const out = {}
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) Object.assign(out, snapshot(p, base))
    else out[p.slice(base.length + 1)] = readFileSync(p, 'utf8')
  }
  return out
}

describe('ensureSessionHook (#122)', () => {
  const cmd = 'node scripts/task.mjs sitrep'
  const read = () => JSON.parse(readFileSync(join(host, '.claude', 'settings.json'), 'utf8'))

  it('pose un hook SessionStart qui lance sitrep (settings.json créé)', () => {
    ensureSessionHook(host, cmd, silent)
    const j = read()
    expect(j.hooks.SessionStart).toHaveLength(1)
    expect(j.hooks.SessionStart[0].hooks[0]).toEqual({ type: 'command', command: cmd })
  })

  it('idempotent : relancer ne duplique pas notre entrée', () => {
    ensureSessionHook(host, cmd, silent)
    ensureSessionHook(host, cmd, silent)
    expect(read().hooks.SessionStart).toHaveLength(1)
  })

  it('préserve les autres hooks SessionStart et les autres réglages', () => {
    mkdirSync(join(host, '.claude'), { recursive: true })
    writeFileSync(join(host, '.claude', 'settings.json'), JSON.stringify({
      model: 'opus',
      hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo autre' }] }] },
    }))
    ensureSessionHook(host, cmd, silent)
    const j = read()
    expect(j.model).toBe('opus') // réglage voisin intact
    expect(j.hooks.SessionStart).toHaveLength(2) // l'autre hook + le nôtre
    expect(j.hooks.SessionStart.some((g) => g.hooks[0].command === 'echo autre')).toBe(true)
  })

  it('settings.json illisible → laissé intact, étape sautée', () => {
    mkdirSync(join(host, '.claude'), { recursive: true })
    writeFileSync(join(host, '.claude', 'settings.json'), '{ pas du json')
    expect(ensureSessionHook(host, cmd, silent)).toBe(false)
    expect(readFileSync(join(host, '.claude', 'settings.json'), 'utf8')).toBe('{ pas du json')
  })
})

describe('ensureClaudeMd (#153)', () => {
  const read = () => readFileSync(join(host, 'CLAUDE.md'), 'utf8')

  it('crée CLAUDE.md avec le bloc roadmapped (consigne dashboard)', () => {
    ensureClaudeMd(host, silent)
    const md = read()
    expect(md).toContain('<!-- >>> roadmapped >>> -->')
    expect(md).toContain('npx roadmapped dashboard')
    expect(md).toContain('<!-- <<< roadmapped <<< -->')
  })

  it('idempotent : relancer ne duplique pas le bloc', () => {
    ensureClaudeMd(host, silent)
    ensureClaudeMd(host, silent)
    const md = read()
    expect(md.match(/>>> roadmapped >>>/g)).toHaveLength(1)
  })

  it('préserve un CLAUDE.md existant, ajoute le bloc à la suite', () => {
    writeFileSync(join(host, 'CLAUDE.md'), '# Mon projet\n\nRègles maison.\n')
    ensureClaudeMd(host, silent)
    const md = read()
    expect(md).toContain('# Mon projet') // contenu utilisateur intact
    expect(md).toContain('Règles maison.')
    expect(md).toContain('<!-- >>> roadmapped >>> -->') // + bloc ajouté
  })
})

describe('ensureConfig', () => {
  it('pose roadmapped.config.json avec les défauts hôte (docs/tasks, docs)', () => {
    ensureConfig(host, silent)
    const cfg = JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8'))
    expect(cfg).toEqual({ tasksDir: 'docs/tasks', docsDir: 'docs' })
  })

  it('ne réécrase pas une config existante (même personnalisée)', () => {
    writeFileSync(join(host, 'roadmapped.config.json'), '{"tasksDir":"backlog"}')
    ensureConfig(host, silent)
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8'))).toEqual({ tasksDir: 'backlog' })
  })

  it('rétrocompat : un roadmaped.config.json (un p) est respecté, pas doublonné', () => {
    writeFileSync(join(host, 'roadmaped.config.json'), '{}')
    ensureConfig(host, silent)
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(false)
  })
})

describe('ensureSkeleton', () => {
  it('crée _meta.yaml (nextId: 1) + les 9 types canoniques, et validate passe', () => {
    const tasksDir = join(host, 'docs', 'tasks')
    expect(ensureSkeleton(tasksDir, silent)).toBe(true)
    expect(load(readFileSync(join(tasksDir, '_meta.yaml'), 'utf8'))).toEqual({ nextId: 1 })
    const stages = readdirSync(tasksDir).filter((n) => n !== '_meta.yaml').sort()
    expect(stages).toEqual(['01-bug', '02-feature', '03-chore', '04-brainstorm', '05-design', '06-marketing', '07-communication', '08-legal', '09-business'])
    const section = load(readFileSync(join(tasksDir, '01-bug', '_section.yaml'), 'utf8'))
    expect(section.title).toBe('Bugs')
    expect(section.status).toBe('open')
    // La validation STRICTE du vrai CLI passe sur le squelette vide.
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'docs' }))
    const r = spawnSync('node', [binPath, 'validate'], { cwd: host, encoding: 'utf8', env: hostEnv() })
    expect(r.status).toBe(0)
  })

  it('ne touche JAMAIS un docs/tasks déjà peuplé (_meta.yaml présent)', () => {
    const tasksDir = join(host, 'docs', 'tasks')
    mkdirSync(tasksDir, { recursive: true })
    writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 42\n')
    expect(ensureSkeleton(tasksDir, silent)).toBe(false)
    expect(readFileSync(join(tasksDir, '_meta.yaml'), 'utf8')).toBe('nextId: 42\n')
    expect(existsSync(join(tasksDir, '01-bug'))).toBe(false) // rien semé par-dessus
  })
})

describe('ensureDevDependency', () => {
  it('ajoute roadmapped en devDependency du package.json hôte', () => {
    writeFileSync(join(host, 'package.json'), JSON.stringify({ name: 'hote', devDependencies: { x: '1.0.0' } }))
    expect(ensureDevDependency(host, repoRoot, silent)).toBe(true)
    const pkg = JSON.parse(readFileSync(join(host, 'package.json'), 'utf8'))
    expect(pkg.devDependencies.x).toBe('1.0.0') // préservé
    // Sourcé depuis GitHub (dérivé du champ repository), pas le registre npm (#199).
    expect(pkg.devDependencies.roadmapped).toMatch(/^github:[^/]+\/roadmapped$/)
  })

  it('sans package.json hôte : étape sautée, rien de créé', () => {
    expect(ensureDevDependency(host, repoRoot, silent)).toBe(false)
    expect(existsSync(join(host, 'package.json'))).toBe(false)
  })

  it('déjà déclaré → pas de réécriture', () => {
    writeFileSync(join(host, 'package.json'), JSON.stringify({ devDependencies: { roadmapped: 'file:../x' } }))
    expect(ensureDevDependency(host, repoRoot, silent)).toBe(false)
    expect(JSON.parse(readFileSync(join(host, 'package.json'), 'utf8')).devDependencies.roadmapped).toBe('file:../x')
  })
})

describe('mergeMcpEntry', () => {
  it('fusionne sans clobber les serveurs existants', () => {
    writeFileSync(join(host, '.mcp.json'), JSON.stringify({ mcpServers: { autre: { command: 'python', args: ['s.py'] } } }))
    mergeMcpEntry(host, ['node_modules/roadmapped/scripts/mcp-server.mjs'], silent)
    const json = JSON.parse(readFileSync(join(host, '.mcp.json'), 'utf8'))
    expect(json.mcpServers.autre).toEqual({ command: 'python', args: ['s.py'] })
    expect(json.mcpServers.roadmapped).toEqual({ command: 'node', args: ['node_modules/roadmapped/scripts/mcp-server.mjs'] })
  })

  it('un .mcp.json illisible est laissé INTACT (pas de clobber silencieux)', () => {
    writeFileSync(join(host, '.mcp.json'), '{pas du json')
    expect(mergeMcpEntry(host, ['x.mjs'], silent)).toBe(false)
    expect(readFileSync(join(host, '.mcp.json'), 'utf8')).toBe('{pas du json')
  })
})

describe('installGuardHook — CHAÎNAGE, jamais de clobber (décision verrouillée)', () => {
  const guardCmd = 'node node_modules/roadmapped/scripts/task.mjs guard'

  it('sans hook existant : crée .git/hooks/pre-commit exécutable avec le bloc guard', () => {
    const target = installGuardHook(host, guardCmd, silent)
    expect(target).toBe(join(host, '.git', 'hooks', 'pre-commit'))
    const content = readFileSync(target, 'utf8')
    expect(content).toContain('#!/bin/sh')
    expect(content).toContain(guardCmd)
    expect(statSync(target).mode & 0o111).toBeTruthy() // exécutable
  })

  it('hook pre-commit existant : PRÉSERVÉ, guard ajouté à la suite', () => {
    const target = join(host, '.git', 'hooks', 'pre-commit')
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, '#!/bin/sh\necho "hook maison"\n')
    installGuardHook(host, guardCmd, silent)
    const content = readFileSync(target, 'utf8')
    expect(content).toContain('echo "hook maison"') // l'existant survit
    expect(content.indexOf('hook maison')).toBeLessThan(content.indexOf(guardCmd)) // guard chaîné APRÈS
  })

  it('idempotent : relancer ne duplique pas le bloc guard', () => {
    installGuardHook(host, guardCmd, silent)
    installGuardHook(host, guardCmd, silent)
    const content = readFileSync(join(host, '.git', 'hooks', 'pre-commit'), 'utf8')
    expect(content.split(guardCmd).length - 1).toBe(1) // une seule occurrence
  })

  it('core.hooksPath occupé : chaîne dans CE dossier, ne modifie JAMAIS core.hooksPath', () => {
    mkdirSync(join(host, '.hooks'))
    writeFileSync(join(host, '.hooks', 'pre-commit'), '#!/bin/sh\nlefthook run pre-commit\n')
    execFileSync('git', ['config', 'core.hooksPath', '.hooks'], { cwd: host })
    const target = installGuardHook(host, guardCmd, silent)
    expect(target).toBe(join(host, '.hooks', 'pre-commit'))
    const content = readFileSync(target, 'utf8')
    expect(content).toContain('lefthook run pre-commit')
    expect(content).toContain(guardCmd)
    const hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { cwd: host, encoding: 'utf8' }).trim()
    expect(hooksPath).toBe('.hooks') // intact
  })

  it('husky détecté : le guard va dans .husky/pre-commit (pas dans _/)', () => {
    mkdirSync(join(host, '.husky'))
    writeFileSync(join(host, '.husky', 'pre-commit'), 'npm test\n')
    execFileSync('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: host })
    const target = installGuardHook(host, guardCmd, silent)
    expect(target).toBe(join(host, '.husky', 'pre-commit'))
    const content = readFileSync(target, 'utf8')
    expect(content).toContain('npm test')
    expect(content).toContain(guardCmd)
  })

  it('hôte sans .git : étape sautée proprement', () => {
    const bare = mkdtempSync(join(tmpdir(), 'roadmapped-nogit-'))
    try {
      expect(installGuardHook(bare, guardCmd, silent)).toBeNull()
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})

describe('runInit — orchestration idempotente', () => {
  // #240 : init exige un package.json hôte (sinon MCP/hooks pointeraient dans le vide).
  beforeEach(() => writeFileSync(join(host, 'package.json'), '{"name":"host","private":true}\n'))

  it('sans package.json hôte : ABANDONNE avant d\'écrire quoi que ce soit de câblé (#240)', async () => {
    rmSync(join(host, 'package.json'))
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    expect(existsSync(join(host, '.mcp.json'))).toBe(false) // pas de wiring cassé
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(false) // abandon total, rien créé
  })

  it('pose tout, et un second passage ne change RIEN (snapshot identique)', async () => {
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(true)
    expect(existsSync(join(host, 'docs', 'tasks', '_meta.yaml'))).toBe(true)
    expect(existsSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(host, '.mcp.json'))).toBe(true)
    expect(existsSync(join(host, '.git', 'hooks', 'pre-commit'))).toBe(true)
    const before = snapshot(host)
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    expect(snapshot(host)).toEqual(before)
  })

  it('ne réécrase jamais un backlog existant ni une config personnalisée', async () => {
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'backlog', docsDir: 'docs' }))
    mkdirSync(join(host, 'backlog'), { recursive: true })
    writeFileSync(join(host, 'backlog', '_meta.yaml'), 'nextId: 99\n')
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    expect(readFileSync(join(host, 'backlog', '_meta.yaml'), 'utf8')).toBe('nextId: 99\n') // données intactes
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).tasksDir).toBe('backlog')
    expect(existsSync(join(host, 'backlog', '01-bug'))).toBe(false) // pas de squelette par-dessus
  })

  it('#324 : tous les étages KB échouent (offline, aucun binaire) → « failed » mémorisé, l\'init RÉUSSIT et pose tout le reste', async () => {
    const logs = []
    // exec: () => null + fetch coupé = aucun binaire ne répond, pas de bootstrap uv.
    await runInit({ hostRoot: host, packageDir: repoRoot, log: (m) => logs.push(m), kb: kbOff })
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(true)
    expect(existsSync(join(host, 'docs', 'tasks', '_meta.yaml'))).toBe(true)
    expect(existsSync(join(host, '.mcp.json'))).toBe(true)
    expect(existsSync(join(host, '.claude', 'settings.json'))).toBe(true)
    expect(existsSync(join(host, '.git', 'hooks', 'pre-commit'))).toBe(true)
    const out = logs.join('\n')
    expect(out).toContain('roadmapped upgrade') // comment réessayer, pas d'erreur
    expect(out).toContain('init done') // l'init va au bout
    // Échec mémorisé (upgrade re-tentera), mais AUCUNE entrée MCP graphify morte.
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).kb).toEqual({ status: 'failed' })
    expect(JSON.parse(readFileSync(join(host, '.mcp.json'), 'utf8')).mcpServers.graphify).toBeUndefined()
    expect(existsSync(join(host, '.gitignore'))).toBe(false) // l'étape KB ne touche pas au .gitignore
  })

  it('#324 : `--no-kb` → opt-out mémorisé (kb: false), init réussi, rien tenté', async () => {
    const logs = []
    await runInit({ hostRoot: host, packageDir: repoRoot, log: (m) => logs.push(m), noKb: true, kb: kbOff })
    expect(logs.join('\n')).toContain('init done')
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).kb).toBe(false)
    expect(JSON.parse(readFileSync(join(host, '.mcp.json'), 'utf8')).mcpServers.graphify).toBeUndefined()
  })

  it('#322 : même un crash interne de l\'étape KB ne fait pas échouer l\'init', async () => {
    const logs = []
    await runInit({
      hostRoot: host, packageDir: repoRoot, log: (m) => logs.push(m),
      kb: { exec: () => { throw new Error('boom') }, env: {} },
    })
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(true)
    expect(logs.join('\n')).toContain('init done')
  })
})

describe('runUpgrade — additive, jamais destructive', () => {
  beforeEach(() => writeFileSync(join(host, 'package.json'), '{"name":"host","private":true}\n')) // #240
  it('recopie skill/MCP/hook mais ne touche ni docs/tasks ni la config', async () => {
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    // L'utilisateur travaille : il modifie sa config, son backlog, ET (à tort) le skill.
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'wiki' }))
    writeFileSync(join(host, 'docs', 'tasks', '_meta.yaml'), 'nextId: 7\n')
    writeFileSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'), 'version locale bricolée')
    await runUpgrade({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    // Données utilisateur : intactes.
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).docsDir).toBe('wiki')
    expect(readFileSync(join(host, 'docs', 'tasks', '_meta.yaml'), 'utf8')).toBe('nextId: 7\n')
    // Fichier tool-owned : réécrasé par la version du paquet.
    expect(readFileSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'), 'utf8')).not.toBe('version locale bricolée')
  })

  it('#324 : upgrade RE-TENTE l\'étape KB (re-détection) sans rien casser', async () => {
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, kb: kbOff })
    const before = snapshot(host)
    const logs = []
    await runUpgrade({ hostRoot: host, packageDir: repoRoot, log: (m) => logs.push(m), kb: kbOff })
    const out = logs.join('\n')
    expect(out).toContain('installation de la knowledge base') // le défaut a bien été re-tenté
    expect(out).toContain('upgrade done')
    expect(snapshot(host)).toEqual(before) // rien détruit, rien écrit en plus (kb: failed déjà mémorisé)
  })

  it('#324 : kb: false mémorisé (opt-out) → upgrade RESPECTE le refus, aucune tentative', async () => {
    await runInit({ hostRoot: host, packageDir: repoRoot, log: silent, noKb: true, kb: kbOff })
    const before = snapshot(host)
    const logs = []
    let attempts = 0
    await runUpgrade({
      hostRoot: host, packageDir: repoRoot, log: (m) => logs.push(m),
      kb: { ...kbOff, exec: () => { attempts += 1; return null } },
    })
    expect(attempts).toBe(0) // aucun binaire sondé : le refus est un état, pas un prompt répété
    expect(logs.join('\n')).toContain('kb: false')
    expect(snapshot(host)).toEqual(before)
  })
})

describe('ensureGraphify (#324) — installée PAR DÉFAUT, opt-out mémorisé, JAMAIS bloquante', () => {
  // Faux exec : table « commande → stdout » ; tout le reste échoue (null).
  // AUCUN binaire réel n'est lancé, rien n'installe graphifyy ni uv pour de vrai.
  const fakeExec = (table, calls = []) => (cmd, args = []) => {
    const key = [cmd, ...args].join(' ')
    calls.push(key)
    return key in table ? table[key] : null
  }
  const offline = async () => { throw new Error('offline') }
  const base = { fetchImpl: offline, env: {} } // pas de réseau, env neutre (CI ambiant ignoré)
  const WHICH = process.platform === 'win32' ? 'where' : 'which'
  const BIN = process.platform === 'win32' ? 'Scripts' : 'bin'
  const EXE = process.platform === 'win32' ? '.exe' : ''
  const readCfg = () => JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8'))
  const readMcp = () => JSON.parse(readFileSync(join(host, '.mcp.json'), 'utf8'))

  it('DÉFAUT : installe SANS prompt via uv, mémorise les chemins ABSOLUS sous kb, pose l\'entrée MCP graphify', async () => {
    const toolsDir = join(host, 'uv-tools')
    const pythonBin = join(toolsDir, 'graphifyy', BIN, `python${EXE}`)
    const graphifyBin = join(toolsDir, 'graphifyy', BIN, `graphify${EXE}`)
    const calls = []
    const logs = []
    const r = await ensureGraphify(host, {
      ...base,
      exec: fakeExec({
        'uv --version': 'uv 0.11.28',
        [`${WHICH} uv`]: '/opt/tools/bin/uv\n',
        '/opt/tools/bin/uv tool install graphifyy': '',
        '/opt/tools/bin/uv tool dir': `${toolsDir}\n`,
        [`${graphifyBin} install`]: 'ok',
        [`${graphifyBin} claude install`]: 'ok',
      }, calls),
    }, (m) => logs.push(m))
    expect(r).toBe('installed')
    const out = logs.join('\n')
    expect(out).toContain('installation de la knowledge base') // on INFORME…
    expect(out).toContain('--no-kb') // …et on dit comment refuser (opt-out, plus de prompt)
    expect(calls).toContain('/opt/tools/bin/uv tool install graphifyy')
    expect(calls).not.toContain('pipx install graphifyy') // uv a suffi
    // Chemins ABSOLUS mémorisés en config sous kb — jamais dépendants du PATH.
    const kb = readCfg().kb
    expect(kb).toEqual({ status: 'installed', uvBin: '/opt/tools/bin/uv', pythonBin, graphifyBin })
    // graphify install + claude install best-effort, via le binaire mémorisé.
    expect(calls).toContain(`${graphifyBin} install`)
    expect(calls).toContain(`${graphifyBin} claude install`)
    // Entrée MCP NATIVE graphify (python -m graphify.serve, stdio) posée.
    expect(readMcp().mcpServers.graphify).toEqual({ command: pythonBin, args: ['-m', 'graphify.serve'] })
    expect(out).toContain('/graphify .') // la génération reste un acte d'agent
    expect(existsSync(join(host, '.gitignore'))).toBe(false) // jamais touché
  })

  it('--no-kb : opt-out MÉMORISÉ (kb: false), aucune tentative, aucune entrée MCP', async () => {
    const calls = []
    const r = await ensureGraphify(host, { ...base, noKb: true, exec: fakeExec({}, calls) }, silent)
    expect(r).toBe('declined')
    expect(readCfg().kb).toBe(false)
    expect(calls).toHaveLength(0) // rien sondé, rien installé
    expect(existsSync(join(host, '.mcp.json'))).toBe(false)
  })

  it('kb: false déjà en config : refus respecté, aucune tentative (le refus est un état, pas un prompt)', async () => {
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', kb: false }))
    const calls = []
    const r = await ensureGraphify(host, { ...base, exec: fakeExec({}, calls) }, silent)
    expect(r).toBe('declined')
    expect(calls).toHaveLength(0)
    expect(readCfg()).toEqual({ tasksDir: 'docs/tasks', kb: false }) // config intacte
  })

  it('CI : skip SILENCIEUX — rien tenté, rien écrit, rien loggé', async () => {
    const calls = []
    const logs = []
    const r = await ensureGraphify(host, { ...base, env: { CI: 'true' }, exec: fakeExec({}, calls) }, (m) => logs.push(m))
    expect(r).toBe('skipped')
    expect(calls).toHaveLength(0)
    expect(logs).toHaveLength(0)
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(false)
  })

  it('idempotence : déjà installé (chemins mémorisés) → « déjà installé », aucune install, PAS de 2e entrée MCP', async () => {
    // Entrée roadmapped préexistante : le merge graphify ne doit pas la clobber.
    writeFileSync(join(host, '.mcp.json'), JSON.stringify({ mcpServers: { roadmapped: { command: 'node', args: ['x.mjs'] } } }))
    const pythonBin = join(host, 'py', BIN, `python${EXE}`)
    const graphifyBin = join(host, 'py', BIN, `graphify${EXE}`)
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ kb: { status: 'installed', pythonBin, graphifyBin } }))
    const calls = []
    const logs = []
    for (let i = 0; i < 2; i += 1) { // deux passages (init puis upgrade) : même état final
      const r = await ensureGraphify(host, {
        ...base,
        exec: fakeExec({ [`${graphifyBin} --version`]: 'graphify 0.9.13' }, calls),
      }, (m) => logs.push(m))
      expect(r).toBe('already')
    }
    expect(logs.join('\n')).toContain('déjà installé')
    expect(calls.some((c) => c.includes('install'))).toBe(false) // aucune réinstall
    const servers = readMcp().mcpServers
    expect(servers.roadmapped).toEqual({ command: 'node', args: ['x.mjs'] }) // préservée
    expect(servers.graphify).toEqual({ command: pythonBin, args: ['-m', 'graphify.serve'] })
    expect(Object.keys(servers)).toEqual(['roadmapped', 'graphify']) // une seule entrée graphify
  })

  it('uv ABSENT : bootstrap depuis l\'asset GitHub épinglé (download MOCKÉ, checksum vérifié), puis uv tool install', async () => {
    // Archive minuscule fabriquée localement (vrai tar, zéro réseau) qui imite
    // la vraie : le binaire sous un dossier uv-<target>/.
    const stage = join(host, '.uv-stage')
    mkdirSync(join(stage, 'uv-fake'), { recursive: true })
    writeFileSync(join(stage, 'uv-fake', `uv${EXE}`), '#!/bin/sh\nexit 0\n')
    const archivePath = join(host, 'uv-archive.tgz')
    execFileSync('tar', ['-czf', archivePath, '-C', stage, 'uv-fake'])
    const bytes = readFileSync(archivePath)
    const sha = createHash('sha256').update(bytes).digest('hex')
    const urls = []
    const fetchImpl = async (url) => {
      urls.push(String(url))
      return { ok: true, arrayBuffer: async () => (String(url).endsWith('.sha256') ? Buffer.from(`${sha}  uv-asset\n`) : bytes) }
    }
    const uvDir = join(host, '.roadmapped-bin') // ~/.roadmapped/bin simulé, PAS le vrai home
    const uvBin = join(uvDir, `uv${EXE}`)
    const toolsDir = join(host, 'uv-tools')
    const calls = []
    const logs = []
    const mocked = fakeExec({
      [`${uvBin} tool install graphifyy`]: '',
      [`${uvBin} tool dir`]: `${toolsDir}\n`,
    }, calls)
    // tar passe en VRAI (extraction locale de notre archive de test), le reste est mocké.
    const exec = (cmd, args, o) => {
      if (cmd !== 'tar') return mocked(cmd, args, o)
      try { return execFileSync(cmd, args, { encoding: 'utf8' }) } catch { return null }
    }
    const r = await ensureGraphify(host, { ...base, fetchImpl, exec, uvDir }, (m) => logs.push(m))
    expect(r).toBe('installed')
    // Asset épinglé de la plateforme courante + son .sha256, PAS de curl|sh.
    expect(urls.some((u) => u.includes('github.com/astral-sh/uv/releases/download/'))).toBe(true)
    expect(urls.some((u) => u.endsWith('.sha256'))).toBe(true)
    expect(existsSync(uvBin)).toBe(true) // le binaire uv posé dans le bin dédié
    expect(calls).toContain(`${uvBin} tool install graphifyy`) // puis l'étage 1 avec CE binaire
    const kb = readCfg().kb
    expect(kb.status).toBe('installed')
    expect(kb.uvBin).toBe(uvBin) // chemin absolu mémorisé
    expect(readMcp().mcpServers.graphify.command).toBe(join(toolsDir, 'graphifyy', BIN, `python${EXE}`))
    expect(logs.join('\n')).toContain('checksum')
  })

  it('fallback venv : ni uv (offline) ni pipx → venv dédié, chemins sous kb, entrée MCP via kb.pythonBin', async () => {
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'docs' }))
    const venvDir = join(host, '.roadmapped-py') // venv de TEST, pas le ~/.roadmapped réel
    const venvPython = join(venvDir, BIN, `python${EXE}`)
    const r = await ensureGraphify(host, {
      ...base, venvDir,
      exec: fakeExec({
        'python3 --version': 'Python 3.12.1', // ni uv ni pipx → repli venv
        [`python3 -m venv ${venvDir}`]: '',
        [`${venvPython} -m pip install graphifyy`]: '',
      }),
    }, silent)
    expect(r).toBe('installed')
    const cfg = readCfg()
    expect(cfg.kb.pythonBin).toBe(venvPython) // kb/doctor retrouvera l'interpréteur
    expect(cfg.kb.graphifyBin).toBe(join(venvDir, BIN, `graphify${EXE}`))
    expect(cfg.tasksDir).toBe('docs/tasks') // merge non destructif
    expect(readMcp().mcpServers.graphify).toEqual({ command: venvPython, args: ['-m', 'graphify.serve'] })
  })

  it('TOUT échoue (offline, Python trop vieux) : « failed » mémorisé, PAS d\'entrée MCP graphify morte', async () => {
    const logs = []
    const r = await ensureGraphify(host, {
      ...base,
      exec: fakeExec({ 'python3 --version': 'Python 3.9.18' }), // trop vieux pour le venv
    }, (m) => logs.push(m))
    expect(r).toBe('failed')
    expect(readCfg().kb).toEqual({ status: 'failed' }) // upgrade re-tentera
    expect(existsSync(join(host, '.mcp.json'))).toBe(false) // aucune entrée MCP morte
    expect(logs.join('\n')).toContain('roadmapped upgrade') // comment réessayer
  })
})

describe('mergeMcpServer (#324) — générique, idempotent, non destructif', () => {
  it('pose deux entrées côte à côte sans clobber, et ne réécrit pas une entrée identique', () => {
    mergeMcpServer(host, 'roadmapped', { command: 'node', args: ['mcp.mjs'] }, silent)
    mergeMcpServer(host, 'graphify', { command: '/py/bin/python', args: ['-m', 'graphify.serve'] }, silent)
    const before = readFileSync(join(host, '.mcp.json'), 'utf8')
    mergeMcpServer(host, 'graphify', { command: '/py/bin/python', args: ['-m', 'graphify.serve'] }, silent)
    expect(readFileSync(join(host, '.mcp.json'), 'utf8')).toBe(before) // idempotent : pas de réécriture
    const json = JSON.parse(before)
    expect(json.mcpServers.roadmapped).toEqual({ command: 'node', args: ['mcp.mjs'] })
    expect(json.mcpServers.graphify).toEqual({ command: '/py/bin/python', args: ['-m', 'graphify.serve'] })
  })
})

// ------------------------------------------------------- le bug racine (#123)

/** Env hôte : on retire ROADMAPPED_ROOT pour tester la VRAIE résolution cwd → hôte.
 *  CI=1 : l'init RÉEL en sous-processus ne doit jamais installer la KB (défaut
 *  #324 = installe — le skip CI est justement le garde-fou prévu pour ça). */
function hostEnv() {
  const env = { ...process.env, CI: '1' }
  delete env.ROADMAPPED_ROOT
  return env
}

describe('dispatcher bin/roadmapped.mjs — un repo hôte lit SES tâches, pas celles de l’install (#123)', () => {
  it('init depuis l’hôte puis add/list : la tâche vit chez l’HÔTE, le backlog du paquet est intact', () => {
    const metaBefore = readFileSync(join(repoRoot, 'docs', 'tasks', '_meta.yaml'), 'utf8')
    writeFileSync(join(host, 'package.json'), '{"name":"host","private":true}\n') // #240 : init l'exige
    // Le "paquet installé" = ce repo ; le bin est lancé avec cwd = repo hôte vierge.
    let r = spawnSync('node', [binPath, 'init'], { cwd: host, encoding: 'utf8', env: hostEnv() })
    expect(r.status).toBe(0)
    r = spawnSync('node', [binPath, 'add', '--type', '02-feature', '--title', 'Tâche hôte', '--json'],
      { cwd: host, encoding: 'utf8', env: hostEnv() })
    expect(r.status).toBe(0)
    expect(JSON.parse(r.stdout).id).toBe(1) // nextId de l'HÔTE (1), pas celui de l'install (140+)
    expect(existsSync(join(host, 'docs', 'tasks', '02-feature', '01-tache-hote.yaml'))).toBe(true)
    // list ne voit QUE le backlog hôte.
    r = spawnSync('node', [binPath, 'list', '--json'], { cwd: host, encoding: 'utf8', env: hostEnv() })
    const ids = JSON.parse(r.stdout).map((t) => t.id)
    expect(ids).toEqual([1])
    // Non-régression dogfooding : le backlog du paquet n'a pas bougé.
    expect(readFileSync(join(repoRoot, 'docs', 'tasks', '_meta.yaml'), 'utf8')).toBe(metaBefore)
  })

  it('node trop vieux simulé : hors périmètre (strip-types requis) — le proxy transmet le code de sortie', () => {
    const r = spawnSync('node', [binPath, 'show', '999'], { cwd: host, encoding: 'utf8', env: hostEnv() })
    expect(r.status).not.toBe(0) // pas de tâche #999 dans un hôte vierge (et pas de crash)
  })
})
