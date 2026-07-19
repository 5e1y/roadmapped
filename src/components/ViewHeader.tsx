import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Check, Search } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useView } from '../state/ViewContext'
import { useSearch } from '../state/search'
import { usePanel } from '../state/PanelContext'
import { TogglePill, primaryBtn } from './ui'

/**
 * LE header commun des vues (décision Rémi, #395). Trois zones : le TITRE marque ×
 * repo à gauche, la BARRE DE RECHERCHE globale CENTRÉE, le bouton « + task » juste
 * à sa DROITE. Rien d'autre — le thème, le signalement de bug et la notif de MAJ
 * ont migré dans la page Settings (rail). Grille 3 colonnes [1fr auto 1fr] pour que
 * la recherche soit vraiment au centre quelle que soit la largeur du titre.
 *
 * Recherche GLOBALE : présente sur TOUS les écrans ; cliquer dedans ramène au
 * Backlog (le seul écran qui filtre) et la requête (state App, cf. search.tsx) y
 * pilote la liste. « + task » aussi présent partout (crée une Feature par défaut).
 */
export function ViewHeader({ meta }: {
  /** Info discrète après le titre (compteurs, chemin du doc…). */
  meta?: ReactNode
}) {
  const { repoName } = useTree()
  const { view, setView } = useView()
  const { query, setQuery } = useSearch()
  const { openCreateTask } = usePanel()
  // Focus depuis une AUTRE vue : setView('backlog') remonte le header (chaque vue a
  // le sien) → l'input courant est démonté et perd le focus. On re-focus le NOUVEL
  // input (retrouvé par aria-label) après le commit React (#395, retour Rémi).
  const onSearchFocus = () => {
    if (view === 'backlog') return
    setView('backlog')
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>('input[aria-label="Search tasks"]')
      if (el) { el.focus(); const n = el.value.length; el.setSelectionRange(n, n) }
    })
  }
  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 shadow-[inset_0_-1px_0_var(--color-border)] bg-foreground px-4">
      {/* Colonne 1 (gauche) — titre marque × repo + méta de vue. */}
      <div className="flex min-w-0 items-center gap-4">
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
      {/* Colonne 2 (auto, centrée) — recherche globale. Focus → Backlog. */}
      <div className="relative w-72">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-textsoft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onSearchFocus}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="w-full rounded-interactive bg-background py-1 pl-7 pr-2 text-xs text-texthard ring-1 ring-inset ring-border transition-[background-color] placeholder:text-textsoft focus:bg-foreground"
        />
      </div>
      {/* Colonne 3 — « + task » collé à DROITE de la recherche (justify-self-start),
          jamais tout à droite de l'écran (décision Rémi). */}
      <div className="justify-self-start">
        <button type="button" onClick={() => openCreateTask('02-feature')} className={primaryBtn}>
          + task
        </button>
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
export function ViewShell({ meta, children }: {
  /** Info discrète après le titre, transmise au ViewHeader (compteurs, chemin…). */
  meta?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={meta} />
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
          <Popover.Popup className="w-56 overflow-hidden rounded-interactive bg-foreground ring-1 ring-inset ring-border shadow-sm">
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
                className="flex w-full shadow-[inset_0_1px_0_var(--color-border)] px-2.5 py-1.5 text-left text-xs text-textsoft hover:bg-rollover hover:text-texthard"
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
