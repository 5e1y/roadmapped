import { readFileSync, existsSync, statSync } from 'node:fs'

/**
 * Lecteur du graphe Graphify (Knowledge base, #kb). Miroir de `docs.ts` : le
 * dashboard LIT `graphify-out/graph.json` (généré par l'agent via `/graphify`),
 * il ne le génère jamais. Module PUR côté normalisation (`normalizeGraph`), les
 * I/O isolées dans `readKbGraph` — testable sans disque.
 *
 * Format d'entrée = node-link NetworkX standard (vérifié sur des sorties réelles
 * de Graphify) :
 *   { directed, multigraph, graph:{}, nodes:[{id,label,file_type,source_file,
 *     source_location,community,rationale?}], links:[{source,target,relation,
 *     confidence,weight,…}] }
 * Le schéma amont est PRÉ-1.0 : on NORMALISE défensivement (jamais de crash sur
 * un champ manquant/renommé) plutôt que de valider au strict.
 */

/** file_type possibles chez Graphify : code | document | paper | image. */
export interface KbNode {
  id: string
  label: string
  fileType: string
  /** Chemin repo-relatif du fichier d'origine, ou null (concept sans fichier). */
  sourceFile: string | null
  /** Ancre dans le fichier (ex. "L31"), ou null. */
  sourceLocation: string | null
  /** Communauté (Leiden/greedy) — -1 si absente du JSON. */
  community: number
  /** Le POURQUOI d'une décision, quand Graphify l'a attaché (docs). */
  rationale?: string
}

/** confidence : EXTRACTED (explicite) | INFERRED | AMBIGUOUS (l'audit trail). */
export interface KbEdge {
  source: string
  target: string
  relation: string
  confidence: string
  weight: number
}

export interface KbGraph {
  /** mtime ISO de graph.json (fraîcheur), null si indéterminable. */
  generatedAt: string | null
  nodes: KbNode[]
  edges: KbEdge[]
  stats: { nodes: number; edges: number; communities: number }
}

export type ReadKbOutcome =
  | { ok: true; graph: KbGraph | null } // graph:null = fichier absent (état NORMAL, pas une erreur)
  | { ok: false; status: 422; error: string } // JSON illisible

/** id d'un endpoint d'arête : string/number brut, ou objet node-link `{ id }`. */
function endpointId(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  if (v && typeof v === 'object' && 'id' in v) {
    const id = (v as { id: unknown }).id
    if (typeof id === 'string') return id
    if (typeof id === 'number') return String(id)
  }
  return null
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/**
 * node-link brut → KbGraph normalisé. Tolère `links` OU `edges`, endpoints en
 * string ou en objet, champs absents. Les arêtes dont un endpoint n'existe pas
 * parmi les nœuds sont écartées (graphe intègre côté rendu/liage).
 */
export function normalizeGraph(raw: unknown, generatedAt: string | null): KbGraph {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : []
  const rawLinks = Array.isArray(obj.links) ? obj.links : Array.isArray(obj.edges) ? obj.edges : []

  const nodes: KbNode[] = []
  const ids = new Set<string>()
  for (const n of rawNodes) {
    if (!n || typeof n !== 'object') continue
    const r = n as Record<string, unknown>
    const id = endpointId(r.id)
    if (id === null || ids.has(id)) continue
    ids.add(id)
    nodes.push({
      id,
      label: str(r.label) ?? id,
      fileType: str(r.file_type) ?? 'unknown',
      sourceFile: str(r.source_file),
      sourceLocation: str(r.source_location),
      community: num(r.community, -1),
      ...(str(r.rationale) ? { rationale: r.rationale as string } : {}),
    })
  }

  const edges: KbEdge[] = []
  for (const e of rawLinks) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const source = endpointId(r.source)
    const target = endpointId(r.target)
    if (source === null || target === null) continue
    if (!ids.has(source) || !ids.has(target)) continue
    edges.push({
      source,
      target,
      relation: str(r.relation) ?? 'related',
      confidence: str(r.confidence) ?? 'EXTRACTED',
      weight: num(r.weight, 1),
    })
  }

  const communities = new Set(nodes.map((n) => n.community).filter((c) => c >= 0))
  return {
    generatedAt,
    nodes,
    edges,
    stats: { nodes: nodes.length, edges: edges.length, communities: communities.size },
  }
}

/**
 * Lit + normalise le graphe. Fichier absent → { ok:true, graph:null } (le
 * dashboard affiche un empty state, ce n'est PAS une erreur). JSON cassé → 422.
 * Aucun path fourni par le client (route sans paramètre) : pas de risque de
 * traversal — `kbGraphFile` est résolu côté config (paths.ts).
 */
export function readKbGraph(kbGraphFile: string): ReadKbOutcome {
  if (!existsSync(kbGraphFile)) return { ok: true, graph: null }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(kbGraphFile, 'utf8'))
  } catch (e) {
    return { ok: false, status: 422, error: `graph.json illisible : ${(e as Error).message}` }
  }
  let generatedAt: string | null = null
  try {
    generatedAt = statSync(kbGraphFile).mtime.toISOString()
  } catch { /* mtime indisponible : fraîcheur inconnue, pas bloquant */ }
  return { ok: true, graph: normalizeGraph(raw, generatedAt) }
}
