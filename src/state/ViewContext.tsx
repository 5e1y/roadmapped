import { createContext, useContext, type ReactNode } from 'react'

// 6 vues de 1er niveau (#369) : le graphe de dépendances (ex-Roadmap>Graph) et le
// graphe nodal KB (ex-Docs>KB) sont promus hors de leurs sous-modes. Roadmap = les
// colonnes seules ; Docs = les documents seuls.
export type View = 'backlog' | 'roadmap' | 'dependencies' | 'graph' | 'docs' | 'notepad'

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
