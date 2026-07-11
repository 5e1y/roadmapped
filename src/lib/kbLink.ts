import { parseRef } from './refExtract'
import type { KbNode, KbEdge } from '../server/kb'
import type { TaskTree, TaskNode } from './tasks'

/**
 * Liage TICKETS ⇄ GRAPHE (#kb) — 100 % DÉRIVÉ, aucun champ nouveau dans le YAML.
 * Le pivot est le champ `refs` des tâches (chemins repo-relatifs, ancre
 * #symbol/:line optionnelle) : on le JOINT au `source_file` des nœuds Graphify.
 * Aucun `kbLinks` à saisir, schéma/validation des tâches intacts.
 *
 * Module PUR (aucun fs, aucun React) : `import type` du serveur = effacé au build.
 */

export interface KbNeighborhood {
  /** Nœuds dont source_file est cité par une `ref` de la tâche. */
  direct: KbNode[]
  /** Voisins à 1 saut des nœuds directs (hors directs eux-mêmes). */
  neighbors: KbNode[]
}

export interface KbLinkIndex {
  /** Voisinage KB d'une tâche (directs + voisins), déterministe (trié par id). */
  neighborhoodOf(taskId: number): KbNeighborhood
  /** Tâches qui CITENT ce nœud (via une ref sur son source_file). Triées. */
  ticketsOfNode(nodeId: string): number[]
}

/** Aplatit toutes les tâches (sections + sous-tâches, tous statuts). */
function allTasks(tree: TaskTree): TaskNode[] {
  const out: TaskNode[] = []
  const walk = (t: TaskNode) => { out.push(t); t.subtasks.forEach(walk) }
  for (const s of tree.sections) for (const t of s.tasks) walk(t)
  return out
}

/** Chemin d'une ref, ancre (#symbol / :line) retirée — sert au match fichier. */
function refPath(ref: string): string {
  return parseRef(ref).path
}

const emptyNeighborhood: KbNeighborhood = { direct: [], neighbors: [] }

export function buildKbLinkIndex(tree: TaskTree, nodes: KbNode[], edges: KbEdge[]): KbLinkIndex {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // source_file → nœuds (un fichier peut porter plusieurs symboles/nœuds).
  const nodesByFile = new Map<string, KbNode[]>()
  for (const n of nodes) {
    if (!n.sourceFile) continue
    const list = nodesByFile.get(n.sourceFile)
    if (list) list.push(n)
    else nodesByFile.set(n.sourceFile, [n])
  }

  // Adjacence NON-DIRIGÉE (le graphe Graphify est non-dirigé).
  const adj = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    const s = adj.get(a); if (s) s.add(b); else adj.set(a, new Set([b]))
  }
  for (const e of edges) { link(e.source, e.target); link(e.target, e.source) }

  // Index inverse nœud → tâches (via les refs), construit une fois.
  const ticketsByNode = new Map<string, Set<number>>()
  const directIdsOfTask = new Map<number, Set<string>>()
  for (const t of allTasks(tree)) {
    const directIds = new Set<string>()
    for (const ref of t.refs) {
      for (const n of nodesByFile.get(refPath(ref)) ?? []) {
        directIds.add(n.id)
        const set = ticketsByNode.get(n.id)
        if (set) set.add(t.id); else ticketsByNode.set(n.id, new Set([t.id]))
      }
    }
    directIdsOfTask.set(t.id, directIds)
  }

  const sortNodes = (ids: Iterable<string>): KbNode[] =>
    [...ids].sort().map((id) => nodeById.get(id)).filter((n): n is KbNode => n != null)

  return {
    neighborhoodOf(taskId) {
      const directIds = directIdsOfTask.get(taskId)
      if (!directIds || directIds.size === 0) return emptyNeighborhood
      const neighborIds = new Set<string>()
      for (const id of directIds) {
        for (const nb of adj.get(id) ?? []) {
          if (!directIds.has(nb)) neighborIds.add(nb)
        }
      }
      return { direct: sortNodes(directIds), neighbors: sortNodes(neighborIds) }
    },
    ticketsOfNode(nodeId) {
      return [...(ticketsByNode.get(nodeId) ?? [])].sort((a, b) => a - b)
    },
  }
}
