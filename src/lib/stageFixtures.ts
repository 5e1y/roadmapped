import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { STAGES } from './tasks.ts'

/**
 * Fixtures partagées pour les tests : matérialiser les 8 stages canoniques,
 * soit en carte de fichiers in-memory (buildTaskTree/validateTaskTree), soit
 * sur disque (tasksDir temporaire des tests d'écriture / du CLI).
 *
 * La validation stricte (validate.ts) exige EXACTEMENT les 8 stages : tout
 * sandbox de test doit donc les semer, sinon `validate` échoue légitimement.
 */

/** `_section.yaml` canonique (titre exact) d'un stage. */
export function stageSectionYaml(
  title: string,
  status: string = 'open',
  note: string | null = null,
): string {
  return `title: "${title}"\nstatus: ${status}\nnote: ${note === null ? 'null' : `"${note}"`}\n`
}

/** Carte de fichiers in-memory : les 8 `_section.yaml` canoniques. */
export function stageSectionFiles(prefix = '/docs/tasks'): Record<string, string> {
  const files: Record<string, string> = {}
  for (const s of STAGES) {
    files[`${prefix}/${s.slug}/_section.yaml`] = stageSectionYaml(s.title)
  }
  return files
}

/** Crée sur disque les 8 stages canoniques (dossier + `_section.yaml`). */
export function seedStages(tasksDir: string): void {
  for (const s of STAGES) {
    mkdirSync(join(tasksDir, s.slug), { recursive: true })
    writeFileSync(join(tasksDir, s.slug, '_section.yaml'), stageSectionYaml(s.title))
  }
}
