import { usePersistentStrings } from './uiPersist'

/**
 * Filtres transverses des vues (header) — persistés et partagés entre
 * composants via le store uiPersist (useSyncExternalStore).
 */

/**
 * Filtre tag ([] = pas de filtre) — posé par le graphe de liens des tags
 * (#146) : tag = de quoi parle le travail.
 */
export function useTagFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:tags')
}
