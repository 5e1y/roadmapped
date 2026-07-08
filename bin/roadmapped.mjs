#!/usr/bin/env node
// Dispatcher du paquet roadmapped — seul point d'entrée publié (spec
// 2026-07-08-distribution, §2). Trois familles de verbes :
//   init / upgrade  → plomberie d'installation dans le repo hôte (scripts/install.mjs)
//   dashboard       → Vite (dev) depuis le PAQUET, données ancrées sur le repo HÔTE
//   tout le reste   → proxy transparent vers scripts/task.mjs (CLI portable :
//                     `npx roadmapped done 42` marche dans n'importe quel repo)
//
// AUCUN import statique de .ts ici : on vérifie d'abord la version de Node
// (strip-types natif requis — décision verrouillée : on ship les .ts bruts),
// pour échouer avec un message clair plutôt qu'un SyntaxError cryptique.

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `roadmapped requiert Node >= 22.18 (imports TypeScript natifs, strip-types) — version détectée : ${process.versions.node}.`,
  )
  process.exit(1)
}

const { spawnSync } = await import('node:child_process')
const { fileURLToPath, pathToFileURL } = await import('node:url')
const { dirname, join, resolve } = await import('node:path')
const { createRequire } = await import('node:module')

// Racine du PAQUET (où vit ce bin) — PAS le repo hôte (= cwd remonté, cf. paths.ts).
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [cmd, ...rest] = process.argv.slice(2)

const importPkg = (rel) => import(pathToFileURL(join(packageDir, rel)).href)

// Node refuse de stripper les types sous node_modules : on enregistre le loader
// amaro AVANT tout import de .ts (voir scripts/register-ts.mjs). Les sous-processus
// (proxy task.mjs) reçoivent le même loader via --import.
const registerTs = join(packageDir, 'scripts', 'register-ts.mjs')
await import(pathToFileURL(registerTs).href)
const nodeTs = (script, args) => [
  '--import', registerTs, join(packageDir, 'scripts', script), ...args,
]

const USAGE = `Usage : roadmapped <commande>

Plomberie (repo hôte) :
  init       installe Roadmapped dans le repo courant (config, squelette 8 stages,
             skill .claude/, entrée .mcp.json, hook guard chaîné) — idempotent
  upgrade    met à jour les fichiers de l'outil (skill, MCP, hook) —
             ne touche JAMAIS docs/tasks/ ni roadmapped.config.json
  dashboard  lance le dashboard (Vite dev + API d'écriture) sur le repo courant

Toute autre commande est proxifiée vers le CLI de gestion des tâches :`

switch (cmd) {
  case 'init':
  case 'upgrade': {
    const { runInit, runUpgrade } = await importPkg('scripts/install.mjs')
    ;(cmd === 'init' ? runInit : runUpgrade)()
    break
  }

  case 'dashboard': {
    // Idempotent (#153) : si NOTRE dashboard répond déjà sur le port par défaut,
    // ne pas relancer une 2e instance — no-op + URL. On sonde /api/tree et on
    // vérifie la forme { ok: … } : un autre serveur (le projet de l'hôte) sur le
    // même port ne matche pas, on laisse alors vite démarrer (et auto-incrémenter).
    // ponytail: sonde le port 5173 seul (le foyer du dashboard) ; s'il a migré sur
    // 5174 à un lancement précédent, la détection le rate — plafond assumé.
    const DASH_PORT = 5173
    try {
      const res = await fetch(`http://localhost:${DASH_PORT}/api/tree`, { signal: AbortSignal.timeout(500) })
      const body = res.ok ? await res.json().catch(() => null) : null
      if (body && typeof body.ok === 'boolean') {
        console.log(`roadmapped dashboard : déjà ouvert → http://localhost:${DASH_PORT}/`)
        process.exit(0)
      }
    } catch { /* rien n'écoute (ou autre appli) → on démarre normalement */ }
    const { findHostRoot } = await importPkg('src/lib/paths.ts')
    const envRoot = process.env.ROADMAPPED_ROOT
    const hostRoot = envRoot && envRoot.trim() !== '' ? resolve(envRoot) : findHostRoot()
    let viteBin
    try {
      // 'vite/bin/vite.js' n'est pas un subpath exporté : on résout package.json
      // (exporté, lui) puis le champ bin — robuste au hoisting npm/pnpm.
      const vitePkg = createRequire(join(packageDir, 'package.json')).resolve('vite/package.json')
      const { bin } = JSON.parse((await import('node:fs')).readFileSync(vitePkg, 'utf8'))
      viteBin = join(dirname(vitePkg), typeof bin === 'string' ? bin : bin.vite)
    } catch {
      console.error('roadmapped dashboard : vite introuvable — lance `npm install` dans le repo hôte (roadmapped doit être installé en dépendance locale).')
      process.exit(1)
    }
    // Ouverture auto du navigateur (#152) : --open par DÉFAUT — « boum la fenêtre
    // s'ouvre ». --no-open (notre échappatoire, absent de vite) est retiré avant
    // de passer les args à vite ; un --open explicite de l'utilisateur est respecté.
    const noOpen = rest.includes('--no-open')
    const cleanRest = rest.filter((a) => a !== '--no-open')
    const hasOpen = cleanRest.some((a) => a === '--open' || a.startsWith('--open='))
    const openArg = noOpen || hasOpen ? [] : ['--open']
    // cwd = repo hôte + ROADMAPPED_ROOT : les données (tasks/docs) s'ancrent sur
    // l'hôte ; --config pointe le vite.config.ts du paquet (root = paquet).
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
    // Puis l'usage du CLI de tâches lui-même (source unique : task.mjs).
    const r = spawnSync(process.execPath, nodeTs('task.mjs', cmd ? [cmd] : []), { stdio: 'inherit' })
    process.exit(r.status ?? 0)
  }

  default: {
    // Proxy transparent : `roadmapped <verbe>` = `node <paquet>/scripts/task.mjs <verbe>`.
    // Le cwd est conservé — task.mjs ancre ses données sur le repo hôte via loadPaths().
    const r = spawnSync(process.execPath, nodeTs('task.mjs', [cmd, ...rest]), { stdio: 'inherit' })
    process.exit(r.status ?? 1)
  }
}
