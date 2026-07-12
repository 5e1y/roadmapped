import type { KbGraph, KbNode, KbEdge } from '../server/kb'
import type { TaskTree } from './tasks'
import { buildKbLinkIndex } from './kbLink.ts'
import { matchNodes } from './kbFilter.ts'

/**
 * Requêtes AGENT sur le knowledge graph (#309) — la couche que le MCP GÉNÉRIQUE
 * de Graphify (query_graph / get_neighbors / shortest_path) n'a pas : le LIAGE
 * Roadmapped tâche⇄graphe. Réutilise le join pur `buildKbLinkIndex` (refs⇄
 * source_file, kbLink.ts) et la recherche `matchNodes` (kbFilter.ts) — aucune
 * réimplémentation. Pur (aucun fs, aucun réseau) : consommé identiquement par le
 * serveur MCP (scripts/mcp-server.mjs) et le CLI (scripts/task.mjs), testé à part.
 */

const SEARCH_LIMIT = 40

/** Une ligne compacte pour un nœud (label, type, fichier:emplacement). */
function nodeLine(n: KbNode): string {
  const loc = n.sourceLocation ? `:${n.sourceLocation}` : ''
  return `  ${n.label}  [${n.fileType}]  ${n.sourceFile ?? '(no file)'}${loc}`
}

export interface KbNeighborhood {
  direct: KbNode[]
  neighbors: KbNode[]
}

/** Voisinage KB d'une tâche : nœuds cités par ses `refs` (directs) + voisins 1 saut. */
export function kbNeighborhood(tree: TaskTree, graph: KbGraph, taskId: number): KbNeighborhood {
  return buildKbLinkIndex(tree, graph.nodes, graph.edges).neighborhoodOf(taskId)
}

export function neighborhoodText(taskId: number, taskTitle: string | null, nb: KbNeighborhood): string {
  const head = `#${taskId}${taskTitle ? ` — ${taskTitle}` : ''}`
  if (nb.direct.length === 0 && nb.neighbors.length === 0) {
    return `KB neighborhood of ${head}: none (this task has no refs matching a graph node — add refs, or explore normally).`
  }
  const L = [`KB neighborhood of ${head}:`]
  L.push(`  directly touches (${nb.direct.length}) — the files this task references:`)
  for (const n of nb.direct) L.push(nodeLine(n))
  if (nb.neighbors.length) {
    L.push(`  connected 1 hop away (${nb.neighbors.length}) — what those files import/call/cite:`)
    for (const n of nb.neighbors) L.push(nodeLine(n))
  }
  return L.join('\n')
}

// ---------------------------------------------------------------- brief embarqué (#325)
// Le voisinage KB servi D'OFFICE dans take/brief (spec graphify-anchoring §P0) :
// l'agent reçoit la carte sans y penser. BORNÉ pour rester quelques dizaines de
// lignes, pas 200 nœuds : tous les directs (capés) + les voisins 1 saut les plus
// connectés (degré = nombre d'arêtes dans le graphe entier).

export const BRIEF_DIRECT_LIMIT = 12
export const BRIEF_NEIGHBOR_LIMIT = 8

export interface BoundedNeighborhood {
  direct: KbNode[]
  neighbors: KbNode[]
  /** Totaux AVANT bornage — affichés (« 8 of 23 ») pour ne rien cacher. */
  directTotal: number
  neighborTotal: number
}

/** Directs : couvrir CHAQUE fichier de refs avant d'empiler les symboles d'un
 *  même fichier (round-robin par source_file, ordre stable) — sans ça, les N
 *  slots seraient mangés par les 40 nœuds-symboles du premier fichier et les
 *  autres refs deviendraient invisibles. Pur, déterministe. */
function roundRobinByFile(nodes: KbNode[], max: number): KbNode[] {
  const byFile = new Map<string, KbNode[]>()
  for (const n of nodes) {
    const key = n.sourceFile ?? n.id
    const list = byFile.get(key)
    if (list) list.push(n)
    else byFile.set(key, [n])
  }
  const buckets = [...byFile.values()]
  const out: KbNode[] = []
  for (let round = 0; out.length < max; round++) {
    let picked = false
    for (const b of buckets) {
      if (round >= b.length) continue
      out.push(b[round])
      picked = true
      if (out.length >= max) break
    }
    if (!picked) break
  }
  return out
}

/** Borne un voisinage pour le brief : directs en round-robin par fichier (capés),
 *  voisins triés par degré décroissant (id croissant en bris d'égalité). Pur. */
export function boundNeighborhood(
  nb: KbNeighborhood,
  edges: KbEdge[],
  maxDirect = BRIEF_DIRECT_LIMIT,
  maxNeighbors = BRIEF_NEIGHBOR_LIMIT,
): BoundedNeighborhood {
  const degree = new Map<string, number>()
  const bump = (id: string) => degree.set(id, (degree.get(id) ?? 0) + 1)
  for (const e of edges) { bump(e.source); bump(e.target) }
  const neighbors = [...nb.neighbors]
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1))
    .slice(0, maxNeighbors)
  return {
    direct: roundRobinByFile(nb.direct, maxDirect),
    neighbors,
    directTotal: nb.direct.length,
    neighborTotal: nb.neighbors.length,
  }
}

/** Section « Knowledge base » du brief. null si aucun ref ne matche un nœud
 *  (section omise : un brief sans carte reste un brief, pas une excuse). */
export function briefNeighborhoodText(bn: BoundedNeighborhood): string | null {
  if (bn.directTotal === 0) return null
  const count = (shown: number, total: number) => (total > shown ? `${shown} of ${total}` : `${shown}`)
  const L = ['Knowledge base — what this task touches (from its refs):']
  L.push(`  direct (${count(bn.direct.length, bn.directTotal)}):`)
  for (const n of bn.direct) L.push(`  ${nodeLine(n)}`)
  if (bn.neighbors.length) {
    L.push(`  1 hop away (${count(bn.neighbors.length, bn.neighborTotal)}, most connected first) — what those files import/call/cite:`)
    for (const n of bn.neighbors) L.push(`  ${nodeLine(n)}`)
  }
  return L.join('\n')
}

export interface KbSearchResult {
  hits: KbNode[]
  total: number
}

/** Nœuds dont le label (ou le fichier) matche la requête ; tronqué à `limit`. */
export function kbSearch(graph: KbGraph, query: string, limit = SEARCH_LIMIT): KbSearchResult {
  const ids = matchNodes(graph.nodes, query)
  const all = graph.nodes.filter((n) => ids.has(n.id))
  return { hits: all.slice(0, limit), total: all.length }
}

export function searchText(query: string, hits: KbNode[], total: number): string {
  if (total === 0) return `No KB node matches "${query}".`
  const L = [`${total} KB node(s) match "${query}"${total > hits.length ? ` (showing ${hits.length})` : ''}:`]
  for (const n of hits) L.push(nodeLine(n))
  return L.join('\n')
}

export interface KbNodeDetail {
  node: KbNode
  /** Ids des tâches qui CITENT le fichier de ce nœud (index inverse kbLink). */
  tickets: number[]
}

/** Détail d'un nœud + « tickets touching this » (ticketsOfNode). null si absent. */
export function kbNode(tree: TaskTree, graph: KbGraph, nodeId: string): KbNodeDetail | null {
  const node = graph.nodes.find((n) => n.id === nodeId)
  if (!node) return null
  const tickets = buildKbLinkIndex(tree, graph.nodes, graph.edges).ticketsOfNode(nodeId)
  return { node, tickets }
}

export function nodeText(detail: KbNodeDetail, titleOf: (id: number) => string | null): string {
  const n = detail.node
  const L = [
    `${n.label}  [${n.fileType}]`,
    `  id: ${n.id}`,
    `  source: ${n.sourceFile ?? '(no file)'}${n.sourceLocation ? `:${n.sourceLocation}` : ''}`,
    `  community: ${n.community >= 0 ? n.community : '—'}`,
  ]
  if (n.rationale) L.push(`  rationale: ${n.rationale}`)
  if (detail.tickets.length === 0) {
    L.push('  tickets touching this: none')
  } else {
    L.push(`  tickets touching this (${detail.tickets.length}):`)
    for (const id of detail.tickets) {
      const t = titleOf(id)
      L.push(`    #${id}${t ? ` ${t}` : ''}`)
    }
  }
  return L.join('\n')
}
