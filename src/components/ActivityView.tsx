import { ViewHeader } from './ViewHeader'

/**
 * Onglet Activity (#372 stub → rempli en #377) : feed timestampé plein écran,
 * version étendue de l'ex-overlay du header (useLiveActivity().log, groupé par
 * jour). Placeholder tant que le contenu n'est pas posé.
 */
export function ActivityView() {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader />
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-neutral-500">Activity — feed à venir.</p>
      </div>
    </div>
  )
}
