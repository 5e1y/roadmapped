import { useState } from 'react'
import { EyeClosed, EyeOpen } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePersistentFlag } from '../state/uiPersist'
import { ViewHeader } from './ViewHeader'
import { RoadmapColumns, GlobalProgress } from './RoadmapColumns'
import { RoadmapGraph } from './RoadmapGraph'

/**
 * Tickets terminés MASQUÉS par défaut dans la Roadmap (décision Rémi) —
 * préférence partagée Colonnes/Graphe et persistée. Le Graphe garde les done
 * qui sont dépendances (transitives) de tickets affichés : arêtes intègres.
 */
export function useShowDone(): [boolean, (v: boolean) => void] {
  return usePersistentFlag('roadmap:showDone', 1)
}

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne
 * par section, ordre de priorité NN). Deux modes : Colonnes / Graphe.
 */
export function RoadmapView() {
  const { tree, errors, loading, loadError } = useTree()
  const [mode, setMode] = useState<'columns' | 'graph'>('columns')
  const [showDone, setShowDone] = useShowDone()

  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Chargement…</div>
  }
  // Mêmes garde-fous que le Backlog : la Roadmap ne doit jamais être un écran
  // vide muet quand le serveur est injoignable ou la source invalide.
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} erreur{errors.length > 1 ? 's' : ''} de validation dans docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">La roadmap sera rendue quand la source sera saine — détail dans le Backlog.</p>
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
          title={showDone ? 'Masquer les tickets terminés' : 'Afficher les tickets terminés'}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
            showDone ? 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100' : 'border-neutral-300 bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          }`}
        >
          {showDone ? <EyeOpen size={12} /> : <EyeClosed size={12} />}
          terminées
        </button>
        <div className="flex overflow-hidden rounded-md border border-neutral-300">
          {(['columns', 'graph'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 py-1 text-xs transition-colors ${
                mode === m ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}>
              {m === 'columns' ? 'Colonnes' : 'Graphe'}
            </button>
          ))}
        </div>
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'columns' ? <RoadmapColumns /> : <RoadmapGraph />}
      </div>
    </div>
  )
}
