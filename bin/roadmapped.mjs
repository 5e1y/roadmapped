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
const { createRequire } = await import('node:module')

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
  dashboard  launch the dashboard (Vite dev + write API) on the current repo

Any other command is proxied to the task management CLI:`

switch (cmd) {
  case 'init':
  case 'upgrade': {
    const { runInit, runUpgrade } = await importPkg('scripts/install.mjs')
    ;(cmd === 'init' ? runInit : runUpgrade)()
    break
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

    // Idempotent (#153/#203): if a dashboard already serves THIS SAME repo on the
    // default port, don't launch a 2nd instance — no-op + URL. We probe /api/tree
    // and compare its hostRoot (#204). Three cases:
    //   - same hostRoot        → legit idempotence, no-op.
    //   - different hostRoot    → another repo's dashboard owns 5173; we let vite
    //                             start and auto-increment (5174…) so both coexist.
    //   - not our shape / down  → we start normally.
    // ponytail: probes port 5173 only (the dashboard's home); a 3rd repo whose
    // dashboard migrated to 5174 isn't detected as "already open" → a duplicate
    // instance for that repo may start on 5175. Rare, harmless. Upgrade = sweep
    // 5173-5180.
    const DASH_PORT = 5173
    try {
      const res = await fetch(`http://localhost:${DASH_PORT}/api/tree`, { signal: AbortSignal.timeout(500) })
      const body = res.ok ? await res.json().catch(() => null) : null
      if (body && typeof body.ok === 'boolean' && body.hostRoot === hostRoot) {
        console.log(`roadmapped dashboard: already open → http://localhost:${DASH_PORT}/`)
        process.exit(0)
      }
    } catch { /* nothing listening (or another app) → we start normally */ }
    let viteBin
    try {
      // 'vite/bin/vite.js' is not an exported subpath: we resolve package.json
      // (which is exported) then the bin field — robust to npm/pnpm hoisting.
      const vitePkg = createRequire(join(packageDir, 'package.json')).resolve('vite/package.json')
      const { bin } = JSON.parse((await import('node:fs')).readFileSync(vitePkg, 'utf8'))
      viteBin = join(dirname(vitePkg), typeof bin === 'string' ? bin : bin.vite)
    } catch {
      console.error('roadmapped dashboard: vite not found — run `npm install` in the host repo (roadmapped must be installed as a local dependency).')
      process.exit(1)
    }
    // Auto-open the browser (#152): --open by DEFAULT — "boom, the window opens".
    // --no-open (our escape hatch, absent from vite) is stripped before passing the
    // args to vite; an explicit --open from the user is respected.
    const noOpen = rest.includes('--no-open')
    const cleanRest = rest.filter((a) => a !== '--no-open')
    const hasOpen = cleanRest.some((a) => a === '--open' || a.startsWith('--open='))
    const openArg = noOpen || hasOpen ? [] : ['--open']
    // cwd = host repo + ROADMAPPED_ROOT: the data (tasks/docs) is anchored to the
    // host; --config points at the package's vite.config.ts (root = package).
    const r = spawnSync(process.execPath, [viteBin, '--config', join(packageDir, 'vite.config.ts'), ...openArg, ...cleanRest], {
      stdio: 'inherit',
      cwd: hostRoot,
      env: { ...process.env, ROADMAPPED_ROOT: hostRoot },
    })
    process.exit(r.status ?? 1)
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
