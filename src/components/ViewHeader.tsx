import { Popover } from '@base-ui/react/popover'
import { ChevronDown } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useView, type View } from '../state/ViewContext'
import { LiveActivityMenu } from './LiveActivityMenu'
import { UpdateNotice } from './UpdateNotice'

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
        <h1 className="flex min-w-0 items-baseline gap-1.5 text-sm tracking-tight">
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
      <Popover.Trigger
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-xs transition-colors hover:bg-neutral-100 ${
          selected.length > 0 ? 'bg-accent-tint text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]' : 'bg-white text-neutral-600'
        }`}
      >
        {label}
        <ChevronDown size={9} className="text-neutral-500" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-56 border border-neutral-200 bg-white py-1 shadow-sm">
            {options.map((o) => {
              const active = selected.includes(o.value)
              const onClick = () => {
                if (multiple) onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                else onChange(active ? [] : [o.value])
              }
              const cls = `flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-100 ${
                active ? 'bg-accent-tint font-medium text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]'
                : o.count === 0 ? 'text-neutral-500' : 'text-neutral-600'
              }`
              const body = (
                <>
                  <span className="min-w-0 truncate">{o.label}</span>
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
            {selected.length > 0 && (
              <Popover.Close
                render={<button type="button" />}
                onClick={() => onChange([])}
                className="mt-1 flex w-full border-t border-neutral-100 px-2.5 py-1.5 text-left text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
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
