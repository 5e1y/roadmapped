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
/** Préférence de l'utilisateur (#270) : 'system' = pas de choix figé, on suit l'OS. */
export type ThemeMode = 'system' | 'light' | 'dark'
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

/** Mode stocké (#270) : 'dark'/'light' = choix figé ; tout le reste = suivi système. */
function currentMode(): ThemeMode {
  let stored: string | null = null
  try { stored = localStorage.getItem(KEY) } catch { /* privé/SSR */ }
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

/** Le 3e état (#270) : 'system' efface le choix figé et rebascule live sur l'OS. */
export function setMode(mode: ThemeMode): void {
  if (mode !== 'system') return setTheme(mode)
  try { localStorage.removeItem(KEY) } catch { /* privé/SSR */ }
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(systemDark ? 'dark' : 'light')
}

/** Cycle du toggle : système → clair → sombre → système. */
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark']
export function nextMode(m: ThemeMode): ThemeMode {
  return THEME_MODES[(THEME_MODES.indexOf(m) + 1) % THEME_MODES.length]
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

/* ─────────────────────────────────────────────────────────────────────────────
 * NOM DE THÈME (#394) — axe ORTHOGONAL au clair/sombre. `data-theme-name` porte la
 * FAMILLE de palette (couleur + rayons) ; chaque thème a sa variante claire ET
 * sombre (index.css). Roadmapped = base (pas de bloc CSS) → on efface l'attribut.
 * Même mécanique que le mode : source de vérité hors React (dataset + localStorage),
 * store module-level pour garder les sélecteurs des vues synchrones.
 * ───────────────────────────────────────────────────────────────────────────── */
export type ThemeName = 'roadmapped' | 'github' | 'cursor' | 'claude' | 'codex'
export const THEME_NAMES: ThemeName[] = ['roadmapped', 'github', 'cursor', 'claude', 'codex']
export const THEME_LABELS: Record<ThemeName, string> = {
  roadmapped: 'Roadmapped', github: 'GitHub', cursor: 'Cursor', claude: 'Claude', codex: 'Codex',
}
const NAME_KEY = 'ui:theme-name'

/** Résolution PURE (testée) : un nom connu stocké prime ; sinon la base. Miroir du script anti-flash. */
export function resolveThemeName(stored: string | null): ThemeName {
  return (THEME_NAMES as string[]).includes(stored ?? '') ? (stored as ThemeName) : 'roadmapped'
}

function currentName(): ThemeName {
  return resolveThemeName(document.documentElement.dataset.themeName ?? null)
}

/** Applique un nom de thème : Roadmapped efface l'attribut (base), les autres le posent. Fige + notify. */
export function setThemeName(name: ThemeName): void {
  try { localStorage.setItem(NAME_KEY, name) } catch { /* privé/SSR : l'attribut suffit pour la session */ }
  if (name === 'roadmapped') delete document.documentElement.dataset.themeName
  else document.documentElement.dataset.themeName = name
  emit()
}

export function useThemeName(): [ThemeName, (n: ThemeName) => void] {
  const name = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    currentName,
    () => 'roadmapped' as ThemeName,
  )
  return [name, useCallback((n: ThemeName) => setThemeName(n), [])]
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const theme = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    current,
    () => 'light' as Theme, // getServerSnapshot (SSR) — jamais atteint côté client
  )
  return [theme, useCallback((t: Theme) => setTheme(t), [])]
}

/** Mode (#270) pour le toggle 3 états — distinct de useTheme qui rend le thème RÉSOLU. */
export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
  const mode = useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    currentMode,
    () => 'system' as ThemeMode,
  )
  return [mode, useCallback((m: ThemeMode) => setMode(m), [])]
}
