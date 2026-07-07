// Résolution d'ancres de refs pour le brief (#69). L'app lit le fichier AU MOMENT
// DU SERVE : l'extrait servi est toujours le code ACTUEL, jamais figé à la création.
//
// Ce module est PUR (aucun fs, aucun git) : il opère sur des chaînes déjà lues, pour
// rester testable sans disque. Le CLI (scripts/task.mjs) fait les I/O et lui passe le
// contenu. Deux parades anti-dérive (spec token-economy §annexe pt 2) :
//   - ancrage par SYMBOLE (`fichier#nextQueue`, résolu par grep ici) — robuste au
//     déplacement de lignes ; les `:ligne` restent permis mais fragiles (documentés).
//   - le drapeau de fraîcheur (fichier modifié après createdAt) est calculé côté CLI
//     via git, pas ici.

export interface Anchor {
  kind: 'symbol' | 'line'
  value: string | number
}

/** `path#symbol` → ancre symbole ; `path:123` → ancre ligne ; `path` → pas d'ancre. */
export function parseRef(ref: string): { path: string; anchor: Anchor | null } {
  const hash = ref.indexOf('#')
  if (hash >= 0) {
    const name = ref.slice(hash + 1).trim()
    return { path: ref.slice(0, hash), anchor: name ? { kind: 'symbol', value: name } : null }
  }
  // `:ligne` seulement si un nombre pur suit les deux-points EN FIN de chaîne
  // (évite de casser un `http:` ou un `C:\` — même si les refs sont repo-relatives).
  const m = ref.match(/^(.+):(\d+)$/)
  if (m) return { path: m[1], anchor: { kind: 'line', value: Number(m[2]) } }
  return { path: ref, anchor: null }
}

/**
 * Numéro de ligne (1-based) où pointe l'ancre, ou null si introuvable/hors bornes.
 * Symbole : première ligne contenant le nom comme mot entier (grep au serve).
 */
export function locateLine(content: string, anchor: Anchor): number | null {
  const lines = content.split('\n')
  if (anchor.kind === 'line') {
    const n = Number(anchor.value)
    return n >= 1 && n <= lines.length ? n : null
  }
  const name = String(anchor.value)
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1
  }
  return null
}

/** ~10 lignes numérotées autour de `line` (radius de chaque côté), bornées au fichier. */
export function snippet(content: string, line: number, radius = 5): string {
  const lines = content.split('\n')
  const start = Math.max(1, line - radius)
  const end = Math.min(lines.length, line + radius)
  const width = String(end).length
  const out: string[] = []
  for (let i = start; i <= end; i++) out.push(`${String(i).padStart(width)}  ${lines[i - 1]}`)
  return out.join('\n')
}
