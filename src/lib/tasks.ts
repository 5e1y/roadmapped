import yaml from 'js-yaml'

export type TaskFileMap = Record<string, string>

export interface TaskNode {
  id: number
  code: string | null
  title: string
  status: 'todo' | 'in_progress' | 'done'
  tags: string[]
  size: 'S' | 'M' | 'L' | null
  zone: string | null
  detail: string | null
  refs: string[]
  links: number[]
  dependsOn: number[]
  milestone: string | null
  source: 'user' | 'ai'
  createdAt: string
  completedAt: string | null
  commit: string | null
  /** Ce que la tâche a livré, en une phrase orientée utilisateur — matière à changelog. */
  outcome: string | null
  verification: string | null
  release: string | null
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

export interface Milestone {
  slug: string
  title: string
}

export interface Roadmap {
  slug: string
  title: string
  milestones: Milestone[]
}

export interface TaskTree {
  nextId: number
  /** Sections actives (docs/tasks/NN-*). */
  sections: SectionNode[]
  /** Sections archivées (docs/tasks/_archive/NN-*) — l'historique livré du projet. */
  archive: SectionNode[]
  /** Roadmaps déclarées dans _roadmaps.yaml (racine de tasksDir). Vide si le fichier est absent. */
  roadmaps: Roadmap[]
}

interface ParsedPath {
  archived: boolean
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
  if (parts[0] === '_archive') {
    if (parts.length < 2) return null
    return { archived: true, sectionDir: parts[1], rest: parts.slice(2), file }
  }
  return { archived: false, sectionDir: parts[0], rest: parts.slice(1), file }
}

function numericPrefix(name: string): number {
  const match = name.match(/^(\d+)-/)
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER
}

function toTaskNode(raw: any, file: string): TaskNode {
  return {
    id: raw.id,
    code: raw.code ?? null,
    title: raw.title,
    status: raw.status,
    tags: raw.tags ?? [],
    size: raw.size ?? null,
    zone: raw.zone ?? null,
    detail: raw.detail ?? null,
    refs: raw.refs ?? [],
    links: raw.links ?? [],
    dependsOn: raw.dependsOn ?? [],
    milestone: raw.milestone ?? null,
    source: raw.source,
    createdAt: raw.createdAt,
    completedAt: raw.completedAt ?? null,
    commit: raw.commit ?? null,
    outcome: raw.outcome ?? null,
    verification: raw.verification ?? null,
    release: raw.release ?? null,
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

function parseRoadmaps(content: string): Roadmap[] {
  const raw = yaml.load(content) as { roadmaps?: unknown } | null
  const list = Array.isArray(raw?.roadmaps) ? raw!.roadmaps : []
  return (list as any[]).map((r) => ({
    slug: typeof r?.slug === 'string' ? r.slug : '',
    title: typeof r?.title === 'string' ? r.title : '',
    milestones: (Array.isArray(r?.milestones) ? r.milestones : []).map((m: any) => ({
      slug: typeof m?.slug === 'string' ? m.slug : '',
      title: typeof m?.title === 'string' ? m.title : '',
    })),
  }))
}

export function buildTaskTree(files: TaskFileMap): TaskTree {
  let nextId = 0
  let roadmaps: Roadmap[] = []
  const active = new Map<string, Bucket>()
  const archived = new Map<string, Bucket>()

  for (const [path, content] of Object.entries(files)) {
    const parsed = parsePath(path)
    if (!parsed) continue

    if (parsed.sectionDir === '_meta.yaml') {
      nextId = (yaml.load(content) as any).nextId
      continue
    }
    if (parsed.sectionDir === '_roadmaps.yaml') {
      roadmaps = parseRoadmaps(content)
      continue
    }

    const buckets = parsed.archived ? archived : active
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
    const buckets = parsed.archived ? archived : active
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

  // Cas réel : une section archivée SANS _section.yaml propre (la section
  // d'origine est encore active, seules ses tâches livrées ont été déplacées
  // dans _archive/<même-dossier>/). Sans meta, assembleSections la sauterait
  // et ses tâches disparaîtraient silencieusement — on synthétise : titre
  // emprunté à la section active homonyme (sinon le nom du dossier), statut done.
  for (const [dir, bucket] of archived.entries()) {
    if (!bucket.meta && bucket.taskFiles.size > 0) {
      bucket.meta = {
        title: active.get(dir)?.meta?.title ?? dir,
        status: 'done',
        note: null,
      }
    }
  }

  return {
    nextId,
    sections: assembleSections(active),
    archive: assembleSections(archived),
    roadmaps,
  }
}
