import { Toggle } from '@base-ui/react/toggle'
import { Sun, Moon } from 'trinil-react'
import { useTheme } from '../state/theme'

/**
 * Bascule clair/sombre (#269) dans le cluster droit du header. Base UI `Toggle`
 * (bouton pressé) plutôt qu'un `Switch` à glissière : le header parle en
 * boutons-icônes bordés — une glissière serait le seul objet de ce langage dans
 * l'app. L'icône montre la DESTINATION (Moon en clair = « passe en sombre »,
 * Sun en sombre) ; le mécanisme de thème vit dans src/state/theme.ts.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const dark = theme === 'dark'
  return (
    <Toggle
      pressed={dark}
      onPressedChange={(p) => setTheme(p ? 'dark' : 'light')}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Light theme' : 'Dark theme'}
      className="flex items-center rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-600 transition-colors hover:bg-neutral-100"
    >
      {/* my-0.5 : cale l'icône dans la boîte 16px d'une ligne text-xs → même
          hauteur exacte que les triggers FilterMenu voisins (py-1). */}
      {dark ? <Sun size={12} className="my-0.5" /> : <Moon size={12} className="my-0.5" />}
    </Toggle>
  )
}
