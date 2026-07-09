import { Graph, layout as dagreLayout } from '@dagrejs/dagre'
import type { TaskTree, TaskNode, SectionNode, Epic, Temperature } from './tasks'
import { countTasksDeep, DEFAULT_BASE_HEAT } from './tasks.ts'

export type Availability = 'done' | 'available' | 'locked'

function flatten(sections: SectionNode[]): TaskNode[] {
  const out: TaskNode[] = []
  const visit = (t: TaskNode) => { out.push(t); t.subtasks.forEach(visit) }
  for (const s of sections) s.tasks.forEach(visit)
  return out
}

/** Toutes les tâches du backlog (sections + sous-tâches), à plat. */
export function activeTasks(tree: TaskTree): TaskNode[] {
  return flatten(tree.sections)
}

/**
 * État de chaque tâche : done / available / locked.
 * - done  : status === 'done'
 * - available : status ≠ done ET toutes les deps sont done — une dep n'est done
 *              QUE si sa tâche existe avec status 'done' (une dep vers un id
 *              inconnu verrouille donc ; la validation l'interdit de toute façon)
 * - locked : au moins une dep non done
 */
// Mémo par identité de tree (#130) : computeAvailability est appelé une fois par
// ligne de backlog (TaskRow) + par le panneau + par la roadmap. Le tree est un
// snapshot immuable reconstruit à chaque écriture → un nouvel objet = un nouveau
// calcul, l'ancien est GC'd avec la WeakMap. Évite le O(n²) de recalcul par ligne.
const availabilityCache = new WeakMap<TaskTree, Map<number, Availability>>()

export function computeAvailability(tree: TaskTree): Map<number, Availability> {
  const cached = availabilityCache.get(tree)
  if (cached) return cached
  const active = flatten(tree.sections)
  const activeById = new Map(active.map((t) => [t.id, t]))
  const isDone = (id: number): boolean => activeById.get(id)?.status === 'done'
  const result = new Map<number, Availability>()
  for (const t of active) {
    if (t.status === 'done') result.set(t.id, 'done')
    else result.set(t.id, t.dependsOn.every(isDone) ? 'available' : 'locked')
  }
  availabilityCache.set(tree, result)
  return result
}

/**
 * Prérequis d'une tâche qui ne sont PAS encore faits, d'après la carte
 * d'availability. Cohérent avec computeAvailability : une dep est faite
 * uniquement si sa tâche existe avec l'état 'done' (une dep vers un id inconnu
 * est donc manquante). Source unique partagée par le Graphe et les Colonnes
 * pour afficher « Prérequis manquants (#…) » de façon cohérente.
 */
export function missingPrereqs(task: TaskNode, avail: Map<number, Availability>): number[] {
  return task.dependsOn.filter((d) => avail.get(d) !== 'done')
}

/**
 * Dépendances INVERSES : les tâches (sous-tâches comprises) dont `dependsOn`
 * contient `id`. Triées par id croissant. Alimente le bloc « Bloque »
 * du panneau — entièrement calculé, aucun champ YAML.
 */
export function reverseDependents(tree: TaskTree, id: number): TaskNode[] {
  return activeTasks(tree)
    .filter((t) => t.dependsOn.includes(id))
    .sort((a, b) => a.id - b.id)
}

/**
 * État d'affichage d'une dépendance (bloc « Dépend de » du panneau) :
 * l'availability calculée de la tâche — 'done' | 'available' | 'locked'
 * (réutilise computeAvailability, source unique de l'état des tâches).
 * Défensif : un id inconnu (la validation l'interdit) s'affiche 'locked',
 * cohérent avec computeAvailability qui ne le compte jamais done.
 */
export function depState(tree: TaskTree, id: number): Availability {
  return computeAvailability(tree).get(id) ?? 'locked'
}

// ── Vue Graphe : layout flux-de-dépendances (dagre) ─────────────────────────
// Décision Rémi 2026-07-08 (graph-v2) : le placement quitte la grille
// section×couche faite main pour dagre (rankdir LR, croisements minimisés).
// dagre est un DÉTAIL D'IMPLÉMENTATION caché derrière graphLayout — le
// composant n'importe jamais dagre, il ne reçoit que des coordonnées.
// PAS de mode compound : l'unité du graphe est déjà le nœud-epic (#135, une
// seule boîte par epic) ou la tâche standalone — il n'y a rien à « grouper ».

/** Unités du graphe (nœud-epic ou tâche standalone), tailles connues d'avance. */
export interface GraphInput {
  nodes: Array<{ id: string; width: number; height: number }>
  /** from = prérequis, to = dépendant — uniquement entre nœuds présents. */
  edges: Array<{ from: string; to: string }>
}

export interface GraphPoint { x: number; y: number }

export interface GraphLayout {
  /** Positions en COIN HAUT-GAUCHE (dagre donne des centres, convertis ici). */
  nodes: Map<string, { x: number; y: number; w: number; h: number }>
  /** Polyligne routée par dagre, clé `${from}->${to}`. */
  edges: Map<string, { points: GraphPoint[] }>
  width: number
  height: number
}

const GRAPH_PAD = 24

// Mémo par identité du GraphInput (même pattern que availabilityCache) : le
// composant construit l'input dans un useMemo (tree + showDone + epics dépliés)
// → un render de hover/zoom/pan réutilise l'input, donc AUCUN recalcul dagre.
const graphLayoutCache = new WeakMap<GraphInput, GraphLayout>()

/**
 * Layout flux-de-dépendances : prérequis à GAUCHE, dépendant à DROITE
 * (rankdir LR), croisements minimisés par dagre (Sugiyama). Pur et mémoïsé.
 * Défensif : arêtes vers un nœud absent ou boucles sur soi ignorées ; un cycle
 * au niveau nœud (deux epics entremêlés) est cassé par dagre sans diverger.
 */
export function graphLayout(input: GraphInput): GraphLayout {
  const cached = graphLayoutCache.get(input)
  if (cached) return cached
  const g = new Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 28, ranksep: 72, edgesep: 16, marginx: GRAPH_PAD, marginy: GRAPH_PAD })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(input.nodes.map((n) => n.id))
  for (const n of input.nodes) g.setNode(n.id, { width: n.width, height: n.height })
  for (const e of input.edges) {
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to)) continue
    g.setEdge(e.from, e.to)
  }
  dagreLayout(g)
  const nodes = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const n of input.nodes) {
    const pos = g.node(n.id)
    // Centre → coin haut-gauche (positionnement absolu des cartes).
    nodes.set(n.id, { x: pos.x - n.width / 2, y: pos.y - n.height / 2, w: n.width, h: n.height })
  }
  const edges = new Map<string, { points: GraphPoint[] }>()
  for (const e of g.edges()) {
    edges.set(`${e.v}->${e.w}`, { points: g.edge(e).points ?? [] })
  }
  const label = g.graph()
  const result: GraphLayout = {
    nodes, edges,
    width: Math.max(label.width ?? 0, GRAPH_PAD * 2),
    height: Math.max(label.height ?? 0, GRAPH_PAD * 2),
  }
  graphLayoutCache.set(input, result)
  return result
}

/**
 * Fermeture transitive d'un nœud dans le sous-graphe AFFICHÉ (mêmes arêtes que
 * le rendu) : ancestors = prérequis amont, descendants = dépendants aval — le
 * nœud lui-même n'est dans aucun des deux ensembles. Alimente le surlignage au
 * survol de la Vue Graphe. O(V+E), défensif sur les cycles (ensembles `seen`).
 */
export function graphNeighborhood(
  edges: Array<{ from: string; to: string }>, id: string,
): { ancestors: Set<string>; descendants: Set<string> } {
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const e of edges) {
    up.set(e.to, [...(up.get(e.to) ?? []), e.from])
    down.set(e.from, [...(down.get(e.from) ?? []), e.to])
  }
  const closure = (adj: Map<string, string[]>): Set<string> => {
    const seen = new Set<string>()
    const queue = [...(adj.get(id) ?? [])]
    while (queue.length > 0) {
      const k = queue.pop()!
      if (k === id || seen.has(k)) continue
      seen.add(k)
      queue.push(...(adj.get(k) ?? []))
    }
    return seen
  }
  return { ancestors: closure(up), descendants: closure(down) }
}

/** Progression d'un epic : tâches portant ce slug. */
export function epicProgress(tree: TaskTree, slug: string): { done: number; total: number } {
  const tasks = flatten(tree.sections).filter((t) => t.epic === slug)
  return { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length }
}

/**
 * Progression GLOBALE du lancement : done/total sur les stages actifs — les
 * stages abandonnés/en veille sont exclus (leur travail n'est pas « à faire »).
 * Compte simple de tâches, sous-tâches comprises (pas de pondération par
 * size — décision ferme #133, YAGNI).
 */
export function globalProgress(tree: TaskTree): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const s of tree.sections) {
    if (s.status === 'abandoned' || s.status === 'dormant') continue
    const c = countTasksDeep(s.tasks)
    done += c.done
    total += c.total
  }
  return { done, total }
}

/**
 * TOUS les epics du projet : les déclarés (_epics.yaml, ordre préservé, titre
 * lisible) puis les auto-découverts sur les tâches actives (ordre alphabétique,
 * titre = slug). Source unique du regroupement (dashboard, CLI `roadmap`, panneau).
 */
export function allEpics(tree: TaskTree): Epic[] {
  const declared = tree.epics.filter((e) => e.slug !== '')
  const seen = new Set(declared.map((e) => e.slug))
  const discovered = [...new Set(
    flatten(tree.sections).map((t) => t.epic).filter((e): e is string => e !== null && !seen.has(e)),
  )].sort()
  return [...declared, ...discovered.map((slug) => ({ slug, title: slug }))]
}

/** Slug depuis un titre : ASCII minuscule, tirets, 40 car. max. Fallback "roadmap". */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'roadmap'
  )
}

// ── Température (#234, phase 2) ───────────────────────────────────────────────
// Spec : docs/specs/2026-07-09-next-temperature-brainstorm.md (partition TIERS
// ÉGAUX, verrouillée). température = auto + base + seed, chaque terme ≤ ~33,33,
// total arrondi à 0,01 AVANT tri. Fonction PURE, mémoïsée par identité de tree
// (même pattern que computeAvailability) ET par `today` (granularité JOUR).

// La chaleur de départ (le tiers `base`) vit dans le JALON : le champ `baseHeat` de
// `_section.yaml` (semé à l'init/migration depuis TYPES). Le moteur la LIT de la section
// du ticket ; `DEFAULT_BASE_HEAT` (issu de TYPES) n'est que le FALLBACK si le champ manque.

/** Constantes du tiers machine et des saturations (§2.2), fixes et versionnées. */
const W_BLOCK = 20 // poids des blocages aval
const W_AGE = 13.33 // poids de l'âge (20 + 13,33 = 33,33 = le tiers machine)
const AUTO_CAP = 33.33 // ceinture du tiers machine
const K_AGE = 90 // demi-vie de l'âge (jours)
const K_BLOCK = 4 // demi-vie des blocages

/** Date locale (fix #232) : "YYYY-MM-DD[T…]" → ms de minuit LOCAL du jour calendaire. */
function localDayMs(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime()
}

/** Jours entiers écoulés de createdAt à today, en dates LOCALES (≥ 0). */
function ageInDays(createdAt: string, today: string): number {
  const days = Math.floor((localDayMs(today) - localDayMs(createdAt)) / 86_400_000)
  return days > 0 ? days : 0
}

/** Date du jour locale "YYYY-MM-DD" — défaut de `today` (dupliqué de render pour éviter le cycle). */
function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Arrondi à 0,01 (la valeur affichée EST la valeur de tri, §2.2). */
function round2(x: number): number {
  return Math.round(x * 100) / 100
}

interface TempCacheEntry {
  today: string
  /** id → b : nb de descendants transitifs ACTIFS NON-done (blocages aval). */
  bById: Map<number, number>
  /** clé de section ("01-bug") → base résolue (baseHeat du jalon, sinon défaut code). */
  baseByKey: Map<string, number>
}
const temperatureCache = new WeakMap<TaskTree, TempCacheEntry>()

/**
 * Contexte de température mémoïsé par (tree, today), calculé en une passe :
 *  - `bById` : pour CHAQUE tâche, `b` = descendants transitifs (fermeture aval du
 *    graphe `dependsOn`, sous-tâches comprises) ACTIFS et NON-done. O(V·(V+E)).
 *  - `baseByKey` : la base de chaque section = son `baseHeat` (jalon) si présent,
 *    sinon le défaut code (`DEFAULT_BASE_HEAT`, issu de TYPES) — jamais 0 par surprise.
 */
function temperatureContext(tree: TaskTree, today: string): TempCacheEntry {
  const cached = temperatureCache.get(tree)
  if (cached && cached.today === today) return cached
  const active = flatten(tree.sections)
  const statusById = new Map<number, TaskNode['status']>()
  const down = new Map<number, number[]>() // prérequis → [dépendants directs]
  for (const t of active) {
    statusById.set(t.id, t.status)
    for (const dep of t.dependsOn) {
      down.set(dep, [...(down.get(dep) ?? []), t.id])
    }
  }
  const bById = new Map<number, number>()
  for (const t of active) {
    const seen = new Set<number>()
    const stack = [...(down.get(t.id) ?? [])]
    while (stack.length > 0) {
      const k = stack.pop()!
      if (k === t.id || seen.has(k)) continue
      seen.add(k)
      stack.push(...(down.get(k) ?? []))
    }
    let b = 0
    for (const id of seen) {
      const st = statusById.get(id)
      if (st !== undefined && st !== 'done') b += 1
    }
    bById.set(t.id, b)
  }
  const baseByKey = new Map<string, number>()
  for (const s of tree.sections) {
    const slug = s.key.replace(/^\d+-/, '')
    baseByKey.set(s.key, typeof s.baseHeat === 'number' ? s.baseHeat : (DEFAULT_BASE_HEAT[slug] ?? 0))
  }
  const entry: TempCacheEntry = { today, bById, baseByKey }
  temperatureCache.set(tree, entry)
  return entry
}

/**
 * Température d'une tâche (#234) — fonction PURE, mémoïsée par (tree, today).
 * `temperature = auto + base + seed`, chaque terme dans son tiers (§2), total
 * arrondi à 0,01. `base` vient du `baseHeat` de la SECTION du ticket (défaut code si
 * absent). La décomposition {auto, base, seed} est rendue pour l'affichage (arrondie
 * de même) ; `value` est l'arrondi de la somme des termes NON arrondis (c'est ce qui
 * reproduit le mini-exemple du doc au centième).
 */
export function temperature(tree: TaskTree, task: TaskNode, today: string = todayLocal()): Temperature {
  const ctx = temperatureContext(tree, today)
  const b = ctx.bById.get(task.id) ?? 0
  const B = b / (b + K_BLOCK)
  const age = ageInDays(task.createdAt, today)
  const A = age / (age + K_AGE)
  const autoRaw = Math.min(AUTO_CAP, W_BLOCK * B + W_AGE * A)
  const sectionKey = task.file.split('/')[2] ?? ''
  const baseRaw = ctx.baseByKey.get(sectionKey) ?? (DEFAULT_BASE_HEAT[sectionKey.replace(/^\d+-/, '')] ?? 0)
  const seedRaw = (typeof task.heat === 'number' ? task.heat : 0) / 3
  return {
    value: round2(autoRaw + baseRaw + seedRaw),
    auto: round2(autoRaw),
    base: round2(baseRaw),
    seed: round2(seedRaw),
  }
}

/**
 * Attache `temperature` à CHAQUE tâche active (sous-tâches comprises) — mutation en
 * place d'un tree FRAÎCHEMENT construit (l'API en rebuild un par requête). Sert le
 * payload /api/tree (#234) ; les consommateurs qui ignorent le champ sont intacts.
 */
export function attachTemperatures(tree: TaskTree, today: string = todayLocal()): TaskTree {
  for (const t of flatten(tree.sections)) t.temperature = temperature(tree, t, today)
  return tree
}

/**
 * LA file de travail canonique. Les FILTRES sont inchangés (décision Rémi 2026-07-07) :
 * tâches todo DISPONIBLES (deps done — jamais un `locked`), premier niveau, section
 * `open`. `type` optionnelle = filtre par nature (#230, "01-bug" ou "bug"). Le TRI
 * (#234, phase 2) : TEMPÉRATURE décroissante puis id croissant (tie-break : le plus
 * ancien). C'est l'app qui calcule — le CLI sert, le skill CONSOMME sans recalculer.
 * `today` traverse (granularité JOUR, pur/testable).
 */
export function nextQueue(tree: TaskTree, opts: { type?: string; today?: string } = {}): TaskNode[] {
  const avail = computeAvailability(tree)
  const today = opts.today ?? todayLocal()
  const bareType = (key: string) => key.replace(/^\d+-/, '')
  const out: Array<{ temp: number; task: TaskNode }> = []
  for (const section of tree.sections) {
    if (section.status !== 'open') continue
    if (opts.type && section.key !== opts.type && bareType(section.key) !== opts.type) continue
    for (const t of section.tasks) {
      if (t.status !== 'todo') continue
      if (avail.get(t.id) !== 'available') continue
      out.push({ temp: temperature(tree, t, today).value, task: t })
    }
  }
  return out
    .sort((a, b) => b.temp - a.temp || a.task.id - b.task.id)
    .map((x) => x.task)
}
