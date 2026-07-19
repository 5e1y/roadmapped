/**
 * Barre de zoom flottante partagée par les deux graphes (#382) — le markup était
 * copié ligne à ligne entre KbGraph et RoadmapGraph. Seuls les HANDLERS diffèrent
 * (KbGraph wrappe `markInteracted` + fitBox ; RoadmapGraph appelle zp direct) : ils
 * restent aux appelants, ce composant ne porte que la présentation (épinglée en
 * haut-droite, rounded-md du chrome flottant per design.md §1).
 */
export function ZoomControls({ onZoomOut, onFit, onReset, onZoomIn }: {
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onZoomIn: () => void
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-md border border-neutral-300 bg-white shadow-sm">
      <button type="button" onClick={onZoomOut} aria-label="Zoom out"
        className="px-2.5 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-100">−</button>
      <button type="button" onClick={onFit}
        className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100">Fit</button>
      <button type="button" onClick={onReset} aria-label="Reset zoom to 100%"
        className="border-l border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100">100 %</button>
      <button type="button" onClick={onZoomIn} aria-label="Zoom in"
        className="border-l border-neutral-200 px-2.5 py-1 text-sm text-neutral-600 transition-colors hover:bg-neutral-100">+</button>
    </div>
  )
}
