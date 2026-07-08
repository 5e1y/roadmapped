import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TaskTree } from '../lib/tasks'
import { diffTrees, type TreeDiff } from '../lib/treeDiff'
import { seedSeenBaseline } from './seenTasks'

export interface TreeState {
  tree: TaskTree | null
  errors: string[]
  loading: boolean
  loadError: string | null
  reload: (opts?: { silent?: boolean }) => Promise<void>
  /** Diff du dernier resync (#147, Live 2). `seq` monotone : change à chaque resync
      porteur d'un diff non vide — les couches UX (console, toasts) réagissent dessus. */
  lastChange: { seq: number; diff: TreeDiff } | null
}

const TreeContext = createContext<TreeState | null>(null)

export function TreeProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TaskTree | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [lastChange, setLastChange] = useState<{ seq: number; diff: TreeDiff } | null>(null)
  const prevTreeRef = useRef<TaskTree | null>(null)
  const seqRef = useRef(0)

  const reload = useCallback(async (opts?: { silent?: boolean }) => {
    // Live reactivity (#147) : un resync live (SSE) est SILENCIEUX — pas de bascule
    // `loading` qui ferait clignoter les vues à chaque écriture de l'agent.
    if (!opts?.silent) setLoading(true)
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
      // Diff prev/next (#147, Live 2) : compare au dernier tree appliqué. Le montage
      // initial (prev null) ne produit pas de diff — pas d'événements « au démarrage ».
      const prev = prevTreeRef.current
      if (prev) {
        const diff = diffTrees(prev, data.tree)
        if (diff.statusChanges.length || diff.appeared.length || diff.removed.length || diff.edited.length) {
          seqRef.current += 1
          setLastChange({ seq: seqRef.current, diff })
        }
      }
      prevTreeRef.current = data.tree
      seedSeenBaseline(data.tree) // #147 Live 5 : baseline « tout vu » au 1er run (idempotent)
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

  // Live reactivity (#147) : s'abonner au flux SSE du serveur ; à chaque signal
  // `change` (une écriture sur docs/tasks ou docs), resync silencieux. Garde :
  // pas d'EventSource sous jsdom (tests) ni sur le build démo statique.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    if ((window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__) return
    const es = new EventSource('/api/events')
    es.addEventListener('change', () => { void reload({ silent: true }) })
    return () => es.close()
  }, [reload])

  return (
    <TreeContext.Provider value={{ tree, errors, loading, loadError, reload, lastChange }}>
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

/** Variante non-jetante COMPLÈTE (tree + reload) — pour les feuilles qui
    écrivent (renommage d'epic, #140) tout en restant montables hors provider
    dans les tests : null hors provider. */
export function useOptionalTreeState(): TreeState | null {
  return useContext(TreeContext)
}
