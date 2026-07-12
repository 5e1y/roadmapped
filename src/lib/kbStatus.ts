/**
 * Staleness & état du knowledge graph (#325) — logique PURE (aucun fs, aucun
 * git) : le signal est `built_at_commit` (posé par Graphify dans graph.json)
 * comparé à HEAD en NOMBRE DE COMMITS (`git rev-list --count built..HEAD`,
 * mesuré par l'appelant — kbCycle.ts). `built ≠ HEAD` seul serait trop nerveux
 * (chaque commit) : on ne signale « stale » qu'à partir d'un seuil (spec
 * graphify-anchoring §P2, défaut ~10 commits).
 *
 * Consommé par : sitrep (ligne d'état KB à chaque SessionStart), done (nudge
 * de clôture), kb doctor (exit codes scriptables).
 */

/** Seuil par défaut : périmé à partir de N commits entre le build et HEAD. */
export const KB_STALE_COMMITS = 10

export type KbStaleState = 'fresh' | 'stale' | 'unknown'

export interface KbStaleness {
  state: KbStaleState
  /** Commit de build du graphe (built_at_commit), null si non enregistré. */
  builtCommit: string | null
  /** Commits entre le build et HEAD ; null si incalculable (pas de git, sha inconnu). */
  commitsBehind: number | null
  threshold: number
}

/** Le calcul pur : commit de build + écart mesuré → fresh/stale/unknown. */
export function kbStaleness(
  builtCommit: string | null,
  commitsBehind: number | null,
  threshold = KB_STALE_COMMITS,
): KbStaleness {
  if (!builtCommit || commitsBehind === null || !Number.isInteger(commitsBehind) || commitsBehind < 0) {
    return { state: 'unknown', builtCommit: builtCommit || null, commitsBehind: null, threshold }
  }
  return { state: commitsBehind >= threshold ? 'stale' : 'fresh', builtCommit, commitsBehind, threshold }
}

const short = (sha: string): string => sha.slice(0, 7)

export type KbStatus =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'ok'; nodes: number; staleness: KbStaleness }

/**
 * LA ligne KB du sitrep (1 ligne — sitrep est injecté à chaque SessionStart :
 * c'est le marqueur systémique de 1ʳᵉ génération et de fraîcheur, spec A.5.2).
 */
export function kbStatusLine(s: KbStatus): string {
  if (s.kind === 'missing') return 'KB: graph not generated yet → run /graphify . once (take/brief then embed the code map)'
  if (s.kind === 'unreadable') return 'KB: ⚠ graph.json unreadable → regenerate with /graphify .'
  const st = s.staleness
  const base = `KB: ${s.nodes} nodes`
  if (st.state === 'stale') {
    return `${base} · ⚠ stale (built at ${short(st.builtCommit!)}, ${st.commitsBehind} commits behind HEAD) → /graphify . --update or \`kb refresh\``
  }
  if (st.state === 'fresh') {
    return `${base} · built at ${short(st.builtCommit!)}${st.commitsBehind === 0 ? ' (HEAD)' : ` (${st.commitsBehind} commit(s) behind, fresh)`}`
  }
  return `${base} · freshness unknown (no build commit recorded)`
}

/** Nudge de clôture (done) quand le graphe est en retard — informatif, jamais bloquant. */
export function kbDoneNudge(st: KbStaleness): string | null {
  if (st.state !== 'stale') return null
  return `KB graph is ${st.commitsBehind} commits behind (built at ${short(st.builtCommit!)}) — refresh: /graphify . --update or \`roadmapped kb refresh\` (code-only, zero LLM tokens)`
}
