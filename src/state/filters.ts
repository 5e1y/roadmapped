import { usePersistentStrings } from './uiPersist'

/**
 * Filtres transverses des vues (header) — persistés et partagés entre
 * composants via le store uiPersist (useSyncExternalStore).
 */

/** Filtre team multi-sélection ([] = pas de filtre). */
export function useTeamFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:teams')
}

/** Filtre stage du Backlog ('' = tous). */
export function useStageFilter(): [string, (next: string) => void] {
  const [arr, setArr] = usePersistentStrings('filter:stage')
  return [arr[0] ?? '', (next) => setArr(next ? [next] : [])]
}
