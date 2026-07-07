import { Popover } from '@base-ui/react/popover'
import { ChevronDown } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useTeamFilter } from '../state/filters'
import { activeTasks } from '../lib/roadmap'
import { TEAMS, type Team } from '../lib/tasks'

/**
 * LE header commun des trois vues (décision Rémi) : une barre en haut, sur le
 * modèle de la vue Roadmap, de hauteur STRICTEMENT égale au header du panneau
 * de tâche (h-12 partagé, cf. SidePanel). Titre à gauche, filtres/actions en
 * dropdowns à droite — plus aucun filtre dans la sidebar.
 */
export function ViewHeader({ title, meta, children }: {
  title: string
  /** Info discrète accolée au titre (compteurs, chemin du doc…). */
  meta?: ReactNode
  /** Contrôles alignés à droite (dropdowns, boutons, segmented). */
  children?: ReactNode
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-neutral-200 px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight text-neutral-900">{title}</h1>
        {meta && <div className="min-w-0 truncate font-mono text-xs text-neutral-400">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  )
}

/**
 * Dropdown de filtre Teams (multi-sélection, Popover Base UI) : le déclencheur
 * résume l'état (« Toutes les teams » / « 2 teams »), le popup liste les 8 avec
 * compteurs — même logique qu'avant, sortie de la sidebar.
 */
export function TeamFilterMenu() {
  const { tree } = useTree()
  const [selected, setSelected] = useTeamFilter()
  const counts = new Map<Team, number>(TEAMS.map((t) => [t, 0]))
  if (tree) for (const t of activeTasks(tree)) counts.set(t.team, (counts.get(t.team) ?? 0) + 1)
  const toggle = (team: Team) =>
    setSelected(selected.includes(team) ? selected.filter((t) => t !== team) : [...selected, team])
  const label =
    selected.length === 0 ? 'Toutes les teams'
    : selected.length === 1 ? selected[0]
    : `${selected.length} teams`

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Filtrer par team"
        className={`flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1 text-xs transition-colors hover:bg-neutral-100 ${
          selected.length > 0 ? 'bg-accent/5 text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]' : 'bg-white text-neutral-600'
        }`}
      >
        {label}
        <ChevronDown size={9} className="text-neutral-400" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-52 border border-neutral-200 bg-white py-1 shadow-sm">
            {TEAMS.map((team) => {
              const n = counts.get(team) ?? 0
              const active = selected.includes(team)
              return (
                <button
                  key={team}
                  type="button"
                  onClick={() => toggle(team)}
                  aria-pressed={active}
                  className={`flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-100 ${
                    active ? 'bg-accent/5 font-medium text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]'
                    : n === 0 ? 'text-neutral-300' : 'text-neutral-600'
                  }`}
                >
                  <span>{team}</span>
                  <span className="shrink-0 font-mono text-[11px] text-neutral-400">{n}</span>
                </button>
              )
            })}
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="mt-1 flex w-full border-t border-neutral-100 px-2.5 py-1.5 text-left text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                Effacer le filtre
              </button>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
