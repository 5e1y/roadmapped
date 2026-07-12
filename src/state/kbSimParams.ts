import { useSyncExternalStore } from 'react'
import { KB_SIM, sanitizeKbSimOverrides, type KbSimParams } from '../lib/kbSim'

/**
 * Réglages d'affichage du graphe KB (#318) — l'override PARTIEL des params de
 * la sim (lib/kbSim), persisté dans localStorage sous `ui:kb-graph-params`
 * (même famille que ui:theme) : survit au reload ET à la fermeture du
 * dashboard. Store module-level façon uiPersist (useSyncExternalStore, snapshot
 * stable, accès localStorage défensif — mode privé / SSR).
 *
 * On ne persiste que le DIFF par rapport à KB_SIM : une valeur remise sur le
 * défaut disparaît de la clé, un override vide efface la clé (« Reset
 * defaults »). Tout ce qui sort du storage passe par sanitizeKbSimOverrides
 * (clés connues, nombres finis, clamp KB_SIM_LIMITS).
 */

export const KB_PARAMS_KEY = 'ui:kb-graph-params'

let cache: Partial<KbSimParams> | null = null
const listeners = new Set<() => void>()

function load(): Partial<KbSimParams> {
  try {
    return sanitizeKbSimOverrides(JSON.parse(localStorage.getItem(KB_PARAMS_KEY) ?? 'null'))
  } catch {
    return {}
  }
}

/** Référence stable tant que rien n'est réécrit (contrat useSyncExternalStore). */
function snapshot(): Partial<KbSimParams> {
  if (!cache) cache = load()
  return cache
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Lecture non-réactive (création du driver, hors composant). */
export function readKbSimOverrides(): Partial<KbSimParams> {
  return snapshot()
}

/** Écrit l'override (désinfecté, réduit au diff vs défauts) et notifie. `{}` = reset. */
export function setKbSimOverrides(next: Partial<KbSimParams>): void {
  const clean = sanitizeKbSimOverrides(next)
  for (const k of Object.keys(clean) as Array<keyof KbSimParams>) {
    if (clean[k] === KB_SIM[k]) delete clean[k]
  }
  cache = clean
  try {
    if (Object.keys(clean).length === 0) localStorage.removeItem(KB_PARAMS_KEY)
    else localStorage.setItem(KB_PARAMS_KEY, JSON.stringify(clean))
  } catch {
    // localStorage indisponible : l'état reste en mémoire, sans persistance.
  }
  listeners.forEach((fn) => fn())
}

/** Override courant, réactif — KbGraph pousse chaque changement au driver (live). */
export function useKbSimOverrides(): Partial<KbSimParams> {
  return useSyncExternalStore(subscribe, snapshot)
}
