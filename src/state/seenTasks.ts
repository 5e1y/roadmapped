import type { TaskNode, TaskTree } from '../lib/tasks'
import { flattenTasks } from '../lib/treeDiff'
import {
  readPersistentStrings, setPersistentStrings, usePersistentStrings,
} from './uiPersist'

/*
 * Badges NEW / non-lu (#147, Live 5). Un ticket est NEW s'il est apparu ou a
 * changé depuis que l'utilisateur l'a vu pour la dernière fois. « Vu » = un set
 * d'empreintes `${id}:${updatedAt|createdAt}` persisté (localStorage, par appareil
 * — pas de compte, local-first). Effacé en ouvrant le panneau du ticket.
 *
 * Baseline : au tout premier run (INIT jamais posé), on marque TOUT comme vu —
 * sinon l'app afficherait « NEW » sur l'intégralité du backlog. Seuls les
 * changements POSTÉRIEURS à cette baseline deviennent NEW.
 */
const SEEN = 'roadmapped:seenTasks'
const INIT = 'roadmapped:seenInit'

const stampOf = (t: Pick<TaskNode, 'id' | 'updatedAt' | 'createdAt'>): string =>
  `${t.id}:${t.updatedAt ?? t.createdAt ?? ''}`

/** Pose la baseline une seule fois : tout le tree courant = déjà vu. */
export function seedSeenBaseline(tree: TaskTree): void {
  if (readPersistentStrings(INIT).length > 0) return
  setPersistentStrings(SEEN, [...flattenTasks(tree).values()].map(stampOf))
  setPersistentStrings(INIT, ['1'])
}

/** Marque un ticket comme vu (empreinte courante) — appelé à l'ouverture du panneau. */
export function markTaskSeen(task: Pick<TaskNode, 'id' | 'updatedAt' | 'createdAt'>): void {
  const kept = readPersistentStrings(SEEN).filter((e) => !e.startsWith(`${task.id}:`))
  setPersistentStrings(SEEN, [...kept, stampOf(task)])
}

/**
 * Hook réactif : `isNew(task)` reflète le set vu persisté (le badge se retire dès
 * que markTaskSeen réécrit SEEN). usePersistentStrings(SEEN) fournit la réactivité ;
 * la baseline pose SEEN et INIT ensemble, donc lire INIT à chaque render suffit
 * (le changement de SEEN déclenche le re-render où INIT est déjà vrai).
 */
export function useSeenTasks(): { isNew: (t: Pick<TaskNode, 'id' | 'updatedAt' | 'createdAt'>) => boolean } {
  const [seen] = usePersistentStrings(SEEN)
  const inited = readPersistentStrings(INIT).length > 0
  const seenSet = new Set(seen)
  return { isNew: (t) => inited && !seenSet.has(stampOf(t)) }
}
