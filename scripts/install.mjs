#!/usr/bin/env node
// Install plumbing inside a HOST repo (spec 2026-07-08-distribution, §3-4).
// `roadmapped init`   : config + 9-type skeleton + skill + MCP entry + guard hook
//                       + Knowledge base Graphify (OPT-IN, jamais bloquante, #322).
// `roadmapped upgrade`: re-copies the TOOL-OWNED files (skill, MCP, hook) — NEVER
//                       touches docs/tasks/ or roadmapped.config.json — and
//                       re-tente l'étape Knowledge base (idempotente).
//
// Idempotent by construction: each step detects what already exists and never
// overwrites user data. The CONTENT of init (questionnaire, migration, first
// tasks) belongs to the skill / #121 — here only deterministic plumbing.
//
// Node >= 22.18 (.ts imports via native strip-types) — checked by bin/roadmapped.mjs.

import {
  existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync,
} from 'node:fs'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { TYPES } from '../src/lib/tasks.ts'
import { findHostRoot, packageRoot, loadPathsAt } from '../src/lib/paths.ts'

const GUARD_START = '# >>> roadmapped guard >>>'
const GUARD_END = '# <<< roadmapped guard <<<'

const CLAUDE_START = '<!-- >>> roadmapped >>> -->'
const CLAUDE_END = '<!-- <<< roadmapped <<< -->'
const CLAUDE_BLOCK = `${CLAUDE_START}
## Roadmapped

This repo uses **Roadmapped** (flat-file project management, agent-driven).

- **At session start**: if the Roadmapped dashboard is not already open, run
  \`npx roadmapped dashboard\` (idempotent — no-op if it's already running, otherwise opens the browser).
- Every task creation/update goes through the roadmapped skill or \`npx roadmapped <cmd>\`
  (never edit the YAML files under \`docs/tasks/\` by hand).
${CLAUDE_END}`

const CONFIG_NAMES = ['roadmapped.config.json', 'roadmaped.config.json'] // back-compat with an old typo

// ------------------------------------------------------------------ steps (testable)

/** Writes roadmapped.config.json at the host root — only if it doesn't exist under
 *  either spelling (back-compat: an existing roadmaped.config.json is respected). */
export function ensureConfig(hostRoot, log = () => {}) {
  const existing = CONFIG_NAMES.map((n) => join(hostRoot, n)).find(existsSync)
  if (existing) {
    log(`config: ${existing} already present — kept as-is.`)
    return existing
  }
  const file = join(hostRoot, 'roadmapped.config.json')
  writeFileSync(file, `${JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'docs' }, null, 2)}\n`)
  log(`config: ${file} created (tasksDir=docs/tasks, docsDir=docs).`)
  return file
}

/** Backlog skeleton: _meta.yaml (nextId: 1) + the 9 canonical empty types.
 *  If _meta.yaml exists, the backlog is already initialized → we touch NOTHING. */
export function ensureSkeleton(tasksDir, log = () => {}) {
  if (existsSync(join(tasksDir, '_meta.yaml'))) {
    log(`skeleton: ${tasksDir} already initialized (_meta.yaml present) — step skipped.`)
    return false
  }
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 1\n')
  for (const type of TYPES) {
    const dir = join(tasksDir, type.slug)
    mkdirSync(dir, { recursive: true })
    // baseHeat (#234) semé depuis TYPES : la chaleur de départ vit dans le jalon, tunable.
    writeFileSync(join(dir, '_section.yaml'), yaml.dump({ title: type.title, status: 'open', baseHeat: type.baseHeat, note: type.note }))
  }
  log(`skeleton: ${tasksDir} created (9 canonical empty types, nextId: 1).`)
  return true
}

/** Adds roadmapped as a devDependency of the host package.json (without running
 *  npm: no network round-trip here — the actual install stays in the host's hands). */
export function ensureDevDependency(hostRoot, packageDir, log = () => {}) {
  const pkgFile = join(hostRoot, 'package.json')
  if (!existsSync(pkgFile)) {
    log('devDependency: no host package.json — add roadmapped to your package manager yourself.')
    return false
  }
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  } catch {
    log(`devDependency: ${pkgFile} unreadable — step skipped (file left intact).`)
    return false
  }
  if (pkg.dependencies?.roadmapped || pkg.devDependencies?.roadmapped) {
    log('devDependency: roadmapped already declared — step skipped.')
    return false
  }
  // Source from GitHub, not the npm registry: the package isn't published, so a
  // `roadmapped@^x` devDep would 404 on `npm install`. Derive owner/repo from the
  // repository field → `github:owner/repo`; fall back to `^version` only if some fork
  // strips the repository field (and presumably publishes to a registry).
  const selfPkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  const m = (selfPkg.repository?.url ?? '').match(/github\.com[/:]([^/]+)\/([^/.]+)/)
  const spec = m ? `github:${m[1]}/${m[2]}` : `^${selfPkg.version}`
  pkg.devDependencies = { ...(pkg.devDependencies ?? {}), roadmapped: spec }
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  log(`devDependency: roadmapped ${spec} added to ${pkgFile} — run \`npm install\` to materialize node_modules.`)
  return true
}

/** Copies the skill (tool-owned, overwritable) to the host's .claude/skills/roadmapped/. */
export function copySkill(packageDir, hostRoot, log = () => {}) {
  const src = join(packageDir, 'skills', 'roadmapped')
  const dest = join(hostRoot, '.claude', 'skills', 'roadmapped')
  if (resolve(src) === resolve(dest)) return dest
  cpSync(src, dest, { recursive: true, force: true })
  log(`skill: copied to ${dest} (tool-owned: overwritten on every upgrade).`)
  return dest
}

/** Merges the `roadmapped` entry into the host .mcp.json — merge, never clobber
 *  other servers. An unreadable .mcp.json is left INTACT (we don't wipe a host's
 *  MCP config just to install ours). */
export function mergeMcpEntry(hostRoot, serverArgs, log = () => {}) {
  const file = join(hostRoot, '.mcp.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`mcp: ${file} unreadable — step skipped (file left intact). Add the entry yourself: { "roadmapped": { "command": "node", "args": ${JSON.stringify(serverArgs)} } }`)
      return false
    }
  }
  json.mcpServers = { ...(json.mcpServers ?? {}), roadmapped: { command: 'node', args: serverArgs } }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`mcp: roadmapped entry → ${serverArgs.join(' ')} merged into ${file}.`)
  return true
}

/** SessionStart hook (#122): when a Claude session opens in the repo, runs
 *  `sitrep` — its state of the world is injected into the context up front, without
 *  relying on the agent to think of it. Idempotent merge into .claude/settings.json:
 *  other hooks/settings are preserved, our entry (spotted by the sitrep command) is
 *  updated rather than duplicated. An unreadable settings.json is left intact (step
 *  skipped). */
export function ensureSessionHook(hostRoot, sitrepCommand, log = () => {}) {
  const file = join(hostRoot, '.claude', 'settings.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`session hook: ${file} unreadable — step skipped (file left intact).`)
      return false
    }
  }
  const entry = { hooks: [{ type: 'command', command: sitrepCommand }] }
  json.hooks = json.hooks ?? {}
  const existing = Array.isArray(json.hooks.SessionStart) ? json.hooks.SessionStart : []
  // Spots our entry by the presence of "task.mjs sitrep" in one of its commands.
  const isOurs = (g) => (g?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes('task.mjs sitrep'))
  const others = existing.filter((g) => !isOurs(g))
  json.hooks.SessionStart = [...others, entry]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`session hook: SessionStart → ${sitrepCommand} set in ${file}.`)
  return true
}

/** Writes a Roadmapped block into the host repo's CLAUDE.md (#153): the instruction
 *  "at startup, open the dashboard if it's not already open" read by the agent.
 *  Idempotent and NON-destructive (marker pattern, like installGuardHook): the
 *  user's existing CLAUDE.md is PRESERVED, the block between markers is appended
 *  (file absent → created) or replaced identically on re-init/upgrade. */
export function ensureClaudeMd(hostRoot, log = () => {}) {
  const file = join(hostRoot, 'CLAUDE.md')
  if (!existsSync(file)) {
    writeFileSync(file, `${CLAUDE_BLOCK}\n`)
    log(`CLAUDE.md: created with the roadmapped block (${file}).`)
    return
  }
  const current = readFileSync(file, 'utf8')
  if (current.includes(CLAUDE_START)) {
    const re = new RegExp(`${escapeRe(CLAUDE_START)}[\\s\\S]*?${escapeRe(CLAUDE_END)}`)
    const next = current.replace(re, CLAUDE_BLOCK)
    if (next !== current) writeFileSync(file, next)
    log(`CLAUDE.md: roadmapped block already present — updated.`)
  } else {
    writeFileSync(file, `${current.replace(/\s+$/, '')}\n\n${CLAUDE_BLOCK}\n`)
    log(`CLAUDE.md existing content PRESERVED, roadmapped block appended (${file}).`)
  }
}

/** Installs the guard hook by CHAINING (locked decision): an existing pre-commit
 *  (husky, lefthook-shim, homemade hook) is PRESERVED, the guard is appended between
 *  markers; core.hooksPath is NEVER modified. The block between markers is replaced
 *  identically on re-init/upgrade (idempotent). */
export function installGuardHook(hostRoot, guardCommand, log = () => {}) {
  if (!existsSync(join(hostRoot, '.git'))) {
    log('hook: no .git at the host root — step skipped.')
    return null
  }
  // The host's EFFECTIVE hooks directory, without ever changing it.
  let hooksPath = ''
  try {
    hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { cwd: hostRoot, encoding: 'utf8' }).trim()
  } catch {
    // core.hooksPath not set → default .git/hooks
  }
  let target
  if (existsSync(join(hostRoot, '.husky')) || hooksPath.includes('.husky')) {
    // husky: user hooks live in .husky/ (the internal _ is regenerated).
    target = join(hostRoot, '.husky', 'pre-commit')
  } else if (hooksPath) {
    target = join(isAbsolute(hooksPath) ? hooksPath : join(hostRoot, hooksPath), 'pre-commit')
  } else {
    target = join(hostRoot, '.git', 'hooks', 'pre-commit')
  }
  const block = `${GUARD_START}\n${guardCommand}\n${GUARD_END}\n`
  mkdirSync(dirname(target), { recursive: true })
  if (!existsSync(target)) {
    writeFileSync(target, `#!/bin/sh\n${block}`)
    log(`hook: pre-commit guard created (${target}).`)
  } else {
    const current = readFileSync(target, 'utf8')
    if (current.includes(GUARD_START)) {
      const re = new RegExp(`${escapeRe(GUARD_START)}[\\s\\S]*?${escapeRe(GUARD_END)}\\n?`)
      const next = current.replace(re, block)
      if (next !== current) writeFileSync(target, next)
      log(`hook: guard block already present in ${target} — updated.`)
    } else {
      writeFileSync(target, `${current.replace(/\s+$/, '')}\n\n${block}`)
      log(`hook: existing pre-commit PRESERVED, guard chained after it (${target}).`)
    }
  }
  chmodSync(target, 0o755)
  return target
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// --------------------------------------------- Knowledge base (Graphify, #322)

const GRAPHIFY_PKG = 'graphifyy' // nom PyPI — le binaire/module, lui, s'appelle `graphify`

/** exec best-effort : stdout (string) si succès, null sinon (binaire introuvable,
 *  code ≠ 0, timeout). JAMAIS d'exception — le contrat de toute l'étape KB. */
function tryExec(cmd, args, { timeout = 30_000, cwd } = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, cwd,
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

/** Prompt oui/non sur le TTY. Défaut NON : entrée vide ou autre chose que y/o = refus. */
async function askYesNoTty(question) {
  const { createInterface } = await import('node:readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^(y|yes|o|oui)$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}

/** Mémorise l'interpréteur du venv dédié dans roadmapped.config.json (clé
 *  `pythonBin`) pour que le futur CLI kb/doctor le retrouve. Merge non
 *  destructif (mêmes mœurs que mergeMcpEntry) ; JSON illisible → laissé intact. */
function recordPythonBin(hostRoot, pythonBin, log) {
  const file = CONFIG_NAMES.map((n) => join(hostRoot, n)).find(existsSync) ?? join(hostRoot, 'roadmapped.config.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`kb: ${file} illisible — pythonBin non enregistré (fichier laissé intact).`)
      return false
    }
  }
  if (json.pythonBin === pythonBin) return true
  json.pythonBin = pythonBin
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`kb: pythonBin → ${pythonBin} enregistré dans ${file}.`)
  return true
}

/** Étape Knowledge base (spec docs/specs/graphify-kb.md §5) — OPTIONNELLE,
 *  idempotente, JAMAIS bloquante : quoi qu'il arrive (pas de Python, pas de
 *  réseau, refus utilisateur, crash), elle logge et rend la main — l'init
 *  réussit toujours, aucun process.exit, aucune exception qui remonte.
 *
 *  - Consentement (~28 Mo) : prompt en TTY, skip par défaut en non-TTY/CI
 *    (opt-in `roadmapped init --with-kb`).
 *  - Install en env ISOLÉ, du plus léger au plus rustique : `uv tool install`
 *    → `pipx install` → venv dédié (~/.roadmapped/py, interpréteur mémorisé
 *    dans la config). SANS l'extra Leiden/graspologic (+200 Mo évités — verdict
 *    spec §2.1 : fallback clustering pur Python).
 *  - Ne GÉNÈRE jamais le graphe (acte d'agent, sous-agents pour les docs) et
 *    ne touche PAS au .gitignore (décision §9.1 : le graphe se commite).
 *  - Indépendante de la voie d'install (plugin / npm / github) : ne dépend que
 *    de hostRoot + Python.
 *
 *  opts (tous optionnels, injectables pour les tests) : withKb, interactive,
 *  exec, ask, venvDir. Retourne un statut pour les tests :
 *  'no-python' | 'already' | 'skipped' | 'installed' | 'failed' | 'error'. */
export async function ensureGraphify(hostRoot, opts = {}, log = () => {}) {
  try {
    const {
      withKb = false,
      interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
      exec = tryExec,
      ask = askYesNoTty,
      venvDir = join(homedir(), '.roadmapped', 'py'),
    } = opts

    // 1. Python ≥ 3.10 — absent/trop vieux : la KB est simplement absente.
    let pythonBin = null
    for (const candidate of ['python3', 'python']) {
      const m = /Python\s+(\d+)\.(\d+)/.exec(exec(candidate, ['--version']) ?? '')
      if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) {
        pythonBin = candidate
        break
      }
    }
    if (!pythonBin) {
      log('kb: Knowledge base (optionnelle) : installe Python ≥ 3.10 pour l\'activer, puis relance `roadmapped upgrade`.')
      return 'no-python'
    }

    // 2. Idempotence : déjà installé (binaire sur le PATH ou module importable).
    if (exec('graphify', ['--version']) !== null || exec(pythonBin, ['-c', 'import graphify']) !== null) {
      log('kb: graphify déjà installé — étape sautée.')
      log('kb: pour générer le graphe : ouvre l\'agent et lance `/graphify .` (puis `--update` ensuite).')
      return 'already'
    }

    // 3. Consentement — ~28 Mo téléchargés, jamais silencieux.
    if (!withKb) {
      if (!interactive) {
        log('kb: passe la Knowledge base — relance avec --with-kb pour l\'installer.')
        return 'skipped'
      }
      if (!(await ask('Installer Graphify pour la knowledge base ? ~28 Mo [y/N] '))) {
        log('kb: Knowledge base sautée — pour l\'activer plus tard : `roadmapped upgrade`.')
        return 'skipped'
      }
    }

    // 4. Install en env isolé : uv → pipx → venv dédié (premier qui aboutit).
    let graphifyBin = 'graphify'
    let installed = false
    if (exec('uv', ['--version']) !== null && exec('uv', ['tool', 'install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
      installed = true
      log('kb: graphifyy installé via `uv tool install` (env isolé).')
    }
    if (!installed && exec('pipx', ['--version']) !== null && exec('pipx', ['install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
      installed = true
      log('kb: graphifyy installé via `pipx install` (env isolé).')
    }
    if (!installed) {
      const binDir = process.platform === 'win32' ? 'Scripts' : 'bin'
      const venvPython = join(venvDir, binDir, process.platform === 'win32' ? 'python.exe' : 'python')
      const venvReady = existsSync(venvPython) || exec(pythonBin, ['-m', 'venv', venvDir], { timeout: 120_000 }) !== null
      if (venvReady && exec(venvPython, ['-m', 'pip', 'install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
        installed = true
        graphifyBin = join(venvDir, binDir, 'graphify')
        recordPythonBin(hostRoot, venvPython, log)
        log(`kb: graphifyy installé dans un venv dédié (${venvDir}).`)
      }
    }
    if (!installed) {
      log('kb: installation de graphifyy impossible (ni uv, ni pipx, ni venv n\'a abouti) — Knowledge base sautée. Relance `roadmapped upgrade` pour réessayer.')
      return 'failed'
    }

    // 5. Skill /graphify pour l'agent — best-effort (sous-commandes pré-1.0,
    //    `claude install` peut ne pas exister : capturé, jamais bloquant).
    for (const sub of [['install'], ['claude', 'install']]) {
      if (exec(graphifyBin, sub, { timeout: 60_000, cwd: hostRoot }) === null) {
        log(`kb: \`graphify ${sub.join(' ')}\` n'a pas abouti — à relancer à la main si besoin.`)
      }
    }

    // 6. La génération est un acte d'AGENT (sous-agents pour les docs) — jamais ici.
    log('kb: pour générer le graphe : ouvre l\'agent et lance `/graphify .` (puis `--update` ensuite).')
    return 'installed'
  } catch (err) {
    // Ceinture ET bretelles : cette étape ne fait JAMAIS échouer l'init.
    try {
      log(`kb: étape Knowledge base sautée (${err?.message ?? err}) — Roadmapped fonctionne sans.`)
    } catch { /* même un log cassé ne doit pas tuer l'init */ }
    return 'error'
  }
}

// ------------------------------------------------------------------ verbs

/** Host-side paths to the package scripts. Self-host (the Roadmapped repo
 *  itself): the scripts are at the root, not in node_modules — and Node then
 *  strips the types natively. Under node_modules it refuses: the amaro loader
 *  (scripts/register-ts.mjs) is injected via --import (see this file). */
function packageScripts(hostRoot, packageDir) {
  const selfHost = resolve(hostRoot) === resolve(packageDir)
  const base = selfHost ? 'scripts' : 'node_modules/roadmapped/scripts'
  // `./` is mandatory: without it, --import reads "node_modules/…" as a PACKAGE
  // specifier (ERR_MODULE_NOT_FOUND), not as a path.
  const tsFlags = selfHost ? [] : ['--import', `./${base}/register-ts.mjs`]
  return {
    selfHost,
    mcpArgs: [...tsFlags, `${base}/mcp-server.mjs`],
    guardCommand: ['node', ...tsFlags, `${base}/task.mjs`, 'guard'].join(' '),
    sitrepCommand: ['node', ...tsFlags, `${base}/task.mjs`, 'sitrep'].join(' '),
  }
}

export async function runInit({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log, withKb = false, kb = {} } = {}) {
  const { selfHost, mcpArgs, guardCommand, sitrepCommand } = packageScripts(hostRoot, packageDir)
  log(`roadmapped init — host root: ${hostRoot}${selfHost ? ' (self-host)' : ''}`)
  // Garde d'onboarding (#240) : sans package.json hôte, la devDep roadmapped ne peut
  // être ajoutée → `npm install` ne matérialise PAS node_modules/roadmapped → le
  // .mcp.json et le hook git écrits ci-dessous pointeraient vers un fichier inexistant
  // (MCP connection qui échoue, hook cassé). On ABANDONNE AVANT d'écrire quoi que ce
  // soit de cassé, avec une consigne claire — plutôt que de laisser un état à moitié
  // câblé. (Self-host exempté : le repo de l'outil a son propre package.json.)
  if (!selfHost && !existsSync(join(hostRoot, 'package.json'))) {
    log(`✗ roadmapped init aborted — no package.json at ${hostRoot}.`)
    log('  Roadmapped installs itself as a devDependency (node_modules/roadmapped) that the')
    log('  MCP server and the git guard reference. Without a package.json there is nowhere to')
    log('  install it, and the wiring would point at a file that never exists.')
    log('  → Run `npm init -y` (or your package manager\'s init) first, then `npx roadmapped init` again.')
    return
  }
  ensureConfig(hostRoot, log)
  const { tasksDir } = loadPathsAt(hostRoot)
  ensureSkeleton(tasksDir, log)
  if (!selfHost) ensureDevDependency(hostRoot, packageDir, log)
  if (!selfHost) copySkill(packageDir, hostRoot, log)
  else log('skill: self-host — the skill already lives in skills/roadmapped/, no copy.')
  mergeMcpEntry(hostRoot, mcpArgs, log)
  ensureSessionHook(hostRoot, sitrepCommand, log)
  ensureClaudeMd(hostRoot, log)
  installGuardHook(hostRoot, guardCommand, log)
  // Knowledge base (#322) : APRÈS tout le wiring — optionnelle et jamais
  // bloquante, elle ne peut donc pas empêcher un init par ailleurs réussi.
  await ensureGraphify(hostRoot, { withKb, ...kb }, log)
  log('init done. Next step: the roadmapped skill (setup phase) fills the backlog.')
  log('▶ Dashboard: npx roadmapped dashboard   (opens the browser; not `npm run dev`, which runs YOUR project)')
}

export async function runUpgrade({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log, withKb = false, kb = {} } = {}) {
  const { selfHost, mcpArgs, guardCommand, sitrepCommand } = packageScripts(hostRoot, packageDir)
  log(`roadmapped upgrade — host root: ${hostRoot}${selfHost ? ' (self-host)' : ''}`)
  // Clean boundary: TOOL-OWNED files only. docs/tasks/ and the config are user
  // data — never touched by upgrade.
  if (!selfHost) copySkill(packageDir, hostRoot, log)
  else log('skill: self-host — nothing to re-copy.')
  mergeMcpEntry(hostRoot, mcpArgs, log)
  ensureSessionHook(hostRoot, sitrepCommand, log)
  ensureClaudeMd(hostRoot, log)
  installGuardHook(hostRoot, guardCommand, log)
  // Re-tente la Knowledge base (#322) : re-détecte Python, réinstalle si
  // manquant — idempotente et jamais destructive, comme les étapes tool-owned.
  await ensureGraphify(hostRoot, { withKb, ...kb }, log)
  log('upgrade done (docs/tasks/ and roadmapped.config.json untouched). To bump the package: npm install -D roadmapped@latest')
}
