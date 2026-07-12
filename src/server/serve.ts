import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, sep, extname, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { loadPaths, packageRoot } from '../lib/paths.ts'
import { createApiMiddleware } from './api.ts'

// Serveur du dashboard EN PROD (#200) : remplace le `vite dev` que lançait
// `roadmapped dashboard`. Sert le build STATIQUE (dist/) + monte l'API d'écriture
// (le même middleware Node qu'en dev, cf. api.ts) — zéro dépendance, node:http nu.
// L'hôte n'a donc plus react/vite/tailwind : ils n'ont servi qu'à FABRIQUER dist/.

const CONTENT_TYPE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
}

/** Sert un fichier de dist/ (statique). Anti-traversal, content-type, cache, fallback SPA. */
function serveStatic(distDir: string, req: IncomingMessage, res: ServerResponse): void {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }
  let pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  if (pathname === '/') pathname = '/index.html'

  // Anti-traversal : le chemin résolu doit rester SOUS distDir (même discipline
  // qu'unsafeDocPath). Un `../` qui s'échappe → 403.
  const resolved = resolve(distDir, '.' + pathname)
  if (resolved !== distDir && !resolved.startsWith(distDir + sep)) {
    res.statusCode = 403
    res.end('Forbidden')
    return
  }

  const send = (file: string, status: number) => {
    const ext = extname(file)
    res.statusCode = status
    res.setHeader('Content-Type', CONTENT_TYPE[ext] ?? 'application/octet-stream')
    // Les assets sont hashés par Rollup (immutable) ; index.html doit être revu à
    // chaque reload (un upgrade du paquet change les assets référencés).
    res.setHeader(
      'Cache-Control',
      pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    )
    res.end(method === 'HEAD' ? undefined : readFileSync(file))
  }

  if (existsSync(resolved) && statSync(resolved).isFile()) {
    send(resolved, 200)
    return
  }
  // Fallback SPA : une route « profonde » sans extension → index.html (l'app route
  // côté client). Un asset manquant (avec extension) → vrai 404.
  if (!pathname.slice(1).includes('.')) {
    send(join(distDir, 'index.html'), 200)
    return
  }
  res.statusCode = 404
  res.end('Not Found')
}

/** listen avec auto-incrément de port sur EADDRINUSE (ce que Vite offrait). Exporté pour #274. */
export function listenWithRetry(
  server: ReturnType<typeof createServer>, start: number, max: number,
): Promise<number> {
  return new Promise((resolvePort, reject) => {
    // ⚠️ NE PAS utiliser le callback de server.listen(port, cb) : ce callback reste
    // attaché comme listener 'listening' même quand le port échoue (EADDRINUSE), et se
    // déclenche au bind RÉUSSI du port suivant → on annoncerait le mauvais port (#274).
    // On gère 'listening'/'error' à la main (once + retrait explicite) et on lit le port
    // RÉELLEMENT lié via server.address().
    const tryPort = (port: number) => {
      const onListening = () => {
        server.removeListener('error', onError)
        const addr = server.address()
        resolvePort(typeof addr === 'object' && addr ? addr.port : port)
      }
      const onError = (e: NodeJS.ErrnoException) => {
        server.removeListener('listening', onListening)
        if (e.code === 'EADDRINUSE' && port < max) {
          tryPort(port + 1)
        } else if (e.code === 'EADDRINUSE') {
          reject(new Error(
            `Ports ${start}-${max} tous occupés (11 dashboards ouverts ?). ` +
            `Fermez-en un, ou passez --port.`,
          ))
        } else reject(e)
      }
      server.once('listening', onListening)
      server.once('error', onError)
      server.listen(port, 'localhost')
    }
    tryPort(start)
  })
}

/** Ouvre l'URL dans le navigateur par défaut (best-effort, erreurs avalées). */
function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch { /* pas de navigateur : l'URL est affichée de toute façon */ }
}

/**
 * Démarre le dashboard en prod : sert dist/ + l'API, ouvre le navigateur.
 * `ROADMAPPED_ROOT` (posé par le bin avant l'import) est lu par loadPaths().
 */
export async function startDashboard(opts: { open: boolean; port?: number }): Promise<void> {
  const paths = loadPaths()
  const distDir = join(packageRoot(), 'dist')
  if (!existsSync(join(distDir, 'index.html'))) {
    console.error(
      'roadmapped dashboard: build manquant (dist/index.html absent).\n' +
      '  - Install cassée → réinstallez roadmapped.\n' +
      '  - Clone de dev → lancez `npm run dev` (hot-reload), ou `npm run build` puis relancez.',
    )
    process.exit(1)
  }

  // Auto-shutdown à la fermeture de la fenêtre (#330) : le dashboard est un serveur
  // LOCAL adossé à un navigateur — il ne doit pas survivre en zombie pendant des jours.
  // Le SSE /api/events (api.ts) sait exactement combien d'onglets sont ouverts. Quand
  // le dernier se ferme, on arme un délai de grâce puis on s'arrête. La grâce absorbe
  // un reload/navigation (l'onglet se reconnecte < 1s) sans faux positif ; on ne s'arme
  // qu'APRÈS qu'un onglet a existé, donc jamais avant que le navigateur ait chargé.
  // ponytail: plafond = un sleep OS > grâce peut couper le socket et arrêter le serveur
  //   pendant que l'onglet dort ; au réveil l'EventSource échoue son reconnect. Acceptable
  //   (le but est justement de ne pas tourner des jours) ; bump GRACE_MS si ça gêne.
  const GRACE_MS = 5000
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const api = createApiMiddleware(paths, {
    onClientCountChange: (openTabs) => {
      if (openTabs > 0) {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
        return
      }
      idleTimer = setTimeout(() => {
        console.log('roadmapped dashboard: fenêtre fermée — arrêt du serveur (port libéré).')
        process.exit(0)
      }, GRACE_MS)
    },
  })
  const server = createServer((req, res) => {
    // L'API d'abord (elle next() tout ce qui n'est pas /api/*), le statique ramasse
    // le reste — même ordre de priorité qu'en dev sous Vite.
    api(req, res, () => serveStatic(distDir, req, res))
  })

  const start = opts.port ?? 5173
  const port = await listenWithRetry(server, start, start + 10)
  const url = `http://localhost:${port}/`
  console.log(`roadmapped dashboard: ${url}  (${basename(paths.root)})`)
  if (opts.open) openBrowser(url)
}
