import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { warmKbLayout } from '../lib/kbLayoutCache'
// Type-only : effacé au build, ne fait pas entrer node:fs (server/kb) dans le bundle.
import type { KbGraph } from '../server/kb'

/**
 * Cache PARTAGÉ du graphe Graphify (#kb, phase 2). Remplace le hook local
 * useKbGraph qui refetchait à chaque montage (chaque TaskPanel) : un seul fetch,
 * partagé par la Vue KB, l'inspecteur de nœud et les TaskPanel.
 *
 * Live : réutilise le MÊME flux SSE `/api/events` que TreeContext (#147). Le
 * watcher serveur surveille désormais aussi graphify-out/ (api.ts). Un événement
 * portant graph.json → refetch ; un événement de corpus (tasks/docs) → marque le
 * graphe « peut-être obsolète » (staleness), sans refetch inutile.
 */
export interface KbState {
  /** null = graphe pas encore généré (empty state). */
  graph: KbGraph | null
  /** Racine absolue du repo hôte — pour révéler un fichier code (reveal). */
  root: string | null
  loading: boolean
  /** Erreur réseau OU graph.json illisible (422). */
  error: string | null
  /** Le corpus a changé depuis la génération du graphe → chip « obsolète ». */
  stale: boolean
  reload: () => Promise<void>
}

const DEFAULT: KbState = { graph: null, root: null, loading: false, error: null, stale: false, reload: async () => {} }
const KbContext = createContext<KbState | null>(null)

export function KbProvider({ children }: { children: ReactNode }) {
  const [graph, setGraph] = useState<KbGraph | null>(null)
  const [root, setRoot] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  const reload = useCallback(async () => {
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
      setStale(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Préchauffage (#308) : le layout force-directed de la vue par défaut coûte
  // ~550 ms sur le vrai graphe — on le calcule en tâche de fond DÉCOUPÉE dès
  // que le graphe est là. Ouvrir l'onglet KB tombe alors sur un cache chaud.
  useEffect(() => { if (graph) warmKbLayout(graph) }, [graph])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    if ((window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__) return
    const es = new EventSource('/api/events')
    es.addEventListener('change', (e) => {
      let paths: unknown[] = []
      try { paths = (JSON.parse((e as MessageEvent).data)?.paths ?? []) as unknown[] } catch { /* payload non-JSON */ }
      const graphChanged = paths.some((p) => typeof p === 'string' && p.endsWith('graph.json'))
      // graph.json régénéré → refetch ; corpus modifié → marquer obsolète (le chip
      // n'est de toute façon rendu que si un graphe existe).
      if (graphChanged) void reload()
      else setStale(true)
    })
    return () => es.close()
  }, [reload])

  return (
    <KbContext.Provider value={{ graph, root, loading, error, stale, reload }}>
      {children}
    </KbContext.Provider>
  )
}

/** Non-jetant (comme useOptionalTree) : hors provider (tests) → état vide neutre. */
export function useKb(): KbState {
  return useContext(KbContext) ?? DEFAULT
}
