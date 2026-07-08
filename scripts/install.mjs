#!/usr/bin/env node
// Plomberie d'installation dans un repo HÔTE (spec 2026-07-08-distribution, §3-4).
// `roadmapped init`   : config + squelette 8 stages + skill + entrée MCP + hook guard.
// `roadmapped upgrade`: re-copie les fichiers TOOL-OWNED (skill, MCP, hook) — ne
//                       touche JAMAIS docs/tasks/ ni roadmapped.config.json.
//
// Idempotent par construction : chaque étape détecte l'existant et ne réécrase
// jamais des données utilisateur. Le CONTENU de l'init (questionnaire, migration,
// premières tâches) appartient au skill / #121 — ici uniquement du déterministe.
//
// Node ≥ 22.18 (imports .ts via strip-types natif) — vérifié par bin/roadmapped.mjs.

import {
  existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, chmodSync,
} from 'node:fs'
import { join, dirname, resolve, isAbsolute } from 'node:path'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { STAGES } from '../src/lib/tasks.ts'
import { findHostRoot, packageRoot, loadPathsAt } from '../src/lib/paths.ts'

const GUARD_START = '# >>> roadmapped guard >>>'
const GUARD_END = '# <<< roadmapped guard <<<'

const CONFIG_NAMES = ['roadmapped.config.json', 'roadmaped.config.json'] // rétrocompat un p

// ------------------------------------------------------------------ étapes (testables)

/** Pose roadmapped.config.json à la racine hôte — seulement s'il n'existe sous
 *  aucune des deux orthographes (rétrocompat : un roadmaped.config.json est respecté). */
export function ensureConfig(hostRoot, log = () => {}) {
  const existing = CONFIG_NAMES.map((n) => join(hostRoot, n)).find(existsSync)
  if (existing) {
    log(`config : ${existing} déjà présent — respecté tel quel.`)
    return existing
  }
  const file = join(hostRoot, 'roadmapped.config.json')
  writeFileSync(file, `${JSON.stringify({ tasksDir: 'docs/tasks', docsDir: 'docs' }, null, 2)}\n`)
  log(`config : ${file} créé (tasksDir=docs/tasks, docsDir=docs).`)
  return file
}

/** Squelette du backlog : _meta.yaml (nextId: 1) + les 8 stages canoniques vides.
 *  Si _meta.yaml existe, le backlog est déjà initialisé → on ne touche à RIEN. */
export function ensureSkeleton(tasksDir, log = () => {}) {
  if (existsSync(join(tasksDir, '_meta.yaml'))) {
    log(`squelette : ${tasksDir} déjà initialisé (_meta.yaml présent) — étape sautée.`)
    return false
  }
  mkdirSync(tasksDir, { recursive: true })
  writeFileSync(join(tasksDir, '_meta.yaml'), 'nextId: 1\n')
  for (const stage of STAGES) {
    const dir = join(tasksDir, stage.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '_section.yaml'), yaml.dump({ title: stage.title, status: 'open', note: stage.note }))
  }
  log(`squelette : ${tasksDir} créé (8 stages canoniques vides, nextId: 1).`)
  return true
}

/** Ajoute roadmapped en devDependency du package.json hôte (sans lancer npm :
 *  pas de round-trip réseau ici — l'install effective reste à la main de l'hôte). */
export function ensureDevDependency(hostRoot, packageDir, log = () => {}) {
  const pkgFile = join(hostRoot, 'package.json')
  if (!existsSync(pkgFile)) {
    log('devDependency : pas de package.json hôte — ajoute roadmapped à ton gestionnaire de paquets toi-même.')
    return false
  }
  let pkg
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  } catch {
    log(`devDependency : ${pkgFile} illisible — étape sautée (fichier laissé intact).`)
    return false
  }
  if (pkg.dependencies?.roadmapped || pkg.devDependencies?.roadmapped) {
    log('devDependency : roadmapped déjà déclaré — étape sautée.')
    return false
  }
  const { version } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  pkg.devDependencies = { ...(pkg.devDependencies ?? {}), roadmapped: `^${version}` }
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`)
  log(`devDependency : roadmapped ^${version} ajouté à ${pkgFile} — lance \`npm install\` pour matérialiser node_modules.`)
  return true
}

/** Copie le skill (tool-owned, écrasable) vers .claude/skills/roadmapped/ de l'hôte. */
export function copySkill(packageDir, hostRoot, log = () => {}) {
  const src = join(packageDir, 'skills', 'roadmapped')
  const dest = join(hostRoot, '.claude', 'skills', 'roadmapped')
  if (resolve(src) === resolve(dest)) return dest
  cpSync(src, dest, { recursive: true, force: true })
  log(`skill : copié vers ${dest} (tool-owned : réécrasé à chaque upgrade).`)
  return dest
}

/** Fusionne l'entrée `roadmapped` dans .mcp.json hôte — merge, jamais de clobber
 *  des autres serveurs. Un .mcp.json illisible est laissé INTACT (on ne détruit
 *  pas la config MCP d'un hôte pour installer la nôtre). */
export function mergeMcpEntry(hostRoot, serverArgs, log = () => {}) {
  const file = join(hostRoot, '.mcp.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`mcp : ${file} illisible — étape sautée (fichier laissé intact). Ajoute l'entrée toi-même : { "roadmapped": { "command": "node", "args": ${JSON.stringify(serverArgs)} } }`)
      return false
    }
  }
  json.mcpServers = { ...(json.mcpServers ?? {}), roadmapped: { command: 'node', args: serverArgs } }
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`mcp : entrée roadmapped → ${serverArgs.join(' ')} fusionnée dans ${file}.`)
  return true
}

/** Hook SessionStart (#122) : à l'ouverture d'une session Claude dans le repo,
 *  lance `sitrep` — son état du monde est injecté d'emblée dans le contexte, sans
 *  compter sur l'agent pour y penser. Merge idempotent dans .claude/settings.json :
 *  les autres hooks/réglages sont préservés, notre entrée (repérée par la commande
 *  sitrep) est remise à jour plutôt que dupliquée. Un settings.json illisible est
 *  laissé intact (étape sautée). */
export function ensureSessionHook(hostRoot, sitrepCommand, log = () => {}) {
  const file = join(hostRoot, '.claude', 'settings.json')
  let json = {}
  if (existsSync(file)) {
    try {
      json = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      log(`session hook : ${file} illisible — étape sautée (fichier laissé intact).`)
      return false
    }
  }
  const entry = { hooks: [{ type: 'command', command: sitrepCommand }] }
  json.hooks = json.hooks ?? {}
  const existing = Array.isArray(json.hooks.SessionStart) ? json.hooks.SessionStart : []
  // Repère notre entrée par la présence de « task.mjs sitrep » dans une de ses commandes.
  const isOurs = (g) => (g?.hooks ?? []).some((h) => typeof h?.command === 'string' && h.command.includes('task.mjs sitrep'))
  const others = existing.filter((g) => !isOurs(g))
  json.hooks.SessionStart = [...others, entry]
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`)
  log(`session hook : SessionStart → ${sitrepCommand} posé dans ${file}.`)
  return true
}

/** Installe le hook guard en CHAÎNANT (décision verrouillée) : un pre-commit
 *  existant (husky, lefthook-shim, hook maison) est PRÉSERVÉ, le guard est ajouté
 *  à la suite entre marqueurs ; core.hooksPath n'est JAMAIS modifié. Le bloc entre
 *  marqueurs est remplacé à l'identique au ré-init/upgrade (idempotent). */
export function installGuardHook(hostRoot, guardCommand, log = () => {}) {
  if (!existsSync(join(hostRoot, '.git'))) {
    log('hook : pas de .git à la racine hôte — étape sautée.')
    return null
  }
  // Dossier de hooks EFFECTIF de l'hôte, sans jamais le changer.
  let hooksPath = ''
  try {
    hooksPath = execFileSync('git', ['config', 'core.hooksPath'], { cwd: hostRoot, encoding: 'utf8' }).trim()
  } catch {
    // core.hooksPath non défini → défaut .git/hooks
  }
  let target
  if (existsSync(join(hostRoot, '.husky')) || hooksPath.includes('.husky')) {
    // husky : les hooks utilisateur vivent dans .husky/ (le _ interne est régénéré).
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
    log(`hook : pre-commit guard créé (${target}).`)
  } else {
    const current = readFileSync(target, 'utf8')
    if (current.includes(GUARD_START)) {
      const re = new RegExp(`${escapeRe(GUARD_START)}[\\s\\S]*?${escapeRe(GUARD_END)}\\n?`)
      const next = current.replace(re, block)
      if (next !== current) writeFileSync(target, next)
      log(`hook : bloc guard déjà présent dans ${target} — remis à jour.`)
    } else {
      writeFileSync(target, `${current.replace(/\s+$/, '')}\n\n${block}`)
      log(`hook : pre-commit existant PRÉSERVÉ, guard chaîné à la suite (${target}).`)
    }
  }
  chmodSync(target, 0o755)
  return target
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ------------------------------------------------------------------ verbes

/** Chemins côté hôte vers les scripts du paquet. Self-host (le repo Roadmapped
 *  lui-même) : les scripts sont à la racine, pas dans node_modules — et Node
 *  strippe alors les types nativement. Sous node_modules, il refuse : le loader
 *  amaro (scripts/register-ts.mjs) est injecté via --import (cf. ce fichier). */
function packageScripts(hostRoot, packageDir) {
  const selfHost = resolve(hostRoot) === resolve(packageDir)
  const base = selfHost ? 'scripts' : 'node_modules/roadmapped/scripts'
  // `./` obligatoire : sans lui, --import lit « node_modules/… » comme un
  // spécificateur de PAQUET (ERR_MODULE_NOT_FOUND), pas comme un chemin.
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
  log(`roadmapped init — racine hôte : ${hostRoot}${selfHost ? ' (self-host)' : ''}`)
  ensureConfig(hostRoot, log)
  const { tasksDir } = loadPathsAt(hostRoot)
  ensureSkeleton(tasksDir, log)
  if (!selfHost) ensureDevDependency(hostRoot, packageDir, log)
  if (!selfHost) copySkill(packageDir, hostRoot, log)
  else log('skill : self-host — le skill vit déjà dans skills/roadmapped/, pas de copie.')
  mergeMcpEntry(hostRoot, mcpArgs, log)
  ensureSessionHook(hostRoot, sitrepCommand, log)
  installGuardHook(hostRoot, guardCommand, log)
  log('init terminé. Prochaine étape : le skill roadmapped (phase de setup) remplit le backlog.')
  log('▶ Dashboard : npx roadmapped dashboard   (ouvre le navigateur ; pas « npm run dev », qui lance TON projet)')
}

export function runUpgrade({ hostRoot = findHostRoot(), packageDir = packageRoot(), log = console.log } = {}) {
  const { selfHost, mcpArgs, guardCommand, sitrepCommand } = packageScripts(hostRoot, packageDir)
  log(`roadmapped upgrade — racine hôte : ${hostRoot}${selfHost ? ' (self-host)' : ''}`)
  // Frontière nette : fichiers TOOL-OWNED uniquement. docs/tasks/ et la config
  // sont des données utilisateur — jamais touchés par upgrade.
  if (!selfHost) copySkill(packageDir, hostRoot, log)
  else log('skill : self-host — rien à recopier.')
  mergeMcpEntry(hostRoot, mcpArgs, log)
  ensureSessionHook(hostRoot, sitrepCommand, log)
  installGuardHook(hostRoot, guardCommand, log)
  log('upgrade terminé (docs/tasks/ et roadmapped.config.json non touchés). Pour bumper le paquet : npm install -D roadmapped@latest')
}
