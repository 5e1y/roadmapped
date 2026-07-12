import type { KbPlaced } from './kbLayout'

/**
 * Géométrie de SCÈNE de la Knowledge base (#308) — pur, testé à part du rendu.
 *
 * Le goulot du SVG à 2214 arêtes était le DOM : une <line> React par arête =
 * 2214 éléments réconciliés à chaque survol. Ici les arêtes sont AGRÉGÉES en
 * 2 chaînes de path (plein = EXTRACTED, pointillé = INFERRED/AMBIGUOUS) : le
 * navigateur trace le même dessin, React ne réconcilie que 2 nœuds DOM.
 */

export interface KbSceneEdge {
  source: string
  target: string
  /** EXTRACTED = trait plein ; le reste (INFERRED/AMBIGUOUS) = pointillés. */
  confidence: string
}

const fmt = (v: number): string => String(Math.round(v * 100) / 100)

/**
 * Agrège les arêtes en 2 attributs `d` (plein / pointillé). `only` restreint
 * aux arêtes touchant CE nœud (surcouche de survol). Les arêtes dont une
 * extrémité n'est pas placée sont ignorées (parité avec l'ancien rendu).
 */
export function edgePaths(
  edges: readonly KbSceneEdge[],
  placed: ReadonlyMap<string, KbPlaced>,
  only?: string,
): { solid: string; dashed: string } {
  let solid = ''
  let dashed = ''
  for (const e of edges) {
    if (only !== undefined && e.source !== only && e.target !== only) continue
    const a = placed.get(e.source)
    const b = placed.get(e.target)
    if (!a || !b) continue
    const seg = `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}`
    if (e.confidence === 'EXTRACTED') solid += seg
    else dashed += seg
  }
  return { solid, dashed }
}

/**
 * Boîte englobante (rayon compris) des nœuds placés — de TOUS, ou du
 * sous-ensemble `ids`. `null` si aucun nœud pertinent. Sert au re-centrage KB
 * (#311) : fit du sous-graphe visible au filtre, fit des résultats à la
 * recherche. Coordonnées contenu (mêmes que le layout).
 */
export function nodesBox(
  placed: ReadonlyMap<string, KbPlaced>,
  ids?: ReadonlySet<string>,
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const visit = (p: KbPlaced | undefined) => {
    if (!p) return
    minX = Math.min(minX, p.x - p.r); maxX = Math.max(maxX, p.x + p.r)
    minY = Math.min(minY, p.y - p.r); maxY = Math.max(maxY, p.y + p.r)
  }
  if (ids) for (const id of ids) visit(placed.get(id))
  else for (const p of placed.values()) visit(p)
  if (minX === Infinity) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Adjacence non-dirigée (voisinage à 1 saut du survol). */
export function buildAdjacency(edges: readonly { source: string; target: string }[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    const s = m.get(a)
    if (s) s.add(b)
    else m.set(a, new Set([b]))
  }
  for (const e of edges) {
    link(e.source, e.target)
    link(e.target, e.source)
  }
  return m
}

