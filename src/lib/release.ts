/**
 * Regroupement des tâches terminées par RELEASE (#342). La colonne « Terminées »
 * du Backlog se plie en accordéons « 0.2.3 (12) », release la plus récente
 * ouverte, le reste replié.
 */

/** Sentinelle des done SANS release. Défensif : après #340 il n'en reste pas. */
export const PRE_RELEASE = 'pre-release'

/**
 * Compare deux clés de release pour un tri DÉCROISSANT (plus récente d'abord).
 * Comparaison NUMÉRIQUE segment par segment — donc '0.10.0' passe AVANT '0.9.0'
 * (jamais un tri lexicographique). Le préfixe 'v' de tête est ignoré. La
 * sentinelle 'pre-release' est TOUJOURS classée en dernier.
 */
export function compareReleasesDesc(a: string, b: string): number {
  if (a === b) return 0
  if (a === PRE_RELEASE) return 1
  if (b === PRE_RELEASE) return -1
  const seg = (s: string) => s.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pa = seg(a)
  const pb = seg(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

export interface ReleaseGroup<T> {
  /** Clé de release (ou 'pre-release' pour les done sans release). */
  release: string
  items: T[]
}

/**
 * Regroupe une liste ORDONNÉE d'items par release (clé via `releaseOf`, `null`
 * → 'pre-release'). Les groupes sont triés semver DÉCROISSANT, 'pre-release'
 * toujours en dernier ; l'ordre des items DANS un groupe est préservé (le tri
 * de recency reste la vérité de l'appelant).
 */
export function groupByRelease<T>(items: T[], releaseOf: (item: T) => string | null): ReleaseGroup<T>[] {
  const byRelease = new Map<string, T[]>()
  for (const item of items) {
    const key = releaseOf(item) ?? PRE_RELEASE
    const arr = byRelease.get(key)
    if (arr) arr.push(item)
    else byRelease.set(key, [item])
  }
  return [...byRelease.entries()]
    .map(([release, groupItems]) => ({ release, items: groupItems }))
    .sort((a, b) => compareReleasesDesc(a.release, b.release))
}
