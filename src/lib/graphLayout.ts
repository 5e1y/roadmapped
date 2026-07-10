import { Graph, layout as dagreLayout } from '@dagrejs/dagre'

// ── Vue Graphe : layout flux-de-dépendances (dagre) ─────────────────────────
// Décision Rémi 2026-07-08 (graph-v2) : le placement quitte la grille
// section×couche faite main pour dagre (rankdir LR, croisements minimisés).
// dagre est un DÉTAIL D'IMPLÉMENTATION caché derrière graphLayout — le
// composant n'importe jamais dagre, il ne reçoit que des coordonnées.
// PAS de mode compound : l'unité du graphe est déjà le nœud-epic (#135, une
// seule boîte par epic) ou la tâche standalone — il n'y a rien à « grouper ».
//
// Isolé dans SON module (#200) : dagre (~2 Mo) ne doit être tiré QUE par le
// composant client de la Vue Graphe — jamais par roadmap.ts, que le CLI/MCP/
// serveur importent au runtime. Ainsi dagre reste une devDependency (bundlée
// dans dist/), hors de l'install hôte.

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
