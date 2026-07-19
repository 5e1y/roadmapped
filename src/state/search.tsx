import { createContext, useContext, type ReactNode } from 'react'

/**
 * Recherche GLOBALE (#395, décision Rémi) : la barre de recherche vit dans le
 * header commun de TOUTES les vues (centrée). La requête est portée par App et
 * partagée ici → le Backlog la consomme pour filtrer. Cliquer/taper dans la barre
 * ramène à la vue Backlog (le seul écran qui filtre). NON-JETANT (défaut inerte)
 * pour que le ViewHeader monte hors provider dans les tests.
 */
interface SearchState {
  query: string
  setQuery: (q: string) => void
}

const SearchContext = createContext<SearchState | null>(null)

export function SearchProvider({ query, setQuery, children }: SearchState & { children: ReactNode }) {
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>
}

/** Défaut inerte hors provider (tests) : la barre s'affiche mais ne filtre rien. */
const INERT: SearchState = { query: '', setQuery: () => {} }

export function useSearch(): SearchState {
  return useContext(SearchContext) ?? INERT
}
