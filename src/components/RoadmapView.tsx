import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { ViewHeader } from './ViewHeader'
import { RoadmapColumns } from './RoadmapColumns'

/**
 * Garde d'état partagé par la Roadmap et la vue Dépendances (#369) : ni l'une ni
 * l'autre ne doit être un écran vide muet quand le serveur est injoignable ou la
 * source invalide (mêmes garde-fous que le Backlog). Rend `children` une fois sain.
 */
export function RoadmapStateGuard({ children }: { children: ReactNode }) {
  const { tree, errors, loading, loadError } = useTree()
  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Loading…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Server unreachable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} validation error{errors.length > 1 ? 's' : ''} in docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">The roadmap will render once the source is healthy — details in the Backlog.</p>
      </div>
    )
  }
  return <>{children}</>
}

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne par
 * section, ordre de priorité NN). Depuis #369, colonnes SEULEMENT : le graphe de
 * dépendances est devenu la vue « Dépendances » de 1er niveau (DependenciesView).
 *
 * Tickets terminés MASQUÉS (#342, showDone=false figé). Filtre epic (#343) : porté
 * par App et PARTAGÉ avec la vue Dépendances via props — la sélection survit au
 * passage Roadmap ↔ Dépendances (état de session, pas persisté).
 */
export function RoadmapView({ epicFilter, onEpicFilter }: {
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  return (
    <RoadmapStateGuard>
      <div className="flex h-full flex-col">
        <ViewHeader />
        <div className="min-h-0 flex-1 overflow-auto">
          <RoadmapColumns showDone={false} epicFilter={epicFilter} onEpicFilter={onEpicFilter} />
        </div>
      </div>
    </RoadmapStateGuard>
  )
}
