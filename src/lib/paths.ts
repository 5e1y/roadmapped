import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, isAbsolute, dirname } from 'node:path'

export interface RoadmapedConfig {
  tasksDir?: string
  docsDir?: string
}

export interface RoadmapedPaths {
  /** Chemin absolu du dossier des tâches. */
  tasksDir: string
  /** Chemin absolu du dossier des docs. */
  docsDir: string
}

const DEFAULTS: Required<RoadmapedConfig> = {
  tasksDir: '../docs/tasks',
  docsDir: '../docs',
}

/** Racine du dossier dashboard/ (ce fichier vit dans dashboard/src/lib/). */
export function dashboardRoot(): string {
  // .../dashboard/src/lib/paths.ts -> remonter de 3 niveaux -> .../dashboard
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** Fonction pure, testable : combine racine + config → chemins absolus. */
export function resolvePaths(root: string, config: RoadmapedConfig): RoadmapedPaths {
  const one = (value: string | undefined, fallback: string): string => {
    // Garde de type : un JSON de config avec une valeur non-string (ex. 42)
    // doit retomber sur le défaut, pas crasher le boot de vite/task.mjs.
    const raw = typeof value === 'string' && value.trim() !== '' ? value : fallback
    return isAbsolute(raw) ? raw : resolve(root, raw)
  }
  return {
    tasksDir: one(config.tasksDir, DEFAULTS.tasksDir),
    docsDir: one(config.docsDir, DEFAULTS.docsDir),
  }
}

/** Lit roadmaped.config.json à la racine dashboard/ (défauts si absent/illisible). */
export function loadPaths(): RoadmapedPaths {
  const root = dashboardRoot()
  const configPath = resolve(root, 'roadmaped.config.json')
  let config: RoadmapedConfig = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as RoadmapedConfig
    } catch {
      // config illisible → défauts (l'outil doit démarrer même sans config valide)
      config = {}
    }
  }
  return resolvePaths(root, config)
}
