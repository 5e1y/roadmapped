import { useCallback, useSyncExternalStore } from 'react'

/**
 * Thème clair/sombre (#269). Le mode sombre n'est qu'un jeu de valeurs de tokens
 * (index.css, `:root[data-theme="dark"]`) — ici on ne gère QUE l'aiguillage :
 * poser `data-theme` sur <html> + mémoriser le choix.
 *
 * PAS de provider : `ViewHeader` est monté/démonté à chaque changement de vue,
 * mais la source de vérité vit HORS React — `document.documentElement.dataset.theme`
 * (posé par le script anti-flash d'index.html AVANT le 1er paint) + localStorage.
 * Un store module-level (useSyncExternalStore) garde les toggles des 4 vues
 * synchrones. Tout accès localStorage est défensif (mode privé / SSR).
 */
export type Theme = 'light' | 'dark'
const KEY = 'ui:theme'

/**
 * Résolution PURE du thème (exportée pour le test) : un choix explicite stocké
 * prime ; toute autre valeur (null, inconnue) → on suit le système. Miroir exact
 * de la logique du script anti-flash d'index.html.
 */
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === 'dark' || stored === 'light') return stored
  return systemDark ? 'dark' : 'light'
}

/** Lecture runtime : l'attribut posé par le script anti-flash fait foi. */
function current(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

/** Applique SANS figer de choix (attribut + notify) — sert au suivi live de l'OS. */
function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t
  emit()
}

/** Choix EXPLICITE de l'utilisateur : fige en localStorage puis applique. */
export function setTheme(t: Theme): void {
  try { localStorage.setItem(KEY, t) } catch { /* privé/SSR : l'attribut suffit pour la session */ }
  applyTheme(t)
}

// Tant qu'AUCUN choix explicite n'est stocké, on suit l'OS à chaud (un changement
// de thème système se reflète sans reload). Le 1er clic fige le choix → on cesse.
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
mq?.addEventListener('change', (e) => {
  let stored: string | null = null
  try { stored = localStorage.getItem(KEY) } catch { /* ignore */ }
  if (stored === 'dark' || stored === 'light') return
  applyTheme(e.matches ? 'dark' : 'light')
})

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    current,
    () => 'light' as Theme, // getServerSnapshot (SSR) — jamais atteint côté client
  )
  return [theme, useCallback((t: Theme) => setTheme(t), [])]
}
