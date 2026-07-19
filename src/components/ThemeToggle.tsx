import { Desktop, Sun, Moon } from 'trinil-react'
import { useThemeMode, nextMode, type ThemeMode } from '../state/theme'

/**
 * Bascule de thème (#269) — 3 états (#270) : système → clair → sombre → système.
 * Un simple bouton qui cycle (pas un Base UI `Toggle`, qui est binaire par nature) :
 * l'icône montre le mode COURANT (Desktop = suit l'OS, Sun = clair figé, Moon =
 * sombre figé). Le mécanisme vit dans src/state/theme.ts ; « système » y efface le
 * choix figé pour resuivre l'OS à chaud.
 */
const ICON: Record<ThemeMode, typeof Sun> = { system: Desktop, light: Sun, dark: Moon }
const LABEL: Record<ThemeMode, string> = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }

export function ThemeToggle() {
  const [mode, setMode] = useThemeMode()
  const Icon = ICON[mode]
  return (
    <button
      type="button"
      onClick={() => setMode(nextMode(mode))}
      aria-label={`${LABEL[mode]} (click to cycle)`}
      title={LABEL[mode]}
      className="flex items-center rounded-interactive ring-1 ring-inset ring-border bg-foreground px-2 py-1 text-textsoft transition-colors hover:bg-rollover"
    >
      {/* my-0.5 : cale l'icône dans la boîte 16px d'une ligne text-xs → même
          hauteur exacte que les triggers FilterMenu voisins (py-1). */}
      <Icon size={12} className="my-0.5" />
    </button>
  )
}
