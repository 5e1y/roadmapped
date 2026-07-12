import { createKbLayoutStepper, type KbLayoutInput, type KbLayoutResult } from './kbLayout'
import { applyFilters, truncate, filterKey, KB_MAX_NODES, type KbFilters } from './kbFilter'
import type { KbGraph, KbNode, KbEdge } from '../server/kb'

/**
 * Cache + calcul EN TRANCHES du layout KB (#308). Deux problèmes résolus :
 *
 * 1. Le layout force-directed du vrai graphe Graphify (869 nœuds) coûte
 *    ~550 ms — calculé d'un bloc, il gelait le main thread (« clic → rien →
 *    pop »). Ici la simulation avance par tranches de SLICE_MS via setTimeout,
 *    l'UI reste interactive pendant le calcul.
 * 2. Il était recalculé À CHAQUE montage de la vue (le mémo WeakMap de
 *    kbLayout est perdu quand l'input est recréé). Le cache est ici keyé par
 *    (objet graphe, clé de filtres) au niveau MODULE : changer d'onglet ou
 *    revenir à un filtre déjà vu est instantané. WeakMap → un graphe refetché
 *    libère ses layouts.
 *
 * `warmKbLayout` PRÉCHAUFFE la vue par défaut dès que le graphe est fetché
 * (KbContext) : le temps que l'utilisateur ouvre l'onglet KB, le layout est
 * généralement déjà prêt.
 */

const SLICE_MS = 8

type Listener = (result: KbLayoutResult) => void
interface Job { listeners: Set<Listener> }

const results = new WeakMap<object, Map<string, KbLayoutResult>>()
const jobs = new WeakMap<object, Map<string, Job>>()

const mapFor = <V,>(store: WeakMap<object, Map<string, V>>, key: object): Map<string, V> => {
  let m = store.get(key)
  if (!m) { m = new Map(); store.set(key, m) }
  return m
}

/** Layout déjà calculé pour (graphe, filtres), sinon null — lecture synchrone. */
export function cachedKbLayout(graphKey: object, key: string): KbLayoutResult | null {
  return results.get(graphKey)?.get(key) ?? null
}

/**
 * Garantit qu'un layout est (ou sera) calculé pour (graphe, filtres). Si déjà
 * en cache : `onDone` est appelé synchronement. Sinon un job en tranches est
 * lancé (ou rejoint s'il existe déjà — préchauffage et vue partagent le même
 * calcul). Renvoie un désabonnement ; le job, lui, court jusqu'au bout et
 * alimente le cache même sans plus aucun abonné.
 */
export function ensureKbLayout(
  graphKey: object,
  key: string,
  input: KbLayoutInput,
  onDone: Listener,
): () => void {
  const cached = cachedKbLayout(graphKey, key)
  if (cached) {
    onDone(cached)
    return () => {}
  }
  const jobMap = mapFor(jobs, graphKey)
  const existing = jobMap.get(key)
  if (existing) {
    existing.listeners.add(onDone)
    return () => existing.listeners.delete(onDone)
  }
  const job: Job = { listeners: new Set([onDone]) }
  jobMap.set(key, job)
  const stepper = createKbLayoutStepper(input)
  const tick = () => {
    if (stepper.step(SLICE_MS)) {
      const result = stepper.snapshot()
      mapFor(results, graphKey).set(key, result)
      jobMap.delete(key)
      for (const fn of job.listeners) fn(result)
    } else {
      setTimeout(tick, 0)
    }
  }
  setTimeout(tick, 0)
  return () => job.listeners.delete(onDone)
}

/** Vue par défaut (aucun filtre) — celle qu'affiche l'onglet KB à l'arrivée. */
const NO_FILTERS: KbFilters = { communities: [], fileTypes: [], hideInferred: false }

/** Sous-graphe → input de layout (ids + arêtes pondérées, rien d'autre). */
export function layoutInput(view: { nodes: KbNode[]; edges: KbEdge[] }): KbLayoutInput {
  return {
    nodes: view.nodes.map((n) => ({ id: n.id })),
    edges: view.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
  }
}

/**
 * Préchauffe le layout de la vue par défaut, en tâche de fond découpée —
 * appelé par KbContext dès que graph.json est chargé.
 */
export function warmKbLayout(graph: KbGraph): void {
  if (graph.nodes.length === 0) return
  const key = filterKey(NO_FILTERS)
  if (cachedKbLayout(graph, key)) return
  const view = truncate(applyFilters(graph, NO_FILTERS), KB_MAX_NODES)
  ensureKbLayout(graph, key, layoutInput(view), () => {})
}
