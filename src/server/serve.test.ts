import { describe, it, expect } from 'vitest'
import { createServer, get as httpGet } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listenWithRetry } from './serve'
import { createApiMiddleware } from './api'

// Régression #274 : quand un port est pris, listenWithRetry doit sauter au suivant
// ET annoncer le port RÉELLEMENT lié (le bug annonçait le port échoué).
describe('listenWithRetry (#274)', () => {
  it('saute un port occupé et renvoie le port réellement lié', async () => {
    const base = 5991
    const blocker = createServer()
    await new Promise<void>((r) => blocker.listen(base, 'localhost', r))
    const s = createServer()
    try {
      const port = await listenWithRetry(s, base, base + 5)
      const real = (s.address() as { port: number }).port
      expect(port).not.toBe(base)   // le port occupé a été sauté
      expect(port).toBe(real)       // L'INVARIANT #274 : annoncé == réellement lié
    } finally {
      await new Promise((r) => s.close(r))
      await new Promise((r) => blocker.close(r))
    }
  })

  it('rejette quand toute la plage est occupée', async () => {
    const base = 5997
    const b1 = createServer(); const b2 = createServer()
    await new Promise<void>((r) => b1.listen(base, 'localhost', r))
    await new Promise<void>((r) => b2.listen(base + 1, 'localhost', r))
    const s = createServer()
    try {
      await expect(listenWithRetry(s, base, base + 1)).rejects.toThrow(/occup/)
    } finally {
      await new Promise((r) => b1.close(r))
      await new Promise((r) => b2.close(r))
    }
  })
})

// Auto-shutdown à la fermeture de la fenêtre (#330) : le signal de vie exact est le
// nombre de connexions SSE /api/events. On vérifie le CONTRAT que startDashboard
// consomme — 1 à la connexion, 0 à la fermeture de l'onglet — sans piloter
// process.exit lui-même (le timer de grâce de serve.ts se branche dessus).
describe("dashboard auto-shutdown : onClientCountChange suit les onglets ouverts (#330)", () => {
  const waitFor = async (pred: () => boolean, ms = 2000) => {
    const deadline = Date.now() + ms
    while (!pred()) {
      if (Date.now() > deadline) throw new Error('timeout')
      await new Promise((r) => setTimeout(r, 10))
    }
  }

  it('connexion SSE → 1, fermeture de l’onglet → 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-shutdown-'))
    mkdirSync(join(dir, 'docs', 'tasks'), { recursive: true })
    const paths = {
      root: dir, tasksDir: join(dir, 'docs', 'tasks'),
      docsDir: join(dir, 'docs'), kbGraphFile: join(dir, 'graphify-out', 'graph.json'),
    }
    const counts: number[] = []
    const api = createApiMiddleware(paths, { onClientCountChange: (n) => counts.push(n) })
    const server = createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end() }))
    const port = await listenWithRetry(server, 5981, 5986)
    try {
      // Un onglet ouvre le flux SSE (comme TreeContext le fait au montage).
      const clientReq = httpGet({ host: 'localhost', port, path: '/api/events' })
      await new Promise<void>((r, j) => { clientReq.on('response', () => r()); clientReq.on('error', j) })
      await waitFor(() => counts.at(-1) === 1)   // serveur : 1 onglet vivant

      clientReq.destroy()                        // l'utilisateur ferme la fenêtre
      await waitFor(() => counts.at(-1) === 0)   // serveur : plus personne → grâce puis exit
      expect(counts.at(-1)).toBe(0)
    } finally {
      await new Promise((r) => server.close(r))
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
