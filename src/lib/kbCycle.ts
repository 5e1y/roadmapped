/**
 * KB dans le CYCLE (#325, spec graphify-anchoring §P0/P2) — la composition
 * Node-only (fs + git) qui rend le knowledge graph LOAD-BEARING : take/brief
 * embarquent le voisinage, sitrep porte la ligne d'état, done nudge le refresh.
 * Partagé par le CLI (scripts/task.mjs) ET le serveur MCP (scripts/mcp-server.mjs)
 * — même règle que render.ts : jamais importé par le bundle navigateur.
 *
 * Contrat : DÉGRADATION PROPRE partout. Graphe absent → une ligne discrète ;
 * illisible → une ligne ; git indisponible → fraîcheur « unknown ». Jamais
 * d'exception, jamais de blocage du cycle.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readKbGraph } from '../server/kb.ts'
import type { KbGraph } from '../server/kb'
import type { TaskTree } from './tasks'
import { git } from './render.ts'
import { kbNeighborhood, boundNeighborhood, briefNeighborhoodText } from './kbQuery.ts'
import { kbStaleness, kbStatusLine, kbDoneNudge, KB_STALE_COMMITS } from './kbStatus.ts'
import type { KbStaleness } from './kbStatus'

// Rétrocompat renommage 2026-07 (même liste que paths.ts) : l'ancien nom un-p reste lu.
const CONFIG_NAMES = ['roadmapped.config.json', 'roadmaped.config.json']
// Sidecar machine-local gitignoré (#329) : porte l'état d'install KB (chemins
// ABSOLUS) hors des fichiers trackés. Overlay sur `kb` de la config trackée.
const LOCAL_CONFIG_NAME = 'roadmapped.config.local.json'

function readJsonBestEffort(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  try {
    const json = JSON.parse(readFileSync(file, 'utf8'))
    return json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Config hôte BRUTE, best-effort ({} si absente/illisible) — pour les clés que
 *  resolvePaths ne porte pas : `kb` (opt-out/état), `kb.graphifyBin`, `pythonBin`.
 *  L'état KB (chemins ABSOLUS) vit dans le sidecar gitignoré et prime ici — sauf
 *  l'opt-out `kb: false` (décision partagée, config trackée) qui l'emporte (#329). */
export function readHostConfig(root?: string): Record<string, unknown> {
  if (!root) return {}
  const trackedName = CONFIG_NAMES.find((name) => existsSync(join(root, name)))
  const tracked = trackedName ? readJsonBestEffort(join(root, trackedName)) : {}
  if (tracked.kb === false) return tracked
  const localKb = readJsonBestEffort(join(root, LOCAL_CONFIG_NAME)).kb
  return localKb !== undefined ? { ...tracked, kb: localKb } : tracked
}

/** Opt-out mémorisé (spec A.3/A.5 : `kb: false` ou `'declined'`) → on ne harcèle
 *  pas un refus : les nudges « génère le graphe » se taisent. */
export function kbOptedOut(root?: string): boolean {
  const kb = readHostConfig(root).kb
  return kb === false || kb === 'declined'
}

export type KbOutcome =
  | { kind: 'missing' }
  | { kind: 'unreadable' }
  | { kind: 'ok'; graph: KbGraph }

/** Lit le graphe sans jamais lever. null = chemin inconnu (appel hors roadmapped). */
export function loadKb(kbGraphFile?: string): KbOutcome | null {
  if (!kbGraphFile) return null
  const res = readKbGraph(kbGraphFile)
  if (!res.ok) return { kind: 'unreadable' }
  if (!res.graph) return { kind: 'missing' }
  return { kind: 'ok', graph: res.graph }
}

// built_at_commit vient d'un JSON committé : on ne l'interpole dans une commande
// git QUE s'il ressemble à un sha (git() passe par un shell).
const SHA_RE = /^[0-9a-f]{6,40}$/i

/** Fraîcheur du graphe : built_at_commit vs HEAD en NOMBRE DE COMMITS
 *  (`git rev-list --count`). Best-effort : pas de git / sha inconnu → unknown. */
export function stalenessOf(graph: KbGraph, threshold = KB_STALE_COMMITS): KbStaleness {
  const built = graph.builtAtCommit ?? null
  if (!built || !SHA_RE.test(built)) return kbStaleness(null, null, threshold)
  const out = git(`rev-list --count ${built}..HEAD`)
  const n = out === null ? null : Number(out)
  return kbStaleness(built, Number.isInteger(n) ? (n as number) : null, threshold)
}

/**
 * La section KB de take/brief (le levier n°1 de la spec) : voisinage borné de la
 * tâche quand le graphe existe et que ses refs matchent ; graphe absent → une
 * ligne discrète (silence si opt-out) ; illisible → une ligne. Jamais d'erreur.
 */
export function kbBriefSection(tree: TaskTree, taskId: number, kbGraphFile?: string, hostRoot?: string): string | null {
  const kb = loadKb(kbGraphFile)
  if (kb === null) return null
  if (kb.kind === 'missing') {
    return kbOptedOut(hostRoot) ? null : 'KB: graph not generated yet → run /graphify . once (take/brief then embed the code map).'
  }
  if (kb.kind === 'unreadable') return 'KB: ⚠ graph.json unreadable → regenerate with /graphify .'
  const nb = kbNeighborhood(tree, kb.graph, taskId)
  return briefNeighborhoodText(boundNeighborhood(nb, kb.graph.edges))
}

/** LA ligne KB du sitrep : présence + nb de nœuds + staleness. Opt-out → null. */
export function kbSitrepLine(kbGraphFile?: string, hostRoot?: string): string | null {
  const kb = loadKb(kbGraphFile)
  if (kb === null) return null
  if (kb.kind !== 'ok') return kbOptedOut(hostRoot) ? null : kbStatusLine({ kind: kb.kind })
  return kbStatusLine({ kind: 'ok', nodes: kb.graph.stats.nodes, staleness: stalenessOf(kb.graph) })
}

/** Nudge de clôture (done) : graphe présent mais périmé → une ligne. Sinon null. */
export function kbStaleDoneNudge(kbGraphFile?: string): string | null {
  const kb = loadKb(kbGraphFile)
  if (kb === null || kb.kind !== 'ok') return null
  return kbDoneNudge(stalenessOf(kb.graph))
}
