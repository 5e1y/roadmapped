import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { RoadmapColumns } from './RoadmapColumns'
import { RoadmapGraph } from './RoadmapGraph'

/**
 * Vue Roadmap = les sections du backlog vues comme des jalons (une colonne
 * par section, ordre de priorité NN). Deux modes : Colonnes / Graphe.
 */
export function RoadmapView() {
  const { tree, loading } = useTree()
  const [mode, setMode] = useState<'columns' | 'graph'>('columns')

  if (loading && !tree) {
    return <div className="px-6 py-14 text-sm text-neutral-500">Chargement…</div>
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
