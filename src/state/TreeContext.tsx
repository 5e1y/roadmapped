import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { TaskTree } from '../lib/tasks'

export interface TreeState {
  tree: TaskTree | null
  errors: string[]
  loading: boolean
  loadError: string | null
  reload: () => Promise<void>
}

const TreeContext = createContext<TreeState | null>(null)

export function TreeProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TaskTree | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const r = await fetch('/api/tree')
      if (!r.ok) {
        setLoadError(`HTTP ${r.status}`)
        return
      }
      const data = (await r.json()) as { ok: boolean; tree?: TaskTree; errors?: string[] }
      if (data.ok === false) {
        setLoadError(
          data.errors?.length
            ? `Erreur API : ${data.errors.join(' · ')}`
            : 'Réponse API invalide (ok: false sans détail)',
        )
        return
      }
      if (!data.tree) {
        setLoadError('Réponse API invalide : tree manquant')
        return
      }
      setTree(data.tree)
      setErrors(data.errors ?? [])
    } catch (e) {
      setLoadError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <TreeContext.Provider value={{ tree, errors, loading, loadError, reload }}>
      {children}
    </TreeContext.Provider>
  )
}

export function useTree(): TreeState {
  const ctx = useContext(TreeContext)
  if (!ctx) throw new Error('useTree doit être utilisé dans <TreeProvider>')
  return ctx
}

/** Variante non-jetante pour les feuilles (TaskRow) rendues aussi hors provider
    (tests unitaires) : renvoie le tree si présent, sinon null. */
export function useOptionalTree(): TaskTree | null {
  return useContext(TreeContext)?.tree ?? null
}
