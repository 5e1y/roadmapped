import yaml from 'js-yaml'

export type TaskFileMap = Record<string, string>

/**
 * Team — l'équipe métier qui réalise une tâche (le « qui »), enum fixe et
 * obligatoire. Remplace l'ancien champ libre `zone`. 8 valeurs, minuscules.
 */
export type Team =
  | 'marketing'
  | 'sales'
  | 'support'
  | 'operations'
  | 'finance'
  | 'legal'
  | 'engineering'
  | 'design'

export const TEAMS: Team[] = [
  'marketing',
  'sales',
  'support',
  'operations',
  'finance',
  'legal',
  'engineering',
  'design',
]

export interface Stage {
  slug: string
  title: string
  /** Note d'esprit canonique du stage — posée dans `_section.yaml` par `roadmapped init`. */
  note: string
}

/**
 * Stages — les 8 sections canoniques d'un lancement produit (le « quand »).
 * `docs/tasks/` contient EXACTEMENT ces 8 dossiers (validation stricte).
 */
export const STAGES: Stage[] = [
  { slug: '01-idea', title: 'Idea Stage', note: 'The initial idea, its validation, the problem/the audience.' },
  { slug: '02-initial', title: 'Initial Stage', note: "Name, repo, legal structure — the project's existence." },
  { slug: '03-identity', title: 'Identity Stage', note: 'Brand, domain, social presence, positioning.' },
  { slug: '04-build', title: 'Build Stage', note: 'Build the product AND its business foundations (site, emails, accounting).' },
  { slug: '05-gtm', title: 'GTM Stage', note: 'Go-to-market: content, outbound, paid acquisition.' },
  { slug: '06-launch', title: 'Launch Stage', note: 'Launch: product, site, content engine, qualification.' },
  { slug: '07-scale', title: 'Scale Stage', note: 'Monitoring, SEO, community, deals, billing, support.' },
  { slug: '08-mature', title: 'Mature Stage', note: 'Referral, legal & compliance, advanced integrations.' },
]

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

export interface TaskNode {
  id: number
  /**
   * Nature du ticket : 'task' (défaut, cérémonie complète), 'quick' (mini-ticket :
   * titre+team+stage suffisent, outcome requis mais verification facultative au done)
   * ou 'milestone' (JALON : une tâche-cible que d'autres verrouillent via dependsOn —
   * aucune sémantique de lock nouvelle, computeAvailability suffit ; rendu diamant).
   * ADDITIF : absent d'un YAML = 'task' (rétrocompat totale, aucun YAML existant ne change).
   */
  kind: 'task' | 'quick' | 'milestone'
  code: string | null
  title: string
  status: 'todo' | 'in_progress' | 'done'
  tags: string[]
  size: 'S' | 'M' | 'L' | null
  /** Équipe métier (enum fixe, obligatoire sur toute tâche active). */
  team: Team
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
}

export interface SectionNode {
  key: string
  title: string
  status: 'open' | 'done' | 'dormant' | 'abandoned'
  note: string | null
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
  /** Sections (docs/tasks/NN-*) — les 8 stages canoniques. */
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
    // (ex: 'mega') et validate.ts la rejette — pas de coercion silencieuse.
    kind: raw.kind ?? 'task',
    code: raw.code ?? null,
    title: raw.title,
    status: raw.status,
    tags: raw.tags ?? [],
    size: raw.size ?? null,
    // Frontière de parse : raw est any. Pour une tâche sans team (ou avec
    // une team invalide), la valeur remonte telle quelle et validate.ts la rejette.
    team: raw.team,
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

/** Abréviations d'affichage des teams (badges de cartes et de lignes). */
export const TEAM_ABBR: Record<Team, string> = {
  marketing: 'mkt', sales: 'sales', support: 'sup', operations: 'ops',
  finance: 'fin', legal: 'legal', engineering: 'eng', design: 'dsgn',
}
