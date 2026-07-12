import type { KbGraph, KbNode } from '../server/kb'
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
