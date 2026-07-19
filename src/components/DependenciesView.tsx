import { ViewShell } from './ViewHeader'
import { RoadmapGraph } from './RoadmapGraph'
import { TreeStateGuard } from './ui'

/**
 * Vue Dépendances = le graphe de flux de dépendances (dagre, prérequis →
 * dépendant), promu en vue de 1er niveau (#369, ex-Roadmap>Graph). La bande
 * d'epics-filtre (#343) est conservée ; le filtre epic est porté par App et
 * PARTAGÉ avec la Roadmap (la sélection survit au changement de vue).
 *
 * showDone=false figé (#342) — le graphe garde tout de même les done qui sont
 * dépendances transitives de tickets affichés (arêtes intègres).
 *
 * États : même garde PARTAGÉE que la Roadmap et le Backlog (`TreeStateGuard`,
 * #384), rendue sous le header commun (`ViewShell`) — plus de header qui saute.
 */
export function DependenciesView({ epicFilter, onEpicFilter }: {
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  return (
    <ViewShell>
      <TreeStateGuard>
        <div className="min-h-0 flex-1 overflow-auto">
          <RoadmapGraph showDone={false} epicFilter={epicFilter} onEpicFilter={onEpicFilter} />
        </div>
      </TreeStateGuard>
    </ViewShell>
  )
}
