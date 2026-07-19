import { ViewShell } from './ViewHeader'
import { KbView } from './KbView'

/**
 * Vue Graphe = le graphe nodal du knowledge base (Graphify), promu en vue de
 * 1er niveau (#369, ex-Docs>KB). KbView ne rend pas son propre header — ce
 * wrapper l'encadre du header commun (`ViewShell`, #384), canvas plein comme
 * l'ex-mode KB de Docs. Les états de KbView (loading/erreur/vide) restent SOUS
 * ce header.
 */
export function GraphView() {
  return (
    <ViewShell>
      <div className="min-h-0 flex-1"><KbView /></div>
    </ViewShell>
  )
}
