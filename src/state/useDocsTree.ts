import { useCallback, useEffect, useState } from 'react'
// Type-only import : erasé au build, ne fait jamais entrer node:fs dans le
// bundle client (même convention que `TreeContext.tsx` avec `lib/tasks`).
import type { DocNode } from '../server/docs'

export interface DocsTreeState {
  tree: DocNode[] | null
  loading: boolean
  loadError: string | null
}

/** Charge l'arbre docs une fois (GET /api/docs). Lecture seule, pas de reload exposé (rien à muter en phase 3). */
export function useDocsTree(): DocsTreeState {
  const [tree, setTree] = useState<DocNode[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const r = await fetch('/api/docs')
      const data = (await r.json()) as { ok: boolean; tree?: DocNode[]; errors?: string[] }
      if (!r.ok || data.ok === false) {
        setLoadError(data.errors?.length ? data.errors.join(' · ') : `HTTP ${r.status}`)
        return
      }
      setTree(data.tree ?? [])
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { tree, loading, loadError }
}
