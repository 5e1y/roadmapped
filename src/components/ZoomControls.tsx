import { Minus, Plus } from 'trinil-react'
import { Button } from './ui'

/**
 * Barre de zoom flottante partagée par les deux graphes (#382) — le markup était
 * copié ligne à ligne entre KbGraph et RoadmapGraph. Seuls les HANDLERS diffèrent
 * (KbGraph wrappe `markInteracted` + fitBox ; RoadmapGraph appelle zp direct) : ils
 * restent aux appelants, ce composant ne porte que la présentation (épinglée en
 * haut-droite, rounded-interactive du chrome flottant per design.md §1).
 * Segments = Button ghost canonique (#419) ; les séparateurs 1px restent portés
 * par className (contexte de layout, pas une variante).
 * `rounded={false}` sur chaque segment (#428) : la pilule n'a QUE 2 coins
 * extérieurs — c'est le conteneur (`rounded-interactive overflow-hidden`) qui
 * les clippe. Un rayon individuel par segment ferait courber les séparateurs
 * `shadow-inset` le long de ses coins (très visible sur cursor, 16px).
 */
export function ZoomControls({ onZoomOut, onFit, onReset, onZoomIn }: {
  onZoomOut: () => void
  onFit: () => void
  onReset: () => void
  onZoomIn: () => void
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex items-center overflow-hidden rounded-interactive ring-1 ring-inset ring-border bg-foreground shadow-sm">
      <Button variant="ghost" rounded={false} icon={Minus} aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} />
      <Button variant="ghost" rounded={false} className="shadow-[inset_1px_0_0_var(--color-border)]" onClick={onFit}>Fit</Button>
      <Button variant="ghost" rounded={false} className="shadow-[inset_1px_0_0_var(--color-border)]" aria-label="Reset zoom to 100%" onClick={onReset}>100 %</Button>
      <Button variant="ghost" rounded={false} icon={Plus} className="shadow-[inset_1px_0_0_var(--color-border)]" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} />
    </div>
  )
}
