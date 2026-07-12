import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Bug, Check } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useView, type View } from '../state/ViewContext'
import { LiveActivityMenu } from './LiveActivityMenu'
import { UpdateNotice } from './UpdateNotice'
import { ThemeToggle } from './ThemeToggle'
import { BirdMascot } from './BirdMascot'

const NAV: { id: View; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'docs', label: 'Docs' },
  { id: 'notepad', label: 'Notepad' },
]

/**
 * LE header commun des vues (décision Rémi) : une barre en haut, hauteur
 * STRICTEMENT égale au header du panneau de tâche (h-12 partagé, cf.
 * SidePanel). À gauche : marque + TABS de navigation (la sidebar n'existe
 * plus) ; l'onglet actif remplace le titre de vue. À droite : dropdowns et
 * actions de la vue.
 */
export function ViewHeader({ meta, children }: {
  /** Info discrète après les tabs (compteurs, chemin du doc…). */
  meta?: ReactNode
  /** Contrôles alignés à droite (dropdowns, boutons, segmented). */
  children?: ReactNode
}) {
  const { view, setView } = useView()
  const { repoName } = useTree()
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-4">
        {/* Marque × repo (#204) : savoir sur quel repo pointe CE dashboard quand
            plusieurs sont ouverts. Le × séparateur en graisse Light (décision Rémi) ;
            le repo tronque, marque + × ne rétrécissent pas. Sans repoName (build démo
            statique, avant 1er /api/tree) : marque seule, pas de × orphelin. */}
        <h1 className="flex min-w-0 items-center gap-1.5 text-sm tracking-tight">
          <BirdMascot />
          <span className="shrink-0 font-semibold text-neutral-900">Roadmapped</span>
          {repoName && (
            <>
              <span className="shrink-0 font-light text-neutral-400" aria-hidden="true">×</span>
              <span className="min-w-0 truncate font-medium text-neutral-700" title={repoName}>{repoName}</span>
            </>
          )}
        </h1>
        <nav className="flex shrink-0 overflow-hidden rounded-md border border-neutral-300">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              aria-current={item.id === view ? 'page' : undefined}
              className={`px-3 py-1 text-xs transition-colors ${
                item.id === view ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {meta && <div className="min-w-0 truncate font-mono text-xs text-neutral-500">{meta}</div>}
      </div>
      {/* Cluster droit : le panneau Activity (live, #205) d'abord — présent sur
          les 4 vues, son état vit dans LiveActivityProvider (null hors provider :
          tests, build démo statique) — puis les contrôles propres à la vue. */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Notif de MAJ (#211) : rendue seulement si une MAJ est dispo (update
            non null) — présente sur les 4 vues, dismiss de session module-level. */}
        <UpdateNotice />
        <LiveActivityMenu />
        {/* Report an issue (#227) : canalise les feedbacks users vers le form bug
            GitHub (#223). Lien externe icône-seule, même idiome que le toggle. */}
        <a
          href="https://github.com/5e1y/roadmapped/issues/new?template=bug_report.yml"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Report an issue on GitHub"
          title="Report an issue"
          className="flex items-center rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100"
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
      {/* Trigger : langage « actif » DS des pills bordées (cf. bouton inferred du
          KB, TagGraph/TypesRadar) — bord accent COMPLET + tint, jamais un demi-
          filet inset qui jurait avec le rounded-md (#311). */}
      <Popover.Trigger
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
          selected.length > 0
            ? 'border-accent bg-accent-tint text-neutral-900'
            : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
        }`}
      >
        {label}
        <ChevronDown size={9} className="text-neutral-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-56 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
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
                const cls = `flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-100 ${
                  active ? 'font-medium text-neutral-900'
                  : o.count === 0 ? 'text-neutral-500' : 'text-neutral-600'
                }`
                const body = (
                  <>
                    <span
                      className={`flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                        active ? 'border-accent bg-accent-tint text-accent' : 'border-neutral-300'
                      }`}
                      aria-hidden="true"
                    >
                      {active && <Check size={11} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && (
                      <span className="shrink-0 font-mono text-[11px] text-neutral-500">{o.count}</span>
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
                className="flex w-full border-t border-neutral-100 px-2.5 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
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
