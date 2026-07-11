import { useCallback, useEffect, useState } from 'react'
// Type-only : effacé au build, ne fait pas entrer node:fs (server/kb) dans le
// bundle client (même convention que useDocsTree avec DocNode).
import type { KbGraph } from '../server/kb'

export interface KbGraphState {
  /** null = graphe pas encore généré (empty state pédagogique). */
  graph: KbGraph | null
  /** Racine absolue du repo hôte — pour révéler un fichier code (reveal). */
  root: string | null
  loading: boolean
  /** Erreur réseau OU graph.json illisible (422). */
  error: string | null
}

/** Charge le graphe Graphify une fois (GET /api/kb). Lecture seule (phase 1). */
export function useKbGraph(): KbGraphState {
  const [graph, setGraph] = useState<KbGraph | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch('/api/kb')
      const data = (await r.json()) as { ok: boolean; graph?: KbGraph | null; root?: string; errors?: string[] }
      if (!r.ok || data.ok === false) {
        setError(data.errors?.length ? data.errors.join(' · ') : `HTTP ${r.status}`)
        return
      }
      setGraph(data.graph ?? null)
      setRoot(typeof data.root === 'string' ? data.root : null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return { graph, root, loading, error }
}
