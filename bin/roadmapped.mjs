#!/usr/bin/env node
// Dispatcher for the roadmapped package — the only published entry point (spec
// 2026-07-08-distribution, §2). Three families of verbs:
//   init / upgrade  → install plumbing in the host repo (scripts/install.mjs)
//   dashboard       → Vite (dev) from the PACKAGE, data anchored to the HOST repo
//   everything else → transparent proxy to scripts/task.mjs (portable CLI:
//                     `npx roadmapped done 42` works in any repo)
//
// NO static .ts import here: we first check the Node version (native strip-types
// required — locked decision: we ship the raw .ts), so it fails with a clear
// message rather than a cryptic SyntaxError.

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `roadmapped requires Node >= 22.18 (native TypeScript imports, strip-types) — detected version: ${process.versions.node}.`,
  )
  process.exit(1)
}

const { spawnSync } = await import('node:child_process')
const { fileURLToPath, pathToFileURL } = await import('node:url')
const { dirname, join, resolve } = await import('node:path')

// Root of the PACKAGE (where this bin lives) — NOT the host repo (= cwd walked up, cf. paths.ts).
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [cmd, ...rest] = process.argv.slice(2)

const importPkg = (rel) => import(pathToFileURL(join(packageDir, rel)).href)

// Node refuses to strip types under node_modules: we register the amaro loader
// BEFORE any .ts import (see scripts/register-ts.mjs). The subprocesses (task.mjs
// proxy) get the same loader via --import.
const registerTs = join(packageDir, 'scripts', 'register-ts.mjs')
await import(pathToFileURL(registerTs).href)
const nodeTs = (script, args) => [
  '--import', registerTs, join(packageDir, 'scripts', script), ...args,
]

const USAGE = `Usage: roadmapped <command>

Plumbing (host repo):
  init       install Roadmapped in the current repo (config, 8-stage skeleton,
             .claude/ skill, .mcp.json entry, chained guard hook) — idempotent
  upgrade    update the tool's files (skill, MCP, hook) —
             NEVER touches docs/tasks/ or roadmapped.config.json
  migrate    upgrade an OLD-model backlog (stages+teams) to the type-based
             model — idempotent, no-op if already migrated
  dashboard  launch the dashboard (local server + write API) on the current repo

Any other command is proxied to the task management CLI:`

switch (cmd) {
  case 'init':
  case 'upgrade': {
    const { runInit, runUpgrade } = await importPkg('scripts/install.mjs')
    ;(cmd === 'init' ? runInit : runUpgrade)()
    break
  }

  case 'migrate': {
    // Migration du modèle (#248) : ancien backlog (stages+team+quick) → jalons par
    // type. Idempotent. Tourne dans le repo HÔTE (cwd préservé), loader TS pour TYPES.
    const r = spawnSync(process.execPath, nodeTs('migrate.mjs', rest), { stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }

  case 'dashboard': {
    // Root of the HOST repo this launch serves — resolved BEFORE the probe: the
    // idempotence check must compare repos, not just "something answers on 5173".
    const { findHostRoot } = await importPkg('src/lib/paths.ts')
    const envRoot = process.env.ROADMAPPED_ROOT
    const hostRoot = envRoot && envRoot.trim() !== '' ? resolve(envRoot) : findHostRoot()

    // MAJ auto (#207) : notify-only si le commit installé est en retard sur main
    // (distribution GitHub-only). Lit le SHA installé dans le package-lock de
    // l'hôte, le compare à git ls-remote HEAD. Borné ~2 s, caché 1×/jour, silencieux
    // sur toute erreur, sauté dans un clone de dev (packageDir/.git). Jamais bloquant.
    const { notifyIfOutdated } = await importPkg('src/lib/updateNotifier.ts')
    await notifyIfOutdated(packageDir, hostRoot).catch(() => {})

    // Options : --no-open (défaut = ouvre le navigateur), --port N.
    const open = !rest.includes('--no-open')
    const portIdx = rest.findIndex((a) => a === '--port')
    const portArg = portIdx >= 0 && rest[portIdx + 1] ? Number(rest[portIdx + 1]) : undefined

    // Idempotent (#153/#203/#204) : si un dashboard sert DÉJÀ CE repo (même hostRoot),
    // pas de 2e instance — no-op + URL. On BALAYE 5173-5183 (pas seulement 5173) :
    // un dashboard d'un AUTRE repo a pu migrer sur 5174… — sinon on louperait notre
    // propre instance et on en ouvrirait un doublon (l'ancien ponytail, corrigé ici).
    // Autre repo sur un port → serve.ts prendra le premier libre (coexistence).
    const ports = portArg ? [portArg] : Array.from({ length: 11 }, (_, i) => 5173 + i)
    const hits = await Promise.all(ports.map(async (p) => {
      try {
        const res = await fetch(`http://localhost:${p}/api/tree`, { signal: AbortSignal.timeout(500) })
        const body = res.ok ? await res.json().catch(() => null) : null
        return body && typeof body.ok === 'boolean' && body.hostRoot === hostRoot ? p : null
      } catch { return null }
    }))
    const mine = hits.find((p) => p !== null)
    if (mine) {
      console.log(`roadmapped dashboard: already open → http://localhost:${mine}/`)
      process.exit(0)
    }

    // Serveur prod IN-PROCESS (#200) : plus de spawn Vite. Le loader amaro étant déjà
    // enregistré (register-ts en tête du bin), on importe le .ts directement. serve.ts
    // sert dist/ + monte l'API. ROADMAPPED_ROOT posé AVANT l'import (loadPaths le lit).
    process.env.ROADMAPPED_ROOT = hostRoot
    const { startDashboard } = await importPkg('src/server/serve.ts')
    await startDashboard({ open, port: portArg })
    // PAS de process.exit : le handle du serveur HTTP garde le process vivant
    // (Ctrl-C termine). `break` évite le fall-through dans le case help.
    break
  }

  case undefined:
  case 'help':
  case '--help': {
    console.log(USAGE)
    // Then the task CLI's own usage (single source: task.mjs).
    const r = spawnSync(process.execPath, nodeTs('task.mjs', cmd ? [cmd] : []), { stdio: 'inherit' })
    process.exit(r.status ?? 0)
  }

  default: {
    // Transparent proxy: `roadmapped <verb>` = `node <package>/scripts/task.mjs <verb>`.
    // The cwd is preserved — task.mjs anchors its data to the host repo via loadPaths().
    const r = spawnSync(process.execPath, nodeTs('task.mjs', [cmd, ...rest]), { stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }
}
