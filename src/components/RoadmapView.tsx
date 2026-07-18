import { useState } from 'react'
import { EyeClosed, EyeOpen } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { ViewHeader } from './ViewHeader'
import { RoadmapColumns, GlobalProgress } from './RoadmapColumns'
import { RoadmapGraph } from './RoadmapGraph'

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne
 * par section, ordre de priorité NN). Deux modes : Colonnes / Graphe.
 *
 * Tickets terminés MASQUÉS par défaut, « done à la demande » (#247) : état de
 * SESSION (pas persisté — un coup d'œil d'historique, pas une préférence),
 * partagé Colonnes/Graphe via props. Le Graphe garde les done qui sont
 * dépendances (transitives) de tickets affichés : arêtes intègres.
 *
 * Filtre epic (#343) : remonté ICI — le parent commun le plus bas des deux
 * modes — pour que la bande d'epics filtre les DEUX vues et que la sélection
 * SURVIVE au passage Colonnes ↔ Graphe (état de session, pas persisté : un
 * filtre de lecture, pas une préférence).
 */
export function RoadmapView() {
  const { tree, errors, loading, loadError } = useTree()
  const [mode, setMode] = useState<'columns' | 'graph'>('columns')
  const [showDone, setShowDone] = useState(false)
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
        <button
          type="button"
          onClick={() => setShowDone(!showDone)}
          aria-pressed={showDone}
          title={showDone ? 'Hide done tickets' : 'Show done tickets'}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
            // #176 : état ON = langage « actif » du dashboard (accent-tint + filet accent,
            // design.md §3.2), pas un fond gris ambigu. OFF = repos neutre.
            showDone ? 'border-accent bg-accent-tint text-neutral-900' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          {showDone ? <EyeOpen size={12} /> : <EyeClosed size={12} />}
          done
        </button>
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
        {mode === 'columns'
          ? <RoadmapColumns showDone={showDone} epicFilter={epicFilter} onEpicFilter={setEpicFilter} />
          : <RoadmapGraph showDone={showDone} epicFilter={epicFilter} onEpicFilter={setEpicFilter} />}
      </div>
    </div>
  )
}
