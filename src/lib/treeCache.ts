// Cache de lecture du tree (#366) — perf : /api/tree relisait+parsait ~350 YAML
// à CHAQUE requête (buildTaskTree + validateAll), 2-4 s à froid sur HDD lent.
// Le tree ne change qu'à une écriture ; on le mémoïse par tasksDir et on
// l'invalide aux deux seules sources de changement :
//   1. commitWrites (toute mutation programmatique) — synchrone, cf. taskWrites.ts.
//   2. le fs.watch du serveur (édits externes : CLI d'un autre process, git,
//      édition manuelle) — cf. createApiMiddleware dans api.ts.
// Sur un hit : zéro I/O, zéro parse. Module feuille (n'importe RIEN de lourd) →
// pas de cycle d'import avec taskWrites qui l'invalide.
import type { TaskTree } from './tasks'

export interface TreeAndErrors {
  tree: TaskTree
  errors: string[]
}

const cache = new Map<string, TreeAndErrors>()

/** Renvoie le tree+errors mémoïsé pour `tasksDir`, sinon le calcule via `compute`
 *  (typiquement treeWithErrors) et le met en cache. */
export function cachedTreeWithErrors(tasksDir: string, compute: () => TreeAndErrors): TreeAndErrors {
  let hit = cache.get(tasksDir)
  if (!hit) {
    hit = compute()
    cache.set(tasksDir, hit)
  }
  return hit
}

/** Invalide le cache. Sans argument : purge tout (sûreté tests). Avec `tasksDir` :
 *  cible ce backlog. Appelé après chaque écriture (commitWrites) et à chaque
 *  event du watcher — clear d'une entrée absente = no-op inoffensif (contexte CLI). */
export function invalidateTreeCache(tasksDir?: string): void {
  if (tasksDir === undefined) cache.clear()
  else cache.delete(tasksDir)
}
