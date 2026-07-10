#!/usr/bin/env node
// Install plumbing inside a HOST repo (spec 2026-07-08-distribution, §3-4).
// `roadmapped init`   : config + 9-type skeleton + skill + MCP entry + guard hook.
// `roadmapped upgrade`: re-copies the TOOL-OWNED files (skill, MCP, hook) — NEVER
//                       touches docs/tasks/ or roadmapped.config.json.
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

export function runInit({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log } = {}) {
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
  log('init done. Next step: the roadmapped skill (setup phase) fills the backlog.')
  log('▶ Dashboard: npx roadmapped dashboard   (opens the browser; not `npm run dev`, which runs YOUR project)')
}

export function runUpgrade({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log } = {}) {
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
  log('upgrade done (docs/tasks/ and roadmapped.config.json untouched). To bump the package: npm install -D roadmapped@latest')
}
