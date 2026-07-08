import { usePersistentStrings } from './uiPersist'

/**
 * Filtres transverses des vues (header) — persistés et partagés entre
 * composants via le store uiPersist (useSyncExternalStore).
 */

/** Filtre team multi-sélection ([] = pas de filtre). */
export function useTeamFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:teams')
}

/**
 * Filtre tag ([] = pas de filtre) — posé par le graphe de liens des tags
 * (#146), symétrique du filtre team. Les deux se CUMULENT (ET logique) :
 * team = qui porte le travail, tag = de quoi il parle — croiser les deux
 * axes est précisément l'intérêt d'avoir deux visualisations.
 */
export function useTagFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:tags')
}
