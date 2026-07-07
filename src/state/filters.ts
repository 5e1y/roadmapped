import { usePersistentStrings } from './uiPersist'

/**
 * Filtres transverses des vues (header) — persistés et partagés entre
 * composants via le store uiPersist (useSyncExternalStore).
 */

/** Filtre team multi-sélection ([] = pas de filtre). */
export function useTeamFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:teams')
}
