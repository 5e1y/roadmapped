import { Graph, layout as dagreLayout } from '@dagrejs/dagre'
import type { TaskTree, TaskNode, SectionNode, Epic } from './tasks'
import { countTasksDeep } from './tasks.ts'

export type Availability = 'done' | 'available' | 'locked'

function flatten(sections: SectionNode[]): TaskNode[] {
  const out: TaskNode[] = []
  const visit = (t: TaskNode) => { out.push(t); t.subtasks.forEach(visit) }
  for (const s of sections) s.tasks.forEach(visit)
  return out
}

/** Toutes les tâches actives (sections actives + sous-tâches), à plat. */
export function activeTasks(tree: TaskTree): TaskNode[] {
  return flatten(tree.sections)
}

/** Toutes les tâches archivées, à plat (une dep archivée = done de fait). */
export function archivedTasks(tree: TaskTree): TaskNode[] {
  return flatten(tree.archive)
}

/**
 * État de chaque tâche ACTIVE : done / available / locked.
 * - done  : status === 'done'
 * - available : status ≠ done ET toutes les deps sont done (une dep archivée = done de fait ;
 *              une dep vers un id inconnu est ignorée défensivement — la validation l'interdit déjà)
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
  const archivedIds = new Set(flatten(tree.archive).map((t) => t.id))
  const activeById = new Map(active.map((t) => [t.id, t]))
  const isDone = (id: number): boolean => {
    if (archivedIds.has(id)) return true
    const t = activeById.get(id)
    return t ? t.status === 'done' : true
  }
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
 * d'availability. Une dep absente de la map (archivée / inconnue) est done de
 * fait — elle n'est jamais listée. Source unique partagée par le Graphe et les
 * Colonnes pour afficher « Prérequis manquants (#…) » de façon cohérente.
 */
export function missingPrereqs(task: TaskNode, avail: Map<number, Availability>): number[] {
  return task.dependsOn.filter((d) => {
    const st = avail.get(d)
    return st !== undefined && st !== 'done'
  })
}

/**
 * Dépendances INVERSES : les tâches ACTIVES (sous-tâches comprises) dont
 * `dependsOn` contient `id`. Triées par id croissant. Alimente le bloc « Bloque »
 * du panneau — entièrement calculé, aucun champ YAML.
 */
export function reverseDependents(tree: TaskTree, id: number): TaskNode[] {
  return activeTasks(tree)
    .filter((t) => t.dependsOn.includes(id))
    .sort((a, b) => a.id - b.id)
}

/**
 * État d'affichage d'une dépendance (bloc « Dépend de » du panneau) :
 * - 'archived' : la dep vit dans l'archive (done de fait, mais affichée avec son
 *   badge), OU son id est inconnu — traité comme archivé défensivement : une dep
 *   validée pointe toujours vers un id connu, on n'échoue donc pas l'affichage ;
 * - sinon l'availability calculée de la tâche active : 'done' | 'available' | 'locked'
 *   (réutilise computeAvailability, source unique de l'état des tâches).
 */
export function depState(tree: TaskTree, id: number): Availability | 'archived' {
  const archivedIds = new Set(archivedTasks(tree).map((t) => t.id))
  if (archivedIds.has(id)) return 'archived'
  return computeAvailability(tree).get(id) ?? 'archived'
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

/** Progression d'un epic : tâches actives portant ce slug (les archivées vivent dans le Backlog). */
export function epicProgress(tree: TaskTree, slug: string): { done: number; total: number } {
  const tasks = flatten(tree.sections).filter((t) => t.epic === slug)
  return { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length }
}

/**
 * Progression GLOBALE du lancement : done/total, où l'archive compte done de fait
 * (c'est l'historique livré) et les stages abandonnés/en veille sont exclus (leur
 * travail n'est pas « à faire »). Compte simple de tâches, sous-tâches comprises
 * (pas de pondération par size — décision ferme #133, YAGNI).
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
  for (const s of tree.archive) {
    const c = countTasksDeep(s.tasks)
    done += c.total // archivée = livrée, quel que soit le status stocké
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

/**
 * LA file de travail canonique (décision Rémi 2026-07-07) : les tâches todo
 * DISPONIBLES (deps done), triées par stage (une tâche Build passe avant une
 * tâche Launch) puis par ancienneté (id croissant = createdAt). C'est l'app
 * qui calcule la priorité — le CLI la sert (`next --count`), le skill la
 * CONSOMME sans jamais la recalculer (coût en tokens). Sections non `open`
 * exclues ; tâches de premier niveau uniquement (les sous-tâches suivent leur
 * parent). `team` optionnelle pour la vue Teams.
 */
export function nextQueue(tree: TaskTree, opts: { team?: string } = {}): TaskNode[] {
  const avail = computeAvailability(tree)
  // Ordre de stage = préfixe NN du dossier (robuste à l'ordre du tableau).
  const stageOf = (key: string) => parseInt(key, 10) || 0
  const out: Array<{ stage: number; task: TaskNode }> = []
  for (const section of tree.sections) {
    if (section.status !== 'open') continue
    for (const t of section.tasks) {
      if (t.status !== 'todo') continue
      if (avail.get(t.id) !== 'available') continue
      if (opts.team && t.team !== opts.team) continue
      out.push({ stage: stageOf(section.key), task: t })
    }
  }
  return out
    .sort((a, b) => a.stage - b.stage || a.task.id - b.task.id)
    .map((x) => x.task)
}
