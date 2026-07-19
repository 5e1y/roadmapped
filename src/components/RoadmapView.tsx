import { ViewShell } from './ViewHeader'
import { TreeStateGuard } from './ui'
import { RoadmapColumns } from './RoadmapColumns'

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne par
 * section, ordre de priorité NN). Depuis #369, colonnes SEULEMENT : le graphe de
 * dépendances est devenu la vue « Dépendances » de 1er niveau (DependenciesView).
 *
 * Tickets terminés MASQUÉS (#342, showDone=false figé). Filtre epic (#343) : porté
 * par App et PARTAGÉ avec la vue Dépendances via props — la sélection survit au
 * passage Roadmap ↔ Dépendances (état de session, pas persisté).
 *
 * États (chargement / serveur mort / validation) : la garde PARTAGÉE
 * `TreeStateGuard` (ui.tsx, #384) rend le corps sous le header — le header reste
 * toujours visible (ex-`RoadmapStateGuard`, qui l'enveloppait, le faisait sauter).
 */
export function RoadmapView({ epicFilter, onEpicFilter }: {
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  return (
    <ViewShell>
      <TreeStateGuard>
        <div className="min-h-0 flex-1 overflow-auto">
          <RoadmapColumns showDone={false} epicFilter={epicFilter} onEpicFilter={onEpicFilter} />
        </div>
      </TreeStateGuard>
    </ViewShell>
  )
}
