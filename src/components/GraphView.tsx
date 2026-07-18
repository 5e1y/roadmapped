import { ViewHeader } from './ViewHeader'
import { KbView } from './KbView'

/**
 * Vue Graphe = le graphe nodal du knowledge base (Graphify), promu en vue de
 * 1er niveau (#369, ex-Docs>KB). KbView ne rend pas son propre header — ce
 * wrapper l'encadre du header commun, canvas plein comme l'ex-mode KB de Docs.
 */
export function GraphView() {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader />
      <div className="min-h-0 flex-1"><KbView /></div>
    </div>
  )
}
