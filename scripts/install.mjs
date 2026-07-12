#!/usr/bin/env node
// Install plumbing inside a HOST repo (spec 2026-07-08-distribution, §3-4).
// `roadmapped init`   : config + 9-type skeleton + skill + MCP entry + guard hook
//                       + Knowledge base Graphify (PAR DÉFAUT, opt-out --no-kb,
//                       jamais bloquante — #322 renversé par #324).
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
  copyFileSync, rmSync, readdirSync,
} from 'node:fs'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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

// Sidecar MACHINE-LOCAL, gitignoré (#329) : l'état d'install KB tient des chemins
// ABSOLUS propres à la machine — jamais dans un fichier TRACKÉ (fuite en repo
// partagé / self-host). Seul l'opt-out `kb: false` (décision partagée) reste dans
// la config trackée ; les chemins vivent ici.
const LOCAL_CONFIG_NAME = 'roadmapped.config.local.json'

/** Chemin de la config trackée présente (rétrocompat un-p), ou le nom canonique. */
function trackedConfigFile(hostRoot) {
  return CONFIG_NAMES.map((n) => join(hostRoot, n)).find(existsSync) ?? join(hostRoot, 'roadmapped.config.json')
}

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

/** Merges ONE named server entry into the host .mcp.json — merge, never clobber
 *  other servers, idempotent (an identical entry doesn't rewrite the file). An
 *  unreadable .mcp.json is left INTACT (we don't wipe a host's MCP config just
 *  to install ours). Generalized in #324: also carries the native `graphify`
 *  MCP server next to the `roadmapped` one. */
export function mergeMcpServer(hostRoot, name, entry, log = () => {}) {
  const file = join(hostRoot, '.mcp.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`mcp: ${file} unreadable — step skipped (file left intact). Add the entry yourself: { "${name}": ${JSON.stringify(entry)} }`)
      return false
    }
  }
  if (JSON.stringify(json.mcpServers?.[name]) === JSON.stringify(entry)) return true // déjà posée, à l'identique
  json.mcpServers = { ...(json.mcpServers ?? {}), [name]: entry }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`mcp: ${name} entry → ${[entry.command, ...(entry.args ?? [])].join(' ')} merged into ${file}.`)
  return true
}

/** Entrée `roadmapped` (le serveur MCP de l'outil) — wrapper historique. */
export function mergeMcpEntry(hostRoot, serverArgs, log = () => {}) {
  return mergeMcpServer(hostRoot, 'roadmapped', { command: 'node', args: serverArgs }, log)
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

// ------------------------------- Knowledge base (Graphify, #322 → #324 par défaut)

const GRAPHIFY_PKG = 'graphifyy' // nom PyPI — le binaire/module, lui, s'appelle `graphify`

// Bootstrap uv (#324, spec graphify-anchoring §A.1) : version ÉPINGLÉE, assets
// GitHub Release déterministes par plateforme, checksum .sha256 vérifié — jamais
// de `curl | sh`, jamais d'écriture dans le PATH (invocation par chemin absolu).
const UV_VERSION = '0.11.28'

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

/** which/where → premier chemin ABSOLU du binaire, null sinon (jamais d'exception). */
function resolveOnPath(exec, name) {
  const out = exec(process.platform === 'win32' ? 'where' : 'which', [name])
  const first = out?.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '')
  return first && isAbsolute(first) ? first : null
}

/** Nom d'asset uv de la plateforme courante — matrice darwin/linux/win × arm64/x64
 *  (ex. `uv-aarch64-apple-darwin.tar.gz`), null si plateforme hors matrice. */
function uvAssetName() {
  const arch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch]
  const target = arch && {
    darwin: `${arch}-apple-darwin`,
    linux: `${arch}-unknown-linux-gnu`,
    win32: `${arch}-pc-windows-msvc`,
  }[process.platform]
  return target ? `uv-${target}${process.platform === 'win32' ? '.zip' : '.tar.gz'}` : null
}

/** Télécharge une URL en Buffer — suit les redirections GitHub, timeout borné,
 *  jette en cas d'échec (capturé par l'appelant). */
async function fetchBuffer(fetchImpl, url, timeout) {
  const res = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout) })
  if (!res?.ok) throw new Error(`HTTP ${res?.status ?? '???'} — ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

/** Cherche `name` sous `dir` (récursif borné) : l'archive uv contient le binaire
 *  sous `uv-<target>/` (tar.gz) ou à la racine (zip Windows). */
function findFileIn(dir, name, depth = 3) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) if (e.isFile() && e.name === name) return join(dir, e.name)
  if (depth <= 0) return null
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = findFileIn(join(dir, e.name), name, depth - 1)
      if (hit) return hit
    }
  }
  return null
}

/** Étage 2 de la chaîne (#324) : installe uv LUI-MÊME depuis l'asset GitHub
 *  Release épinglé UV_VERSION — download direct (PAS de `curl | sh`), checksum
 *  `.sha256` vérifié, extraction via tar (bsdtar lit aussi le .zip Windows),
 *  binaire posé à `<destDir>/uv`. Best-effort : null en cas d'échec (offline,
 *  proxy, tar absent, checksum KO) — l'appelant passe à l'étage suivant. */
async function bootstrapUv({ exec, fetchImpl, destDir, log }) {
  const extractDir = join(destDir, '.uv-extract')
  try {
    const asset = uvAssetName()
    if (!asset) {
      log(`kb: pas d'asset uv pour ${process.platform}/${process.arch} — étage bootstrap sauté.`)
      return null
    }
    if (typeof fetchImpl !== 'function') return null
    const base = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}`
    log(`kb: bootstrap de uv ${UV_VERSION} (${asset}, ~25 Mo one-time) → ${destDir}…`)
    const archive = await fetchBuffer(fetchImpl, `${base}/${asset}`, 180_000)
    const expected = (await fetchBuffer(fetchImpl, `${base}/${asset}.sha256`, 30_000))
      .toString('utf8').trim().split(/\s+/)[0].toLowerCase()
    const actual = createHash('sha256').update(archive).digest('hex')
    if (!/^[0-9a-f]{64}$/.test(expected) || expected !== actual) {
      log(`kb: checksum uv invalide (attendu ${expected || '?'}, obtenu ${actual}) — étage bootstrap abandonné.`)
      return null
    }
    mkdirSync(destDir, { recursive: true })
    const archiveFile = join(destDir, asset)
    writeFileSync(archiveFile, archive)
    rmSync(extractDir, { recursive: true, force: true })
    mkdirSync(extractDir, { recursive: true })
    const extracted = exec('tar', ['-xf', archiveFile, '-C', extractDir], { timeout: 120_000 }) !== null
    rmSync(archiveFile, { force: true })
    const exe = process.platform === 'win32' ? 'uv.exe' : 'uv'
    const found = extracted ? findFileIn(extractDir, exe) : null
    if (!found) {
      log('kb: extraction de l\'archive uv impossible (tar indisponible ?) — étage bootstrap abandonné.')
      return null
    }
    const uvBin = join(destDir, exe)
    copyFileSync(found, uvBin)
    chmodSync(uvBin, 0o755)
    log(`kb: uv ${UV_VERSION} installé → ${uvBin} (checksum sha256 vérifié).`)
    return uvBin
  } catch (err) {
    log(`kb: bootstrap uv impossible (${err?.message ?? err}) — étage suivant.`)
    return null
  } finally {
    try {
      rmSync(extractDir, { recursive: true, force: true })
    } catch { /* le nettoyage ne doit jamais casser l'étape */ }
  }
}

/** Lit la clé `kb` de roadmapped.config.json : `false` = opt-out mémorisé,
 *  objet = statut + chemins mémorisés, undefined = jamais posée / illisible. */
function readConfigKb(hostRoot) {
  const kbOf = (file) => {
    if (!existsSync(file)) return undefined
    try {
      return JSON.parse(readFileSync(file, 'utf8')).kb
    } catch {
      return undefined
    }
  }
  const tracked = kbOf(trackedConfigFile(hostRoot))
  if (tracked === false) return false // opt-out (décision partagée) l'emporte
  const local = kbOf(join(hostRoot, LOCAL_CONFIG_NAME)) // état machine (chemins absolus)
  return local ?? tracked
}

/** Mémorise l'état KB sous `kb` : `false` (opt-out) → config TRACKÉE (décision
 *  partagée) ; merge { status, uvBin, pythonBin, graphifyBin } (chemins ABSOLUS
 *  machine) → sidecar gitignoré `roadmapped.config.local.json` (#329, jamais
 *  commité). Merge non destructif ; JSON illisible → laissé intact, étape sautée. */
function patchConfigKb(hostRoot, value, log = () => {}) {
  const file = value === false ? trackedConfigFile(hostRoot) : join(hostRoot, LOCAL_CONFIG_NAME)
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`kb: ${file} illisible — état KB non enregistré (fichier laissé intact).`)
      return false
    }
  }
  const prev = json.kb
  const next = value === false ? false : {
    ...(typeof prev === 'object' && prev !== null ? prev : {}),
    ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)),
  }
  if (JSON.stringify(prev) === JSON.stringify(next)) return true
  json.kb = next
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`kb: ${value === false ? 'opt-out (kb: false)' : `état kb.status=${next.status}`} enregistré dans ${file}.`)
  return true
}

/** Étape Knowledge base (spec docs/specs/graphify-anchoring.md, Volet A) —
 *  INSTALLÉE PAR DÉFAUT (#324, renverse l'opt-in #322 : Graphify est le cœur de
 *  Roadmapped, pas une option), idempotente, JAMAIS bloquante : quoi qu'il
 *  arrive (offline, pas de Python, crash), elle logge et rend la main — l'init
 *  réussit toujours, aucun process.exit, aucune exception qui remonte.
 *
 *  - Défaut = INSTALLE (on informe, on ne demande plus). Opt-out :
 *    `roadmapped init --no-kb` (mémorisé `kb: false` en config — le refus n'est
 *    jamais re-demandé) ; `CI` → skip silencieux (un runner n'a pas besoin de
 *    la KB). `--with-kb` (#322) reste accepté mais inerte.
 *  - Chaîne d'install en env ISOLÉ, le premier étage qui aboutit gagne :
 *    (a) `uv tool install` (uv du PATH ou déjà bootstrappé — uv télécharge de
 *    lui-même un CPython géré si aucun Python ≥ 3.10 : voulu) ; (b) uv absent →
 *    BOOTSTRAP de uv (asset GitHub épinglé + checksum → ~/.roadmapped/bin/uv) ;
 *    (c) `pipx install` ; (d) venv dédié ~/.roadmapped/py (Python système
 *    ≥ 3.10 requis pour cet étage seulement). SANS l'extra Leiden/graspologic
 *    (+200 Mo évités — spec graphify-kb.md §2.1).
 *  - Chemins ABSOLUS mémorisés dans le sidecar gitignoré roadmapped.config.local.json
 *    (#329, jamais commité) sous `kb` (uvBin/pythonBin/graphifyBin) — jamais
 *    dépendants du PATH. Statut mémorisé : installed | failed.
 *  - PAS d'entrée MCP native `graphify` ni de `graphify claude install` (#329) :
 *    l'un et l'autre écrivaient des chemins ABSOLUS machine dans des fichiers
 *    trackés (.mcp.json / .claude/settings.json). La surface agent du graphe passe
 *    par les tools MCP roadmapped (kb_search/kb_node/kb_neighborhood, #309) et la
 *    CLI `graphify`.
 *  - Ne GÉNÈRE jamais le graphe (acte d'agent, sous-agents pour les docs) et
 *    ne touche PAS au .gitignore (décision §9.1 : le graphe se commite).
 *
 *  opts (tous optionnels, injectables pour les tests) : noKb, exec, fetchImpl,
 *  env, venvDir, uvDir. Retourne un statut pour les tests :
 *  'declined' | 'skipped' | 'already' | 'installed' | 'failed' | 'error'. */
export async function ensureGraphify(hostRoot, opts = {}, log = () => {}) {
  try {
    const {
      noKb = false,
      exec = tryExec,
      fetchImpl = globalThis.fetch,
      env = process.env,
      venvDir = join(homedir(), '.roadmapped', 'py'),
      uvDir = join(homedir(), '.roadmapped', 'bin'),
    } = opts
    const binDir = process.platform === 'win32' ? 'Scripts' : 'bin'
    const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)

    // 0. Opt-out : --no-kb MÉMORISE le refus (kb: false) — upgrade le respecte,
    //    on ne re-tente ni ne re-demande jamais un refus explicite.
    if (noKb) {
      patchConfigKb(hostRoot, false, log)
      log('kb: opt-out (--no-kb) — Knowledge base désactivée (kb: false dans roadmapped.config.json). Pour la réactiver : retire la clé puis `roadmapped upgrade`.')
      return 'declined'
    }
    const cfgKb = readConfigKb(hostRoot)
    if (cfgKb === false) {
      log('kb: désactivée dans roadmapped.config.json (kb: false) — étape sautée.')
      return 'declined'
    }
    // CI : skip SILENCIEUX — un runner n'a pas besoin de la KB et ne doit pas
    // télécharger ~85 Mo. Seul contexte où le défaut s'inverse.
    if (env.CI && env.CI !== 'false') return 'skipped'

    // 1. Idempotence : déjà installé ? (chemins mémorisés, binaire sur le PATH,
    //    ou module importable) — on complète alors config + entrée MCP, sans install.
    const memo = typeof cfgKb === 'object' && cfgKb !== null ? cfgKb : {}
    let already = null
    if ((memo.graphifyBin && exec(memo.graphifyBin, ['--version']) !== null)
      || (memo.pythonBin && exec(memo.pythonBin, ['-c', 'import graphify']) !== null)) {
      already = { ...memo }
    } else if (exec('graphify', ['--version']) !== null) {
      already = { ...memo, graphifyBin: resolveOnPath(exec, 'graphify') ?? 'graphify' }
    } else {
      for (const candidate of ['python3', 'python']) {
        if (exec(candidate, ['-c', 'import graphify']) !== null) {
          already = { ...memo, pythonBin: resolveOnPath(exec, candidate) ?? candidate }
          break
        }
      }
    }
    if (already) {
      log('kb: graphify déjà installé — étape sautée.')
      patchConfigKb(hostRoot, {
        uvBin: already.uvBin, pythonBin: already.pythonBin, graphifyBin: already.graphifyBin, status: 'installed',
      }, log)
      log('kb: pour générer le graphe : ouvre l\'agent et lance `/graphify .` (puis `--update` ensuite).')
      return 'already'
    }

    // 2. DÉFAUT = INSTALLE — on informe (taille, opt-out), on ne demande plus (#324).
    log('kb: installation de la knowledge base (Graphify) — ~28 Mo one-time, env isolé (opt-out : `roadmapped init --no-kb`)…')

    // 3. Chaîne d'install, le premier étage qui aboutit gagne (spec §A.1) :
    //    uv (PATH | ~/.roadmapped/bin) → bootstrap uv → pipx → venv système.
    const kbState = {}
    let installed = false

    // (a)+(b) uv — présent, déjà bootstrappé par nous, ou bootstrappé maintenant.
    //     uv télécharge tout seul un CPython géré si la machine n'a rien en ≥ 3.10.
    let uvBin = exec('uv', ['--version']) !== null ? (resolveOnPath(exec, 'uv') ?? 'uv') : null
    if (!uvBin) {
      const ours = join(uvDir, exe('uv'))
      if (existsSync(ours) && exec(ours, ['--version']) !== null) uvBin = ours
    }
    if (!uvBin) uvBin = await bootstrapUv({ exec, fetchImpl, destDir: uvDir, log })
    if (uvBin && exec(uvBin, ['tool', 'install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
      installed = true
      kbState.uvBin = uvBin
      const toolsDir = exec(uvBin, ['tool', 'dir'])?.trim()
      if (toolsDir) {
        kbState.pythonBin = join(toolsDir, GRAPHIFY_PKG, binDir, exe('python'))
        kbState.graphifyBin = join(toolsDir, GRAPHIFY_PKG, binDir, exe('graphify'))
      } else {
        kbState.graphifyBin = resolveOnPath(exec, 'graphify') ?? 'graphify'
      }
      log('kb: graphifyy installé via `uv tool install` (env isolé, CPython géré par uv si besoin).')
    }

    // (c) pipx — même famille d'env isolé, chemins dérivés de PIPX_LOCAL_VENVS.
    if (!installed && exec('pipx', ['--version']) !== null && exec('pipx', ['install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
      installed = true
      const venvsRoot = exec('pipx', ['environment', '--value', 'PIPX_LOCAL_VENVS'])?.trim()
      if (venvsRoot) {
        kbState.pythonBin = join(venvsRoot, GRAPHIFY_PKG, binDir, exe('python'))
        kbState.graphifyBin = join(venvsRoot, GRAPHIFY_PKG, binDir, exe('graphify'))
      } else {
        kbState.graphifyBin = resolveOnPath(exec, 'graphify') ?? 'graphify'
      }
      log('kb: graphifyy installé via `pipx install` (env isolé).')
    }

    // (d) venv dédié — seul étage qui exige un Python système ≥ 3.10.
    if (!installed) {
      let sysPython = null
      for (const candidate of ['python3', 'python']) {
        const m = /Python\s+(\d+)\.(\d+)/.exec(exec(candidate, ['--version']) ?? '')
        if (m && (Number(m[1]) > 3 || (Number(m[1]) === 3 && Number(m[2]) >= 10))) {
          sysPython = candidate
          break
        }
      }
      if (sysPython) {
        const venvPython = join(venvDir, binDir, exe('python'))
        const venvReady = existsSync(venvPython) || exec(sysPython, ['-m', 'venv', venvDir], { timeout: 120_000 }) !== null
        if (venvReady && exec(venvPython, ['-m', 'pip', 'install', GRAPHIFY_PKG], { timeout: 300_000 }) !== null) {
          installed = true
          kbState.pythonBin = venvPython
          kbState.graphifyBin = join(venvDir, binDir, exe('graphify'))
          log(`kb: graphifyy installé dans un venv dédié (${venvDir}).`)
        }
      }
    }

    if (!installed) {
      patchConfigKb(hostRoot, { status: 'failed' }, log)
      log('kb: installation de graphifyy impossible (uv, bootstrap uv, pipx, venv : aucun étage n\'a abouti) — Knowledge base sautée. Relance `roadmapped upgrade` pour réessayer.')
      return 'failed'
    }

    // 4. Chemins ABSOLUS mémorisés dans le sidecar gitignoré (kb.uvBin/pythonBin/graphifyBin).
    patchConfigKb(hostRoot, { ...kbState, status: 'installed' }, log)

    // 5. Skill /graphify pour l'agent — best-effort via le binaire mémorisé.
    //    UNIQUEMENT `graphify install` (skill global ~/.claude, aucun fichier repo) :
    //    `graphify claude install` écrivait des chemins ABSOLUS dans .claude/settings.json
    //    trackée (#329) — on ne l'appelle plus.
    if (exec(kbState.graphifyBin ?? 'graphify', ['install'], { timeout: 60_000, cwd: hostRoot }) === null) {
      log('kb: `graphify install` n\'a pas abouti — à relancer à la main si besoin.')
    }

    // 7. La génération est un acte d'AGENT (sous-agents pour les docs) — jamais ici.
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

export async function runInit({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log, noKb = false, kb = {} } = {}) {
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
  // Knowledge base (#324) : PAR DÉFAUT, APRÈS tout le wiring — jamais bloquante
  // (opt-out --no-kb / kb: false / CI), elle ne peut donc pas empêcher un init
  // par ailleurs réussi.
  await ensureGraphify(hostRoot, { noKb, ...kb }, log)
  log('init done. Next step: the roadmapped skill (setup phase) fills the backlog.')
  log('▶ Dashboard: npx roadmapped dashboard   (opens the browser; not `npm run dev`, which runs YOUR project)')
}

export async function runUpgrade({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log, noKb = false, kb = {} } = {}) {
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
  // Re-tente la Knowledge base (#324) : re-détecte, réinstalle si manquant —
  // idempotente, jamais destructive, et respecte l'opt-out mémorisé (kb: false).
  await ensureGraphify(hostRoot, { noKb, ...kb }, log)
  log('upgrade done (docs/tasks/ and roadmapped.config.json untouched). To bump the package: npm install -D roadmapped@latest')
}
