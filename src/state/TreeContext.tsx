import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { TaskTree } from '../lib/tasks'
import { diffTrees, type TreeDiff } from '../lib/treeDiff'
import { seedSeenBaseline } from './seenTasks'

export interface TreeState {
  tree: TaskTree | null
  errors: string[]
  /** Nom du repo hôte servi (basename du hostRoot, #204) — affiché dans le
      header pour distinguer plusieurs dashboards ouverts. null tant qu'inconnu
      (avant 1er /api/tree, ou build démo statique sans ce champ). */
  repoName: string | null
  /** MAJ disponible (#211) : SHA installé vs dernier de main + repo GitHub de
      distribution. null = à jour / indéterminable / clone de dev / build démo. */
  update: { installed: string; remote: string; repo: string } | null
  loading: boolean
  loadError: string | null
  reload: (opts?: { silent?: boolean }) => Promise<void>
  /** Diff du dernier resync (#147, Live 2). `seq` monotone : change à chaque resync
      porteur d'un diff non vide — les couches UX (console, toasts) réagissent dessus. */
  lastChange: { seq: number; diff: TreeDiff } | null
}

/** Exporté pour les tests : injecter un tree sans passer par le fetch de TreeProvider. */
export const TreeContext = createContext<TreeState | null>(null)

/**
 * Décide si un event SSE `change` doit déclencher un resync du tree (#367).
 *
 * Le serveur envoie `event.data` = JSON `{ paths: [...] }` (cf. `broadcast()`
 * dans src/server/api.ts : `JSON.stringify({ paths: [...pending] })`). Les
 * chemins viennent de `fs.watch` et sont RELATIFS au dir surveillé, donc PAS
 * forcément préfixés `docs/tasks/` :
 *  - écriture d'un ticket → `NN-xxx/123.yaml` (watch de tasksDir=`docs/tasks`) ET
 *    `tasks/NN-xxx/123.yaml` (watch récursif de docsDir=`docs`), même salve.
 *  - régénération Graphify → `graph.json`, `wiki/…`, `GRAPH_REPORT.md`
 *    (watch de graphify-out/) — ne touche AUCUN ticket.
 *  - note → `notes/foo.md` (watch de docsDir).
 *
 * Fail-safe : payload absent / JSON malformé / `paths` non exploitable → on
 * RECHARGE (mieux vaut un reload de trop qu'un tree périmé — exigence #1 :
 * ne JAMAIS rater une vraie écriture de ticket). On ne supprime le reload que
 * si on peut prouver qu'AUCUN chemin ne concerne les tâches.
 *
 * Signal « tâche » : un chemin contient `tasks/` OU se termine par `.yaml`/`.yml`.
 * Les fichiers de tâches sont les SEULS `.yaml` de l'arbre surveillé (vérifié),
 * donc l'extension reste fiable même sur la forme relative à tasksDir sans préfixe.
 */
export function shouldReload(data: string | null | undefined): boolean {
  if (!data) return true // fail-safe : pas de payload → on recharge
  let paths: unknown
  try {
    paths = (JSON.parse(data) as { paths?: unknown }).paths
  } catch {
    return true // fail-safe : JSON malformé
  }
  if (!Array.isArray(paths) || paths.length === 0) return true // fail-safe : rien d'exploitable
  return paths.some((p) => {
    if (typeof p !== 'string') return true // élément inattendu → fail-safe
    const norm = p.replace(/\\/g, '/').toLowerCase()
    return norm.includes('tasks/') || norm.endsWith('.yaml') || norm.endsWith('.yml')
  })
}

export function TreeProvider({ children }: { children: ReactNode }) {
  const [tree, setTree] = useState<TaskTree | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [repoName, setRepoName] = useState<string | null>(null)
  const [update, setUpdate] = useState<{ installed: string; remote: string; repo: string } | null>(null)
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
      const data = (await r.json()) as {
        ok: boolean; tree?: TaskTree; errors?: string[]; repoName?: string
        update?: { installed: string; remote: string } | null; updateRepo?: string
      }
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
      if (typeof data.repoName === 'string' && data.repoName) setRepoName(data.repoName)
      setUpdate(
        data.update && data.updateRepo
          ? { installed: data.update.installed, remote: data.update.remote, repo: data.updateRepo }
          : null,
      )
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
  // `change`, resync silencieux SI l'event touche un ticket (#367 : on filtre sur
  // `event.data.paths` pour éviter de recharger ~630 Ko sur une régénération
  // Graphify ou une écriture de note — cf. shouldReload, fail-safe = recharger).
  // Garde : pas d'EventSource sous jsdom (tests) ni sur le build démo statique.
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    if ((window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__) return
    const es = new EventSource('/api/events')
    es.addEventListener('change', (ev) => {
      if (shouldReload((ev as MessageEvent).data)) void reload({ silent: true })
    })
    return () => es.close()
  }, [reload])

  return (
    <TreeContext.Provider value={{ tree, errors, repoName, update, loading, loadError, reload, lastChange }}>
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
