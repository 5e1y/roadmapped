// Compteur d'usage local (#345) — préalable factuel à une passe de simplification :
// quels tools MCP, quelles commandes CLI, quelles vues du dashboard servent
// VRAIMENT. Append-only JSONL, gitignoré, zéro réseau, zéro dépendance.
//
// Dépouillement (aucune commande dédiée — un one-liner suffit) :
//   jq -r '.kind+" "+.name' .roadmapped-usage.jsonl | sort | uniq -c | sort -rn
//
// try/catch silencieux : logger l'usage ne doit JAMAIS faire échouer l'appelant
// (CLI, MCP, dashboard) — un disque plein ou en lecture seule est acceptable.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export type UsageKind = 'cli' | 'mcp' | 'view'

const USAGE_FILE = '.roadmapped-usage.jsonl'

/** Append une ligne JSONL `{ts, kind, name}` à la racine du repo hôte. Best-effort. */
export function logUsage(kind: UsageKind, name: string, root: string): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), kind, name }) + '\n'
    appendFileSync(join(root, USAGE_FILE), line)
  } catch {
    /* jamais bloquant */
  }
}
