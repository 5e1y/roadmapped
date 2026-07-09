import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, isAbsolute, dirname, join } from 'node:path'

export interface RoadmappedConfig {
  tasksDir?: string
  docsDir?: string
}

export interface RoadmappedPaths {
  /** Racine absolue du repo HÔTE (où vivent config + docs/tasks). Sert à
   *  identifier le repo servi (nom affiché dans le header, comparaison de la
   *  sonde de collision du bin) — un paquet, N hôtes. */
  root: string
  /** Chemin absolu du dossier des tâches. */
  tasksDir: string
  /** Chemin absolu du dossier des docs. */
  docsDir: string
}

// Défauts relatifs à la racine du repo HÔTE. L'ancien défaut '../docs/tasks'
// (hérité du modèle « dashboard en sous-dossier ») était relatif à l'emplacement
// du CODE : installé en node_modules/roadmapped/, il pointait dans l'install au
// lieu du repo hôte (bug #123).
const DEFAULTS: Required<RoadmappedConfig> = {
  tasksDir: 'docs/tasks',
  docsDir: 'docs',
}

// Rétrocompat renommage 2026-07 : l'ancien nom à un seul p reste lu s'il est seul.
const CONFIG_NAMES = ['roadmapped.config.json', 'roadmaped.config.json'] as const

/** Racine du PAQUET roadmapped — où vit le code exécutable (src/, scripts/,
 *  index.html). Installé chez un hôte, c'est node_modules/roadmapped/ : on n'y
 *  écrit JAMAIS de données. Sert à Vite (index.html, fs.allow), pas aux tâches. */
export function packageRoot(): string {
  // .../src/lib/paths.ts -> remonter de 2 niveaux -> racine du paquet
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** Fichier de config présent dans `dir`, en respectant la rétrocompat un-p. */
function configIn(dir: string): string | undefined {
  return CONFIG_NAMES.map((name) => join(dir, name)).find(existsSync)
}

/** Racine du repo HÔTE — où vivent roadmapped.config.json et docs/tasks/.
 *  Remonte depuis `startDir` jusqu'au premier dossier contenant une config
 *  roadmapped ou, à défaut, un `.git` (on ne saute jamais hors du repo courant :
 *  une racine git SANS config est un hôte pas encore initialisé, `init` la
 *  créera là). Ni config ni .git en remontant : `startDir` tel quel.
 *  Fonction pure vis-à-vis de l'environnement — l'override ROADMAPPED_ROOT
 *  est appliqué par loadPaths(). */
export function findHostRoot(startDir: string = process.cwd()): string {
  const start = resolve(startDir)
  for (let dir = start; ; dir = dirname(dir)) {
    if (configIn(dir)) return dir
    if (existsSync(join(dir, '.git'))) return dir
    if (dirname(dir) === dir) return start
  }
}

/** Fonction pure, testable : combine racine + config → chemins absolus. */
export function resolvePaths(root: string, config: RoadmappedConfig): RoadmappedPaths {
  const one = (value: string | undefined, fallback: string): string => {
    // Garde de type : un JSON de config avec une valeur non-string (ex. 42)
    // doit retomber sur le défaut, pas crasher le boot de vite/task.mjs.
    const raw = typeof value === 'string' && value.trim() !== '' ? value : fallback
    return isAbsolute(raw) ? raw : resolve(root, raw)
  }
  return {
    root: resolve(root),
    tasksDir: one(config.tasksDir, DEFAULTS.tasksDir),
    docsDir: one(config.docsDir, DEFAULTS.docsDir),
  }
}

/** Lit la config d'une racine hôte donnée et résout ses chemins (défauts si
 *  config absente/illisible — l'outil doit démarrer même sans config valide). */
export function loadPathsAt(root: string): RoadmappedPaths {
  const configPath = configIn(root)
  let config: RoadmappedConfig = {}
  if (configPath) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as RoadmappedConfig
    } catch {
      config = {}
    }
  }
  return resolvePaths(root, config)
}

/** Point d'entrée standard : ancre les données sur le repo HÔTE (cwd remonté),
 *  jamais sur l'emplacement du code. Override explicite : ROADMAPPED_ROOT. */
export function loadPaths(): RoadmappedPaths {
  const envRoot = process.env.ROADMAPPED_ROOT
  const root = typeof envRoot === 'string' && envRoot.trim() !== '' ? resolve(envRoot) : findHostRoot()
  return loadPathsAt(root)
}
