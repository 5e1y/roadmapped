/**
 * Événements DOM inter-composants. L'état vue/doc vit dans App, le panneau de
 * tâche est monté ailleurs dans l'arbre : la navigation passe par un CustomEvent
 * plutôt que du prop-drilling. La constante partagée évite les littéraux
 * désynchronisés (le bug historique `roadmaped:` vs `roadmapped:`, audit #109).
 */

/** Naviguer vers la Vue Docs — detail = chemin du doc relatif à docsDir. */
export const OPEN_DOC_EVENT = 'roadmapped:open-doc'
