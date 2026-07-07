import { Popover } from '@base-ui/react/popover'
import { ChevronDown } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useView, type View } from '../state/ViewContext'
import { useStageFilter } from '../state/filters'
import { STAGES } from '../lib/tasks'

const NAV: { id: View; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'docs', label: 'Docs' },
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
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 text-sm font-semibold tracking-tight text-neutral-900">Roadmaped</span>
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
        {meta && <div className="min-w-0 truncate font-mono text-xs text-neutral-400">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
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
    : `${selected.length} filtres`

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-xs transition-colors hover:bg-neutral-100 ${
          selected.length > 0 ? 'bg-accent-tint text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]' : 'bg-white text-neutral-600'
        }`}
      >
        {label}
        <ChevronDown size={9} className="text-neutral-400" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-56 border border-neutral-200 bg-white py-1 shadow-sm">
            {options.map((o) => {
              const active = selected.includes(o.value)
              return (
                <Popover.Close
                  key={o.value}
                  disabled={multiple}
                  render={<button type="button" />}
                  onClick={() => {
                    if (multiple) onChange(active ? selected.filter((v) => v !== o.value) : [...selected, o.value])
                    else onChange(active ? [] : [o.value])
                  }}
                  aria-pressed={active}
                  className={`flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-100 ${
                    active ? 'bg-accent-tint font-medium text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]'
                    : o.count === 0 ? 'text-neutral-300' : 'text-neutral-600'
                  }`}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.count !== undefined && (
                    <span className="shrink-0 font-mono text-[11px] text-neutral-400">{o.count}</span>
                  )}
                </Popover.Close>
              )
            })}
            {selected.length > 0 && (
              <Popover.Close
                render={<button type="button" />}
                onClick={() => onChange([])}
                className="mt-1 flex w-full border-t border-neutral-100 px-2.5 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                Effacer le filtre
              </Popover.Close>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

/** Filtre Stage (simple) — compteurs = tickets ouverts par stage. */
export function StageFilterMenu() {
  const { tree } = useTree()
  const [selected, setSelected] = useStageFilter()
  const counts = new Map<string, number>()
  if (tree) for (const s of tree.sections) {
    counts.set(s.key, s.tasks.reduce((n, t) => n + (t.status !== 'done' ? 1 : 0), 0))
  }
  return (
    <FilterMenu
      aria-label="Filtrer par stage"
      allLabel="Tous les stages"
      options={STAGES.map((s) => ({ value: s.slug, label: s.title, count: counts.get(s.slug) ?? 0 }))}
      selected={selected ? [selected] : []}
      onChange={(next) => setSelected(next[0] ?? '')}
    />
  )
}
