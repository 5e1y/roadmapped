import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Bug, Check } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { UpdateNotice } from './UpdateNotice'
import { ThemeToggle } from './ThemeToggle'
import { TogglePill } from './ui'

/**
 * LE header commun des vues (décision Rémi) : une barre en haut, hauteur
 * STRICTEMENT égale au header du panneau de tâche (h-12 partagé, cf.
 * SidePanel). La navigation entre vues vit désormais dans le RAIL vertical à
 * gauche (NavRail, #370) — plus de tabs ici. À gauche : le titre marque × repo
 * (la mascotte, elle, est passée en tête du rail pour ne pas être dupliquée).
 * À droite : le cluster Activity + dropdowns et actions propres à la vue.
 */
export function ViewHeader({ meta, children }: {
  /** Info discrète après le titre (compteurs, chemin du doc…). */
  meta?: ReactNode
  /** Contrôles alignés à droite (dropdowns, boutons, segmented). */
  children?: ReactNode
}) {
  const { repoName } = useTree()
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-foreground px-4">
      <div className="flex min-w-0 items-center gap-4">
        {/* Marque × repo (#204) : savoir sur quel repo pointe CE dashboard quand
            plusieurs sont ouverts. Le × séparateur en graisse Light (décision Rémi) ;
            le repo tronque, marque + × ne rétrécissent pas. Sans repoName (build démo
            statique, avant 1er /api/tree) : marque seule, pas de × orphelin. La
            mascotte n'est PLUS ici (elle vit en tête du NavRail, #370). */}
        <h1 className="flex min-w-0 items-center gap-1.5 text-sm tracking-tight">
          <span className="shrink-0 font-semibold text-texthard">Roadmapped</span>
          {repoName && (
            <>
              <span className="shrink-0 font-light text-neutral-400" aria-hidden="true">×</span>
              <span className="min-w-0 truncate font-medium text-texthard" title={repoName}>{repoName}</span>
            </>
          )}
        </h1>
        {meta && <div className="min-w-0 truncate font-mono text-xs text-textsoft">{meta}</div>}
      </div>
      {/* Cluster droit : contrôles transverses puis ceux propres à la vue.
          L'ex-overlay Activity a QUITTÉ le header (#372) — c'est désormais un
          onglet plein (ActivityView) ; le LiveActivityProvider reste au niveau
          App et alimente cet onglet. */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Notif de MAJ (#211) : rendue seulement si une MAJ est dispo (update
            non null), dismiss de session module-level. */}
        <UpdateNotice />
        {/* Report an issue (#227) : canalise les feedbacks users vers le form bug
            GitHub (#223). Lien externe icône-seule, même idiome que le toggle. */}
        <a
          href="https://github.com/5e1y/roadmapped/issues/new?template=bug_report.yml"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Report an issue on GitHub"
          title="Report an issue"
          className="flex items-center rounded-interactive border border-neutral-300 bg-foreground px-2 py-1 text-textsoft transition-colors hover:bg-rollover"
        >
          <Bug size={12} className="my-0.5" />
        </a>
        {/* Bascule clair/sombre (#269) : dernier élément du chrome d'app, avant
            les contrôles propres à la vue (filtres, recherche, + task). */}
        <ThemeToggle />
        {children}
      </div>
    </header>
  )
}

/**
 * Coquille de vue canonique (design.md §4, #384) : le squelette partagé par les
 * 8 vues — `flex h-full flex-col` + `ViewHeader` TOUJOURS monté + le corps en
 * dessous. Le header ne disparaît JAMAIS pendant loading/erreur (régression H1 :
 * Backlog/Roadmap/Deps le faisaient sauter) — la garde d'état (`TreeStateGuard`)
 * et les états vides vivent DANS `children`, sous le header. Le corps garde sa
 * propre gestion du scroll (chaque vue pose son `min-h-0 flex-1`).
 */
export function ViewShell({ meta, controls, children }: {
  /** Info discrète après le titre, transmise au ViewHeader (compteurs, chemin…). */
  meta?: ReactNode
  /** Contrôles propres à la vue, alignés à droite du header. */
  controls?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={meta}>{controls}</ViewHeader>
      {children}
    </div>
  )
}

interface FilterOption {
  value: string
  label: string
  count?: number
}

/**
 * LE dropdown de filtre du header — apparence et comportement UNIQUES pour
 * stages et teams (décision Rémi : « c'est la même chose ») : Popover Base UI,
 * trigger qui résume l'état (tint accent quand actif), liste avec compteurs,
 * « Effacer » en pied quand un filtre est posé. `multiple` distingue la
 * sélection (teams = multi, stage = simple qui referme au choix).
 */
export function FilterMenu({ allLabel, options, selected, onChange, multiple = false, 'aria-label': ariaLabel }: {
  allLabel: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  'aria-label': string
}) {
  const byValue = new Map(options.map((o) => [o.value, o.label]))
  const label =
    selected.length === 0 ? allLabel
    : selected.length === 1 ? (byValue.get(selected[0]) ?? selected[0])
    : `${selected.length} filters`

  return (
    <Popover.Root>
      {/* Trigger : primitive TogglePill (langage « contrôle enclenché », #311,
          cf. ui.tsx) — actif = un filtre est posé. Base UI monte le <button> via
          `render` et y fusionne onClick/aria-expanded. */}
      <Popover.Trigger aria-label={ariaLabel} render={<TogglePill active={selected.length > 0} />}>
        {label}
        <ChevronDown size={9} className="text-textsoft" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-56 overflow-hidden rounded-surface border border-border bg-foreground shadow-sm">
            {/* Hauteur bornée + scroll : 46 communautés ne doivent pas remplir
                l'écran (#311). Le pied « Clear » reste ÉPINGLÉ sous la liste. */}
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {options.map((o) => {
                const active = selected.includes(o.value)
                const onClick = () => {
                  if (multiple) onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                  else onChange(active ? [] : [o.value])
                }
                // Vraie CHECKBOX (retour Rémi) : une case TOUJOURS visible, vide
                // quand non sélectionné, remplie + cochée (accent) quand actif —
                // le signal ne dépend plus d'un fond de rangée. Alignement
                // [case] label … count.
                const cls = `flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-rollover ${
                  active ? 'font-medium text-texthard'
                  : o.count === 0 ? 'text-textsoft' : 'text-textsoft'
                }`
                const body = (
                  <>
                    <span
                      className={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                        active ? 'border-accent bg-active text-accent' : 'border-neutral-300'
                      }`}
                      aria-hidden="true"
                    >
                      {active && <Check size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && (
                      <span className="shrink-0 font-mono text-[11px] text-textsoft">{o.count}</span>
                    )}
                  </>
                )
                // Multi : un <button> SIMPLE — le popup reste ouvert pour enchaîner
                // les choix. JAMAIS `Popover.Close disabled` (design.md §2 : il rend
                // l'option inerte — le disabled atterrit sur le <button> du DOM).
                // Simple : Popover.Close, le choix referme.
                return multiple ? (
                  <button key={o.value} type="button" onClick={onClick} aria-pressed={active} className={cls}>
                    {body}
                  </button>
                ) : (
                  <Popover.Close key={o.value} render={<button type="button" />} onClick={onClick} aria-pressed={active} className={cls}>
                    {body}
                  </Popover.Close>
                )
              })}
            </div>
            {selected.length > 0 && (
              <Popover.Close
                render={<button type="button" />}
                onClick={() => onChange([])}
                className="flex w-full border-t border-neutral-100 px-2.5 py-1.5 text-left text-xs text-textsoft hover:bg-rollover hover:text-texthard"
              >
                Clear filter
              </Popover.Close>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
