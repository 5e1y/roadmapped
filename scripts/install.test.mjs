import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import {
  ensureConfig, ensureSkeleton, ensureDevDependency, mergeMcpEntry, installGuardHook, ensureSessionHook, ensureClaudeMd, runInit, runUpgrade,
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
  it('pose tout, et un second passage ne change RIEN (snapshot identique)', () => {
    runInit({ hostRoot: host, packageDir: repoRoot, log: silent })
    expect(existsSync(join(host, 'roadmapped.config.json'))).toBe(true)
    expect(existsSync(join(host, 'docs', 'tasks', '_meta.yaml'))).toBe(true)
    expect(existsSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(host, '.mcp.json'))).toBe(true)
    expect(existsSync(join(host, '.git', 'hooks', 'pre-commit'))).toBe(true)
    const before = snapshot(host)
    runInit({ hostRoot: host, packageDir: repoRoot, log: silent })
    expect(snapshot(host)).toEqual(before)
  })

  it('ne réécrase jamais un backlog existant ni une config personnalisée', () => {
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'backlog', docsDir: 'docs' }))
    mkdirSync(join(host, 'backlog'), { recursive: true })
    writeFileSync(join(host, 'backlog', '_meta.yaml'), 'nextId: 99\n')
    runInit({ hostRoot: host, packageDir: repoRoot, log: silent })
    expect(readFileSync(join(host, 'backlog', '_meta.yaml'), 'utf8')).toBe('nextId: 99\n') // données intactes
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).tasksDir).toBe('backlog')
    expect(existsSync(join(host, 'backlog', '01-bug'))).toBe(false) // pas de squelette par-dessus
  })
})

describe('runUpgrade — additive, jamais destructive', () => {
  it('recopie skill/MCP/hook mais ne touche ni docs/tasks ni la config', () => {
    runInit({ hostRoot: host, packageDir: repoRoot, log: silent })
    // L'utilisateur travaille : il modifie sa config, son backlog, ET (à tort) le skill.
    writeFileSync(join(host, 'roadmapped.config.json'), JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'wiki' }))
    writeFileSync(join(host, 'docs', 'tasks', '_meta.yaml'), 'nextId: 7\n')
    writeFileSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'), 'version locale bricolée')
    runUpgrade({ hostRoot: host, packageDir: repoRoot, log: silent })
    // Données utilisateur : intactes.
    expect(JSON.parse(readFileSync(join(host, 'roadmapped.config.json'), 'utf8')).docsDir).toBe('wiki')
    expect(readFileSync(join(host, 'docs', 'tasks', '_meta.yaml'), 'utf8')).toBe('nextId: 7\n')
    // Fichier tool-owned : réécrasé par la version du paquet.
    expect(readFileSync(join(host, '.claude', 'skills', 'roadmapped', 'SKILL.md'), 'utf8')).not.toBe('version locale bricolée')
  })
})

// ------------------------------------------------------- le bug racine (#123)

/** Env hôte : on retire ROADMAPPED_ROOT pour tester la VRAIE résolution cwd → hôte. */
function hostEnv() {
  const env = { ...process.env }
  delete env.ROADMAPPED_ROOT
  return env
}

describe('dispatcher bin/roadmapped.mjs — un repo hôte lit SES tâches, pas celles de l’install (#123)', () => {
  it('init depuis l’hôte puis add/list : la tâche vit chez l’HÔTE, le backlog du paquet est intact', () => {
    const metaBefore = readFileSync(join(repoRoot, 'docs', 'tasks', '_meta.yaml'), 'utf8')
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
