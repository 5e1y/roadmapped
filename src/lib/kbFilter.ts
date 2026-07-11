import type { KbNode, KbEdge, KbGraph } from '../server/kb'

/**
 * Filtres + recherche PURS de la Knowledge base (#kb, phase 2). Isolés du rendu
 * pour être testés comme du calcul. La COMMUNAUTÉ est un FILTRE (options
 * étiquetées par leur god node), jamais une couleur — la DA monochrome + accent
 * est préservée.
 */

export interface KbFilters {
  /** Communautés retenues ; vide = toutes. */
  communities: number[]
  /** file_type retenus ; vide = tous. */
  fileTypes: string[]
  /** Masquer les arêtes non-EXTRACTED (INFERRED / AMBIGUOUS). */
  hideInferred: boolean
}

export interface KbFilterOption {
  value: string
  label: string
  count: number
}

/** Degré (non-dirigé) par nœud — boucles et arêtes orphelines ignorées. */
function degrees(nodes: KbNode[], edges: KbEdge[]): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id))
  const deg = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (const e of edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }
  return deg
}

/**
 * Options du filtre Communauté : une par communauté (>= 0), étiquetée par son
 * GOD NODE (le nœud de plus fort degré), comptée par nombre de nœuds. Triées
 * par taille décroissante puis id de communauté.
 */
export function communityOptions(nodes: KbNode[], edges: KbEdge[]): KbFilterOption[] {
  const deg = degrees(nodes, edges)
  const byCommunity = new Map<number, KbNode[]>()
  for (const n of nodes) {
    if (n.community < 0) continue
    const list = byCommunity.get(n.community)
    if (list) list.push(n); else byCommunity.set(n.community, [n])
  }
  return [...byCommunity.entries()]
    .map(([community, members]) => {
      const god = members.reduce((a, b) => ((deg.get(b.id) ?? 0) > (deg.get(a.id) ?? 0) ? b : a))
      return { value: String(community), label: god.label, count: members.length }
    })
    .sort((a, b) => b.count - a.count || Number(a.value) - Number(b.value))
}

/** Options du filtre Type : file_type distincts + compte, triés par compte décroissant. */
export function fileTypeOptions(nodes: KbNode[]): KbFilterOption[] {
  const counts = new Map<string, number>()
  for (const n of nodes) counts.set(n.fileType, (counts.get(n.fileType) ?? 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/**
 * Applique les filtres : nœuds retenus (communauté ET type), puis arêtes dont
 * les DEUX extrémités survivent et — si hideInferred — dont la confiance est
 * EXTRACTED. Pur : renvoie de nouveaux tableaux, ne mute rien.
 */
export function applyFilters(graph: KbGraph, filters: KbFilters): { nodes: KbNode[]; edges: KbEdge[] } {
  const comm = new Set(filters.communities)
  const types = new Set(filters.fileTypes)
  const nodes = graph.nodes.filter(
    (n) => (comm.size === 0 || comm.has(n.community)) && (types.size === 0 || types.has(n.fileType)),
  )
  const kept = new Set(nodes.map((n) => n.id))
  const edges = graph.edges.filter(
    (e) => kept.has(e.source) && kept.has(e.target) && (!filters.hideInferred || e.confidence === 'EXTRACTED'),
  )
  return { nodes, edges }
}

/**
 * Recherche : ids des nœuds dont le label OU le source_file contient `query`
 * (insensible à la casse). Requête vide → ensemble VIDE (= pas de recherche
 * active, tous les nœuds restent en pleine intensité côté rendu).
 */
export function matchNodes(nodes: KbNode[], query: string): Set<string> {
  const q = query.trim().toLowerCase()
  if (q === '') return new Set()
  const out = new Set<string>()
  for (const n of nodes) {
    if (n.label.toLowerCase().includes(q) || (n.sourceFile?.toLowerCase().includes(q) ?? false)) {
      out.add(n.id)
    }
  }
  return out
}
