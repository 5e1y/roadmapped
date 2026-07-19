import { createContext, useContext, type ReactNode } from 'react'

// 8 vues de 1er niveau. #369 a promu Dépendances (ex-Roadmap>Graph) et Graphe nodal
// (ex-Docs>KB). #372 ajoute Overview (toutes les visualisations, sorties du Backlog)
// et Activity (le feed, ex-overlay du header). Roadmap = colonnes seules ; Docs =
// documents seuls ; Backlog = liste pure.
export type View =
  | 'overview' | 'backlog' | 'roadmap' | 'dependencies'
  | 'graph' | 'activity' | 'docs' | 'notepad'

interface ViewState {
  view: View
  setView: (v: View) => void
}

const ViewContext = createContext<ViewState | null>(null)

/**
 * Vue courante partagée : l'état vit dans App (persisté), le header commun
 * (ViewHeader) porte les tabs de navigation — plus de sidebar (décision Rémi).
 */
export function ViewProvider({ view, setView, children }: ViewState & { children: ReactNode }) {
  return <ViewContext.Provider value={{ view, setView }}>{children}</ViewContext.Provider>
}

export function useView(): ViewState {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useView doit être utilisé dans <ViewProvider>')
  return ctx
}
