import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { RoadmapColumns } from './RoadmapColumns'
import { RoadmapGraph } from './RoadmapGraph'

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne
 * par section, ordre de priorité NN). Deux modes : Colonnes / Graphe.
 */
export function RoadmapView() {
  const { tree, errors, loading, loadError } = useTree()
  const [mode, setMode] = useState<'columns' | 'graph'>('columns')

  if (loading && !tree) {
    return <div className="px-6 py-14 text-sm text-neutral-500">Chargement…</div>
  }
  // Mêmes garde-fous que le Backlog : la Roadmap ne doit jamais être un écran
  // vide muet quand le serveur est injoignable ou la source invalide.
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} erreur{errors.length > 1 ? 's' : ''} de validation dans docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">La roadmap sera rendue quand la source sera saine — détail dans le Backlog.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
        <h1 className="text-sm font-semibold tracking-tight text-neutral-900">Roadmap</h1>
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
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'columns' ? <RoadmapColumns /> : <RoadmapGraph />}
      </div>
    </div>
  )
}
