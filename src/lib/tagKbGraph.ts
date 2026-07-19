import type { TaskNode } from './tasks'
import type { KbGraph as KbGraphData, KbNode, KbEdge } from '../server/kb'
import { tagGraph } from './tagGraph'

/**
 * Adaptateur tags → contrat Knowledge base (#375, ticket 4 de la spec
 * 2026-07-19-overview-activity-ux). L'Overview affiche le graphe de co-occurrence
 * des tags dans le MÊME visualiseur que Graphify (KbGraph) — continuité DS,
 * décision Rémi verrouillée. Plutôt qu'un second visualiseur maison (TagGraph),
 * on MAPPE la sortie de `tagGraph()` sur `KbGraphData` (le contrat de KbGraph).
 *
 * Fonction PURE et déterministe : elle ne fait que traduire une forme de données
 * en une autre (tagGraph fait déjà tout le calcul de co-occurrence + le plafond
 * de nœuds). Aucun I/O, aucun layout.
 *
 * Mapping (assumé) :
 *  - tag → KbNode : `id = label = tag` (un tag n'a pas de fichier source →
 *    sourceFile/sourceLocation null) ; `fileType: 'tag'` (type factice, distinct
 *    des file_type Graphify code|document|paper|image) ; `community: 0` (un seul
 *    cluster — les tags ne sont pas partitionnés) ; pas de `rationale`.
 *  - co-occurrence → KbEdge : `relation: 'co-occurs'`, `confidence: 'EXTRACTED'`
 *    (la paire est OBSERVÉE sur des tickets réels, pas inférée), `weight` = le
 *    nombre de tickets portant les deux tags.
 *  - `stats.communities: 1` (cohérent avec community 0 sur tous les nœuds).
 *  - `generatedAt: null` : le graphe est dérivé du tree en direct, pas d'un
 *    fichier daté.
 */

/** Le `fileType` factice porté par un nœud-tag (pas un file_type Graphify réel). */
export const TAG_NODE_FILE_TYPE = 'tag'

export function tagKbGraph(tasks: TaskNode[]): KbGraphData {
  const { nodes, edges } = tagGraph(tasks)

  const kbNodes: KbNode[] = nodes.map((n) => ({
    id: n.tag,
    label: n.tag,
    fileType: TAG_NODE_FILE_TYPE,
    sourceFile: null,
    sourceLocation: null,
    community: 0,
  }))

  const kbEdges: KbEdge[] = edges.map((e) => ({
    source: e.a,
    target: e.b,
    relation: 'co-occurs',
    confidence: 'EXTRACTED',
    weight: e.weight,
  }))

  return {
    generatedAt: null,
    nodes: kbNodes,
    edges: kbEdges,
    stats: { nodes: kbNodes.length, edges: kbEdges.length, communities: 1 },
  }
}
