import { useCallback, useSyncExternalStore } from 'react'

/**
 * Persistance légère d'état d'UI (accordéons ouverts, sous-tâches dépliées) dans
 * localStorage : survit à la navigation entre vues ET au rechargement. Tout
 * accès est défensif (localStorage peut jeter en mode privé / SSR).
 *
 * Store PARTAGÉ par clé (useSyncExternalStore) : plusieurs composants peuvent
 * lire/écrire la même clé et rester synchronisés — c'est ce qui permet à la
 * Sidebar de déplier une section rendue par le Backlog.
 */
function read(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function write(key: string, arr: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(arr))
  } catch {
    // localStorage indisponible : l'état reste en mémoire, sans persistance.
  }
}

const cache = new Map<string, string[]>()
const listeners = new Map<string, Set<() => void>>()

/** Référence stable tant que la clé n'est pas réécrite (contrat useSyncExternalStore). */
function snapshot(key: string): string[] {
  if (!cache.has(key)) cache.set(key, read(key))
  return cache.get(key)!
}

function subscribe(key: string, fn: () => void): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set())
  listeners.get(key)!.add(fn)
  return () => { listeners.get(key)!.delete(fn) }
}

export function setPersistentStrings(key: string, next: string[]): void {
  cache.set(key, next)
  write(key, next)
  listeners.get(key)?.forEach((fn) => fn())
}

/** Ajoute une valeur à la clé (no-op si déjà présente) — utilisable hors composant. */
export function addPersistentString(key: string, value: string): void {
  const cur = snapshot(key)
  if (!cur.includes(value)) setPersistentStrings(key, [...cur, value])
}

/** Tableau de chaînes persisté (ex. valeurs d'Accordion.Root `multiple`). */
export function usePersistentStrings(key: string): [string[], (next: string[]) => void] {
  const value = useSyncExternalStore(
    useCallback((fn) => subscribe(key, fn), [key]),
    () => snapshot(key),
  )
  const set = useCallback((next: string[]) => setPersistentStrings(key, next), [key])
  return [value, set]
}

/** Booléen d'ouverture persisté par valeur chaîne (ex. slug d'epic déplié, #135). */
export function usePersistentStringFlag(key: string, value: string): [boolean, (open: boolean) => void] {
  const arr = useSyncExternalStore(
    useCallback((fn) => subscribe(key, fn), [key]),
    () => snapshot(key),
  )
  const set = useCallback((next: boolean) => {
    const s = new Set(snapshot(key))
    if (next) s.add(value)
    else s.delete(value)
    setPersistentStrings(key, [...s])
  }, [key, value])
  return [arr.includes(value), set]
}

/** Booléen d'ouverture persisté par identifiant numérique (ex. sous-tâches d'une ligne). */
export function usePersistentFlag(key: string, id: number): [boolean, (open: boolean) => void] {
  return usePersistentStringFlag(key, String(id))
}
