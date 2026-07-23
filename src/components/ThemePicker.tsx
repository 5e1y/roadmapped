import { Popover } from '@base-ui/react/popover'
import { Check, ColorPalette } from 'trinil-react'
import { useThemeName, THEME_NAMES, THEME_LABELS, type ThemeName } from '../state/theme'

/**
 * Sélecteur de thème intégré (#394) — l'axe PALETTE, orthogonal au clair/sombre
 * du ThemeToggle voisin. Un thème = un jeu de valeurs de tokens (couleur + rayons,
 * index.css `data-theme-name`) ; Roadmapped = la base. Même idiome Popover que
 * UpdateNotice/FilterMenu (trigger icône-seule dans le cluster droit du header).
 *
 * Pastille = l'accent CLAIR du thème (aperçu figé ici, l'unique hex hors index.css :
 * juste pour reconnaître la palette dans la liste). Le mécanisme + la persistance
 * vivent dans src/state/theme.ts.
 */
const SWATCH: Record<ThemeName, string> = {
  roadmapped: '#2563eb', github: '#0969da', cursor: '#141414', claude: '#c15f3c',
}

export function ThemePicker() {
  const [name, setName] = useThemeName()
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Theme: ${THEME_LABELS[name]} (click to change)`}
        title="Theme"
        className="flex items-center rounded-interactive ring-1 ring-inset ring-border bg-foreground px-s py-xs text-textsoft transition-colors hover:bg-rollover data-[popup-open]:bg-active data-[popup-open]:text-texthard"
      >
        <ColorPalette size={12} className="my-0.5" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="origin-[var(--transform-origin)] overflow-hidden rounded-interactive bg-foreground ring-1 ring-inset ring-border py-xs shadow-lg transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 motion-reduce:transition-none">
            {THEME_NAMES.map((t) => {
              const active = t === name
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setName(t)}
                  aria-pressed={active}
                  className={`flex w-full items-center gap-s px-m py-s text-left text-xs hover:bg-rollover ${
                    active ? 'font-medium text-texthard' : 'text-textsoft'
                  }`}
                >
                  <span
                    className="size-3 shrink-0 rounded-round"
                    style={{ backgroundColor: SWATCH[t] }}
                    aria-hidden="true"
                  />
                  <span className="whitespace-nowrap">{THEME_LABELS[t]}</span>
                  {active && <Check size={12} className="shrink-0 text-accent" aria-hidden="true" />}
                </button>
              )
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
