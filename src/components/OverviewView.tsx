import { ViewHeader } from './ViewHeader'

/**
 * Écran Overview (#372 stub → rempli en #375/#376) : les visualisations sorties
 * du Backlog (radar par type, graphe nodal des tags via KbGraph) + créés-vs-fermés
 * + aperçu 5 tickets à 3 bascules. Placeholder tant que le contenu n'est pas posé.
 */
export function OverviewView() {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-neutral-500">Overview — visualisations à venir.</p>
      </div>
    </div>
  )
}
