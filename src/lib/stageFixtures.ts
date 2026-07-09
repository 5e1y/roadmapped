import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TYPES } from './tasks.ts'

/**
 * Fixtures partagées pour les tests : matérialiser les 9 types canoniques,
 * soit en carte de fichiers in-memory (buildTaskTree/validateTaskTree), soit
 * sur disque (tasksDir temporaire des tests d'écriture / du CLI).
 *
 * La validation stricte (validate.ts) exige EXACTEMENT les 9 types : tout
 * sandbox de test doit donc les semer, sinon `validate` échoue légitimement.
 */

/**
 * `_section.yaml` canonique d'un type. `baseHeat` (#234) inclus si fourni (nombre) ;
 * omis si `null` → exerce le chemin de FALLBACK code du moteur température.
 */
export function stageSectionYaml(
  title: string,
  status: string = 'open',
  note: string | null = null,
  baseHeat: number | null = null,
): string {
  const baseLine = baseHeat === null ? '' : `baseHeat: ${baseHeat}\n`
  return `title: "${title}"\nstatus: ${status}\n${baseLine}note: ${note === null ? 'null' : `"${note}"`}\n`
}

/** Carte de fichiers in-memory : les 9 `_section.yaml` canoniques (baseHeat semé depuis TYPES). */
export function stageSectionFiles(prefix = '/docs/tasks'): Record<string, string> {
  const files: Record<string, string> = {}
  for (const t of TYPES) {
    files[`${prefix}/${t.slug}/_section.yaml`] = stageSectionYaml(t.title, 'open', null, t.baseHeat)
  }
  return files
}

/** Crée sur disque les 9 types canoniques (dossier + `_section.yaml`, baseHeat semé). */
export function seedStages(tasksDir: string): void {
  for (const t of TYPES) {
    mkdirSync(join(tasksDir, t.slug), { recursive: true })
    writeFileSync(join(tasksDir, t.slug, '_section.yaml'), stageSectionYaml(t.title, 'open', null, t.baseHeat))
  }
}
