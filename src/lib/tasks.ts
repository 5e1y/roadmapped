import yaml from 'js-yaml'

export type TaskFileMap = Record<string, string>

export interface TaskType {
  slug: string
  title: string
  /** Note d'esprit canonique du type — posée dans `_section.yaml` par `roadmapped init`. */
  note: string
  /**
   * Chaleur de départ canonique du type (#234, le tiers `base` de la température) : 0–33,33.
   * SEMÉE dans `_section.yaml` (champ `baseHeat`) à l'init/migration — donc tunable par
   * projet en éditant le jalon, pas le code. Sert AUSSI de DÉFAUT si un `_section.yaml`
   * n'a pas le champ (ancien repo) : jamais de crash, jamais 0 par surprise.
   */
  baseHeat: number
}

/**
 * TYPES — les 9 sections canoniques : la NATURE d'une tâche (fusion #230 de
 * l'ancien stage « quand » et de l'ancienne team « qui » en un axe unique).
 * `docs/tasks/` contient EXACTEMENT ces 9 dossiers (validation stricte). L'ordre
 * `01`→`09` est un ordre d'AFFICHAGE canonique — il n'encode aucune priorité.
 * `baseHeat` est la source canonique du tiers `base` (seed + défaut, cf. TaskType).
 */
export const TYPES: TaskType[] = [
  { slug: '01-bug', title: 'Bugs', baseHeat: 30, note: "Quelque chose est cassé ou ne se comporte pas comme promis — produit, site, outil, peu importe la surface." },
  { slug: '02-feature', title: 'Features', baseHeat: 14, note: "Du code/du produit qui ajoute une capacité visible pour l'utilisateur." },
  { slug: '03-chore', title: 'Chores', baseHeat: 5, note: "Du code/de l'infra qui n'ajoute rien de visible : refactor, dette, deps, CI, tooling, migrations, monitoring." },
  { slug: '04-brainstorm', title: 'Brainstorms', baseHeat: 10, note: "Réfléchir avant de faire : specs, recherches, benchmarks, décisions, plans." },
  { slug: '05-design', title: 'Design', baseHeat: 12, note: "Artefacts visuels et d'expérience : logo, maquettes, design system, illustrations, UX." },
  { slug: '06-marketing', title: 'Marketing', baseHeat: 7, note: "Acquérir : site, copy, SEO, campagnes, positionnement, growth." },
  { slug: '07-communication', title: 'Communication', baseHeat: 7, note: "Parler au monde : posts, annonces, newsletter, changelog public, communauté, support aux users." },
  { slug: '08-legal', title: 'Legal', baseHeat: 18, note: "Conformité et juridique : CGU, RGPD, licences, contrats, structure, dépôts." },
  { slug: '09-business', title: 'Business', baseHeat: 20, note: "L'argent et les clients en direct : pricing, facturation, compta, prospection, deals, partenariats." },
]

/** DÉFAUT de `base` par slug nu (fallback si `_section.yaml` n'a pas `baseHeat`). Source : TYPES. */
export const DEFAULT_BASE_HEAT: Record<string, number> = Object.fromEntries(
  TYPES.map((t) => [t.slug.replace(/^\d+-/, ''), t.baseHeat]),
)

/**
 * Un retour attaché à une tâche (#149, mode feedback) : capturé SANS créer de
 * ticket. `resolved` bascule à la clôture (done --resolve-feedback) ou d'une main.
 */
export interface FeedbackItem {
  date: string
  author: string
  text: string
  resolved: boolean
}

/**
 * Température d'une tâche (#234, phase 2) : CALCULÉE, jamais stockée ni validée.
 * `value` = auto + base + seed (arrondi 0,01) ; la décomposition sert l'affichage.
 * Attachée aux tâches par l'API (`attachTemperatures`) pour le payload /api/tree —
 * absente d'un YAML, jamais écrite par dumpTask (hors FIELD_ORDER).
 */
export interface Temperature {
  value: number
  auto: number
  base: number
  seed: number
}

export interface TaskNode {
  id: number
  /**
   * Nature du ticket : 'task' (défaut) ou 'milestone' (JALON : une tâche-cible que
   * d'autres verrouillent via dependsOn — aucune sémantique de lock nouvelle,
   * computeAvailability suffit ; rendu diamant). Le kind 'quick' a été supprimé (#250) :
   * il était redondant une fois les colonnes passées par TYPE.
   * ADDITIF : absent d'un YAML = 'task' (rétrocompat totale, aucun YAML existant ne change).
   */
  kind: 'task' | 'milestone'
  title: string
  status: 'todo' | 'in_progress' | 'done'
  tags: string[]
  /**
   * Seed de priorité (#230/#231, « chaleur ») : 0–100, OPTIONNEL. Absent = froid (0) —
   * l'absence EST le zéro, aucun `heat: 0` n'est écrit (même régime que `kind` absent).
   * Recycle le slot de l'ex-champ `team`. Le moteur température (phase 2) le dérive ;
   * ici ce n'est qu'un champ stocké validé. Frontière de parse : `raw.heat ?? null`.
   */
  heat?: number | null
  detail: string | null
  refs: string[]
  links: number[]
  dependsOn: number[]
  /**
   * Epic (ex-`milestone`, renommé #133) : LE regroupement transverse aux stages —
   * slug partagé par toutes les tâches d'un même projet/thème. Simple tag : aucune
   * déclaration obligatoire (un `_epics.yaml` optionnel donne titre/ordre).
   */
  epic: string | null
  source: 'user' | 'ai'
  createdAt: string
  /** Posé au passage todo→in_progress (#82). Null sur les tâches d'avant le champ :
      les lecteurs d'âge retombent sur createdAt. */
  startedAt: string | null
  /** Bumpé à CHAQUE écriture (#147, Live 4) — source des badges NEW/non-lu. Optionnel :
      absent/null sur les YAML d'avant le champ → les lecteurs retombent sur createdAt. */
  updatedAt?: string | null
  completedAt: string | null
  commit: string | null
  /** Ce que la tâche a livré, en une phrase orientée utilisateur — matière à changelog. */
  outcome: string | null
  verification: string | null
  release: string | null
  /** Journal de retours (#149) — additif : absent/[] sur les YAML sans feedback. */
  feedback?: FeedbackItem[]
  /** Chemin repo-relatif du fichier YAML source (ex: "docs/tasks/01-solidite/01-addimage.yaml"). */
  file: string
  subtasks: TaskNode[]
  /**
   * Température CALCULÉE (#234) — jamais parsée d'un YAML ni écrite. `toTaskNode` la
   * laisse `undefined` ; l'API l'attache pour l'affichage (phase 3). Optionnelle donc
   * transparente pour tout consommateur existant.
   */
  temperature?: Temperature | null
}

export interface SectionNode {
  key: string
  title: string
  status: 'open' | 'done' | 'dormant' | 'abandoned'
  note: string | null
  /** Chaleur de départ du type (#234) — lue de `_section.yaml`. Null = absente → défaut code. */
  baseHeat?: number | null
  tasks: TaskNode[]
}

/** Libellés des statuts de section non-« open » (UI, source unique). */
export const SECTION_STATUS_LABEL: Record<Exclude<SectionNode['status'], 'open'>, string> = {
  done: 'done',
  dormant: 'dormant',
  abandoned: 'abandoned',
}

/**
 * Epic déclaré (ex-interfaces `Roadmap`/`Milestone`, fusionnées #133) : la
 * déclaration OPTIONNELLE d'un epic dans `_epics.yaml` (titre lisible, ordre).
 * Un epic non déclaré mais porté par des tâches existe quand même (auto-découverte).
 */
export interface Epic {
  slug: string
  title: string
}

export interface TaskTree {
  nextId: number
  /** Sections (docs/tasks/NN-*) — les 9 types canoniques. */
  sections: SectionNode[]
  /** Epics déclarés dans _epics.yaml (racine de tasksDir ; rétrocompat lecture de
      l'ancien _roadmaps.yaml, jalons aplatis). Vide si aucun fichier. */
  epics: Epic[]
}

/**
 * Comptage récursif d'une liste de tâches (sous-tâches comprises) : { total, done }.
 * Source unique du compteur d'en-tête global et des compteurs de section, pour
 * que la somme des sections égale toujours le total affiché en tête de Backlog.
 */
export function countTasksDeep(tasks: TaskNode[]): { total: number; done: number } {
  let total = 0
  let done = 0
  const visit = (t: TaskNode) => {
    total += 1
    if (t.status === 'done') done += 1
    t.subtasks.forEach(visit)
  }
  tasks.forEach(visit)
  return { total, done }
}

interface ParsedPath {
  sectionDir: string
  rest: string[]
  /** Chemin normalisé repo-relatif ("docs/tasks/..."). */
  file: string
}

interface Bucket {
  meta: any
  taskFiles: Map<string, { raw: any; file: string }>
}

function parsePath(fullPath: string): ParsedPath | null {
  const match = fullPath.match(/docs\/tasks\/(.+)$/)
  if (!match) return null
  const file = `docs/tasks/${match[1]}`
  const parts = match[1].split('/')
  return { sectionDir: parts[0], rest: parts.slice(1), file }
}

function numericPrefix(name: string): number {
  const match = name.match(/^(\d+)-/)
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

function toTaskNode(raw: any, file: string): TaskNode {
  return {
    id: raw.id,
    // ADDITIF : kind absent = 'task'. Une valeur invalide remonte telle quelle
    // (ex: 'mega' ou l'ex-'quick' #250) et validate.ts la rejette — pas de coercion silencieuse.
    kind: raw.kind ?? 'task',
    title: raw.title,
    status: raw.status,
    tags: raw.tags ?? [],
    // size (S/M/L) et code (#350) RETIRÉS du modèle : purement décoratifs, aucune
    // logique ne les lisait. Rétrocompat lecture : un YAML externe qui porte encore
    // `size:`/`code:` n'est pas rejeté — la clé inconnue est simplement ignorée ici
    // (jamais parsée), et le prochain dump la laisse tomber (absente de FIELD_ORDER).
    // Frontière de parse : raw est any. Un heat absent = null (froid) ; une
    // valeur hors bornes/non numérique remonte telle quelle et validate.ts la rejette.
    heat: raw.heat ?? null,
    detail: raw.detail ?? null,
    refs: raw.refs ?? [],
    links: raw.links ?? [],
    dependsOn: raw.dependsOn ?? [],
    // Rétrocompat #133 : un ancien YAML qui porte encore `milestone:` est lu comme epic.
    epic: raw.epic ?? raw.milestone ?? null,
    source: raw.source,
    createdAt: raw.createdAt,
    startedAt: raw.startedAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    completedAt: raw.completedAt ?? null,
    commit: raw.commit ?? null,
    outcome: raw.outcome ?? null,
    verification: raw.verification ?? null,
    release: raw.release ?? null,
    feedback: Array.isArray(raw.feedback) ? raw.feedback : [],
    file,
    subtasks: [],
  }
}

function assembleSections(buckets: Map<string, Bucket>): SectionNode[] {
  const sections: SectionNode[] = []
  for (const [dir, bucket] of buckets.entries()) {
    if (!bucket.meta) continue
    const sortedFilenames = [...bucket.taskFiles.keys()].sort(
      (a, b) => numericPrefix(a) - numericPrefix(b),
    )
    const tasks: TaskNode[] = sortedFilenames.map((filename) => {
      const entry = bucket.taskFiles.get(filename)!
      const node = toTaskNode(entry.raw, entry.file)
      const subRaws = (entry.raw.__subtaskRaws ?? []) as Array<{
        filename: string
        raw: any
        file: string
      }>
      node.subtasks = subRaws
        .sort((a, b) => numericPrefix(a.filename) - numericPrefix(b.filename))
        .map((s) => toTaskNode(s.raw, s.file))
      return node
    })
    sections.push({
      key: dir,
      title: bucket.meta.title,
      status: bucket.meta.status,
      note: bucket.meta.note ?? null,
      baseHeat: bucket.meta.baseHeat ?? null,
      tasks,
    })
  }
  sections.sort((a, b) => numericPrefix(a.key) - numericPrefix(b.key))
  return sections
}

/** `_epics.yaml` : liste PLATE d'epics déclarés ({ epics: [{ slug, title }] }). */
function parseEpics(content: string): Epic[] {
  const raw = yaml.load(content) as { epics?: unknown } | null
  const list = Array.isArray(raw?.epics) ? raw!.epics : []
  return (list as any[]).map((e) => ({
    slug: typeof e?.slug === 'string' ? e.slug : '',
    title: typeof e?.title === 'string' ? e.title : '',
  }))
}

/**
 * Rétrocompat lecture #133 : l'ancien `_roadmaps.yaml` (roadmaps → milestones) est
 * lu comme des epics — les jalons de toutes les roadmaps, APLATIS dans l'ordre de
 * déclaration (c'étaient eux que les tâches référençaient via l'ex-champ milestone).
 */
function parseLegacyRoadmaps(content: string): Epic[] {
  const raw = yaml.load(content) as { roadmaps?: unknown } | null
  const list = Array.isArray(raw?.roadmaps) ? raw!.roadmaps : []
  const epics: Epic[] = []
  for (const r of list as any[]) {
    for (const m of Array.isArray(r?.milestones) ? r.milestones : []) {
      epics.push({
        slug: typeof m?.slug === 'string' ? m.slug : '',
        title: typeof m?.title === 'string' ? m.title : '',
      })
    }
  }
  return epics
}

export function buildTaskTree(files: TaskFileMap): TaskTree {
  let nextId = 0
  let epics: Epic[] = []
  let legacyEpics: Epic[] = []
  const buckets = new Map<string, Bucket>()

  for (const [path, content] of Object.entries(files)) {
    const parsed = parsePath(path)
    if (!parsed) continue

    if (parsed.sectionDir === '_meta.yaml') {
      nextId = (yaml.load(content) as any).nextId
      continue
    }
    if (parsed.sectionDir === '_epics.yaml') {
      epics = parseEpics(content)
      continue
    }
    if (parsed.sectionDir === '_roadmaps.yaml') {
      legacyEpics = parseLegacyRoadmaps(content)
      continue
    }

    if (!buckets.has(parsed.sectionDir)) {
      buckets.set(parsed.sectionDir, { meta: null, taskFiles: new Map() })
    }
    const bucket = buckets.get(parsed.sectionDir)!

    if (parsed.rest.length === 1 && parsed.rest[0] === '_section.yaml') {
      bucket.meta = yaml.load(content)
    } else if (parsed.rest.length === 1 && parsed.rest[0].endsWith('.yaml')) {
      bucket.taskFiles.set(parsed.rest[0], { raw: yaml.load(content), file: parsed.file })
    }
    // Les sous-tâches (dossier jumeau, rest.length === 2) sont attachées à la passe suivante.
  }

  // Rattacher les sous-tâches (dossier jumeau = basename sans extension)
  for (const [path, content] of Object.entries(files)) {
    const parsed = parsePath(path)
    if (!parsed || parsed.sectionDir === '_meta.yaml') continue
    if (parsed.rest.length !== 2) continue
    const bucket = buckets.get(parsed.sectionDir)
    if (!bucket) continue
    const [parentDirName, subFile] = parsed.rest
    const parentEntry = bucket.taskFiles.get(`${parentDirName}.yaml`)
    if (!parentEntry) continue
    if (!parentEntry.raw.__subtaskRaws) parentEntry.raw.__subtaskRaws = []
    parentEntry.raw.__subtaskRaws.push({
      filename: subFile,
      raw: yaml.load(content),
      file: parsed.file,
    })
  }

  return {
    nextId,
    sections: assembleSections(buckets),
    // _epics.yaml prime ; l'ancien _roadmaps.yaml ne sert que s'il est seul (rétrocompat).
    epics: epics.length > 0 ? epics : legacyEpics,
  }
}
