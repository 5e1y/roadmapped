import { describe, it, expect } from 'vitest'
import { createServer } from 'node:http'
import { listenWithRetry } from './serve'

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
