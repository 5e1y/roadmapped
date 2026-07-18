import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { ViewHeader } from './ViewHeader'
import { RoadmapColumns, GlobalProgress } from './RoadmapColumns'
import { RoadmapGraph } from './RoadmapGraph'

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne
 * par section, ordre de priorité NN). Deux modes : Colonnes / Graphe.
 *
 * Tickets terminés MASQUÉS ici (#342) : le toggle « done » a été retiré du
 * header (deux mécanismes pour le même besoin depuis que l'impact visuel des
 * done a baissé). Roadmap/Graphe FIGENT le comportement par défaut historique
 * (#247) — showDone = false, done masqués ; le Graphe garde tout de même les
 * done qui sont dépendances (transitives) de tickets affichés (arêtes intègres).
 *
 * Filtre epic (#343) : remonté ICI — le parent commun le plus bas des deux
 * modes — pour que la bande d'epics filtre les DEUX vues et que la sélection
 * SURVIVE au passage Colonnes ↔ Graphe (état de session, pas persisté : un
 * filtre de lecture, pas une préférence).
 */
export function RoadmapView() {
  const { tree, errors, loading, loadError } = useTree()
  const [mode, setMode] = useState<'columns' | 'graph'>('columns')
  const [epicFilter, setEpicFilter] = useState<string | null>(null)

  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Loading…</div>
  }
  // Mêmes garde-fous que le Backlog : la Roadmap ne doit jamais être un écran
  // vide muet quand le serveur est injoignable ou la source invalide.
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

  return (
    <div className="flex h-full flex-col">
      {/* Avancement global (#133) : x/y + barre fine dans le header de la vue. */}
      <ViewHeader meta={<GlobalProgress />}>
        <div className="flex overflow-hidden rounded-md border border-neutral-300">
          {(['columns', 'graph'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 text-xs transition-colors ${
                mode === m ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}>
              {m === 'columns' ? 'Columns' : 'Graph'}
            </button>
          ))}
        </div>
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        {/* showDone figé à false (#342) : done masqués, comportement par défaut
            historique conservé après le retrait du toggle. */}
        {mode === 'columns'
          ? <RoadmapColumns showDone={false} epicFilter={epicFilter} onEpicFilter={setEpicFilter} />
          : <RoadmapGraph showDone={false} epicFilter={epicFilter} onEpicFilter={setEpicFilter} />}
      </div>
    </div>
  )
}
