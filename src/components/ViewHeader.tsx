import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Check, Plus, Search } from 'trinil-react'
import { type ReactNode } from 'react'
import { useTree } from '../state/TreeContext'
import { useView } from '../state/ViewContext'
import { useSearch } from '../state/search'
import { usePanel } from '../state/PanelContext'
import { TogglePill, Button, BUTTON_ICON_SIZE } from './ui'

/**
 * LE header commun des vues (décision Rémi, #395). Trois zones : le TITRE marque ×
 * repo à gauche, la BARRE DE RECHERCHE globale CENTRÉE, le bouton « + task » juste
 * à sa DROITE. Rien d'autre — le thème, le signalement de bug et la notif de MAJ
 * ont migré dans la page Settings (rail). Grille 3 colonnes [1fr minmax(auto,18rem) 1fr]
 * pour que la recherche soit vraiment au centre quelle que soit la largeur du titre
 * (fluide, plafonnée à 18rem — plus de w-72 figé).
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
    <header className="grid shrink-0 grid-cols-[1fr_minmax(auto,18rem)_1fr] items-center gap-l shadow-[inset_0_-1px_0_var(--color-border)] bg-foreground px-l py-s">
      {/* Colonne 1 (gauche) — titre marque × repo + méta de vue. */}
      <div className="flex min-w-0 items-center gap-l">
        <h1 className="flex min-w-0 items-center gap-s text-sm tracking-tight">
          <span className="shrink-0 font-semibold text-texthard">Roadmapped</span>
          {repoName && (
            <>
              <span className="shrink-0 font-light text-textsoft" aria-hidden="true">×</span>
              <span className="min-w-0 truncate font-medium text-texthard" title={repoName}>{repoName}</span>
            </>
          )}
        </h1>
        {meta && <div className="min-w-0 truncate font-mono text-xs text-textsoft">{meta}</div>}
      </div>
      {/* Colonne 2 (auto, centrée) — recherche globale. Focus → Backlog.
          MÊME structure flex que le Button voisin (#420, #427), pas une hauteur
          calculée : le CONTENEUR porte le p-s + le fond/ring/rayon (exactement
          comme le <button> de ui.tsx), l'icône et l'input sont ses enfants flex.
          La hauteur totale N'EST PAS écrite : le navigateur l'additionne via le
          box model — 2×p-s(thème) + 12px de contenu — pour n'importe quel thème,
          strictement comme le Button. Le seul point dur d'un <input> (sa line-box
          interne ne descend pas sous ~15px, la métrique de system-ui à 12px) est
          neutralisé en figeant la hauteur INTRINSÈQUE de l'input à 12px : cette
          valeur littérale matche BUTTON_ICON_SIZE (=12 dans ui.tsx, un nombre en
          dur indépendant des tokens = choix typographique global, pas un
          espacement thémable) — impossible d'y injecter la constante JS car le
          JIT Tailwind ne scanne que des chaînes littérales. Si BUTTON_ICON_SIZE
          change, ce h-[12px] doit suivre. */}
      <div className="flex w-full items-center gap-s rounded-interactive bg-background p-s ring-1 ring-inset ring-border transition-[background-color] focus-within:bg-foreground">
        <Search size={BUTTON_ICON_SIZE} className="shrink-0 text-textsoft" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={onSearchFocus}
          placeholder="Search tasks…"
          aria-label="Search tasks"
          className="h-[12px] min-w-0 flex-1 border-0 bg-transparent p-0 text-xs leading-none text-texthard outline-none placeholder:text-textsoft"
        />
      </div>
      {/* Colonne 3 — « + task » collé à DROITE de la recherche (justify-self-start),
          jamais tout à droite de l'écran (décision Rémi). */}
      <div className="justify-self-start">
        {/* Vraie icône Plus (#420) — plus de « + » littéral dans le libellé. */}
        <Button variant="primary" icon={Plus} onClick={() => openCreateTask('02-feature')}>task</Button>
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
          <Popover.Popup className="min-w-44 max-w-72 overflow-hidden rounded-interactive bg-foreground ring-1 ring-inset ring-border shadow-sm">
            {/* Hauteur bornée + scroll : 46 communautés ne doivent pas remplir
                l'écran (#311). Le pied « Clear » reste ÉPINGLÉ sous la liste. */}
            <div className="max-h-[60vh] overflow-y-auto py-xs">
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
                const cls = `flex w-full items-center gap-s px-m py-s text-left text-xs hover:bg-rollover ${
                  active ? 'font-medium text-texthard'
                  : o.count === 0 ? 'text-textsoft' : 'text-textsoft'
                }`
                const body = (
                  <>
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-interactive ring-1 ring-inset p-xs transition-colors ${
                        active ? 'ring-accent bg-active text-accent' : 'ring-border'
                      }`}
                      aria-hidden="true"
                    >
                      {/* Check TOUJOURS rendu : le glyphe + padding dimensionnent la
                          case (plus de size figé) ; invisible quand inactif. */}
                      <Check size={11} className={active ? undefined : 'opacity-0'} />
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
                className="flex w-full shadow-[inset_0_1px_0_var(--color-border)] px-m py-s text-left text-xs text-textsoft hover:bg-rollover hover:text-texthard"
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
