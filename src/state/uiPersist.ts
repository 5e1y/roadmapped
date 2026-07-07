import { useCallback, useState } from 'react'

/**
 * Persistance légère d'état d'UI (accordéons ouverts, sous-tâches dépliées) dans
 * localStorage : survit à la navigation entre vues ET au rechargement. Tout
 * accès est défensif (localStorage peut jeter en mode privé / SSR).
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

/** Tableau de chaînes persisté (ex. valeurs d'Accordion.Root `multiple`). */
export function usePersistentStrings(key: string): [string[], (next: string[]) => void] {
  const [value, setValue] = useState<string[]>(() => read(key))
  const set = useCallback((next: string[]) => { setValue(next); write(key, next) }, [key])
  return [value, set]
}

/** Booléen d'ouverture persisté par identifiant numérique (ex. sous-tâches d'une ligne). */
export function usePersistentFlag(key: string, id: number): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => read(key).includes(String(id)))
  const set = useCallback((next: boolean) => {
    setOpen(next)
    const s = new Set(read(key))
    if (next) s.add(String(id)); else s.delete(String(id))
    write(key, [...s])
  }, [key, id])
  return [open, set]
}
