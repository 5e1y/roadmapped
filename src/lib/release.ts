/**
 * Regroupement des tâches terminées par RELEASE (#342). La colonne « Terminées »
 * du Backlog se plie en accordéons « 0.2.3 (12) », release la plus récente
 * ouverte, le reste replié.
 */

/** Sentinelle des done SANS release. Défensif : après #340 il n'en reste pas. */
export const PRE_RELEASE = 'pre-release'

/**
 * Compare deux clés de release pour un tri DÉCROISSANT (plus récente d'abord).
 * Cœur NUMÉRIQUE segment par segment — '0.10.0' passe AVANT '0.9.0' (jamais
 * lexicographique). Préfixe 'v' ignoré. Une pré-version (`-rc`, `-beta`) est
 * plus ANCIENNE que la version finale de même cœur (1.0.0 > 1.0.0-rc.1) — #365 :
 * l'ancien code parsait '0.2.3-rc.1' en cœur [0,2,3,1] et classait la rc au-dessus
 * de 0.2.3. La sentinelle 'pre-release' reste TOUJOURS en dernier.
 * ponytail: départage lexical entre DEUX pré-versions ('rc.10' < 'rc.9') — plafond
 * assumé, non atteignable (le champ ne porte que des X.Y.Z propres, cf. #341).
 */
export function compareReleasesDesc(a: string, b: string): number {
  if (a === b) return 0
  if (a === PRE_RELEASE) return 1
  if (b === PRE_RELEASE) return -1
  const parse = (s: string) => {
    const [core, pre = ''] = s.replace(/^v/i, '').split('-', 2) // '0.2.3-rc.1' → '0.2.3' + 'rc.1'
    return { core: core.split('.').map((n) => parseInt(n, 10) || 0), pre }
  }
  const A = parse(a)
  const B = parse(b)
  const len = Math.max(A.core.length, B.core.length)
  for (let i = 0; i < len; i++) {
    const d = (B.core[i] ?? 0) - (A.core[i] ?? 0)
    if (d !== 0) return d
  }
  if (A.pre === B.pre) return 0
  if (!A.pre) return -1 // a est final → plus récent → avant b
  if (!B.pre) return 1 // b est final → plus récent
  return A.pre < B.pre ? 1 : -1 // deux pré-versions : la plus « haute » d'abord
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
