import yaml from 'js-yaml'
import type { SectionNode, TaskNode, TaskFileMap, Roadmap } from './tasks'
import { STAGES, TEAMS } from './tasks.ts'

const TASK_STATUSES = ['todo', 'in_progress', 'done']
const SECTION_STATUSES = ['open', 'done', 'dormant', 'abandoned']
const SIZES = ['S', 'M', 'L', null]

/** Titre canonique attendu pour chaque slug de stage (source unique : STAGES). */
const CANONICAL_TITLE = new Map(STAGES.map((s) => [s.slug, s.title]))

function validateTask(task: TaskNode, path: string, errors: string[]) {
  if (typeof task.id !== 'number') errors.push(`${path}: id manquant ou invalide`)
  if (!task.title) errors.push(`${path}: title manquant`)
  if (!TASK_STATUSES.includes(task.status)) errors.push(`${path}: status invalide (${task.status})`)
  if (!SIZES.includes(task.size)) errors.push(`${path}: size invalide (${task.size})`)
  if (!TEAMS.includes(task.team)) {
    errors.push(`${path}: team absente ou invalide (${task.team}) — attendu l'une de : ${TEAMS.join(', ')}`)
  }
  if (!['user', 'ai'].includes(task.source)) errors.push(`${path}: source invalide (${task.source})`)
  if (!task.createdAt) errors.push(`${path}: createdAt manquant`)
  if (task.outcome !== null && typeof task.outcome !== 'string') {
    errors.push(`${path}: outcome doit être une string ou null`)
  }
  for (const sub of task.subtasks) {
    validateTask(sub, `${path}/${sub.id}`, errors)
  }
}

function flattenTasks(sections: SectionNode[]): TaskNode[] {
  const out: TaskNode[] = []
  const visit = (t: TaskNode) => { out.push(t); t.subtasks.forEach(visit) }
  for (const s of sections) s.tasks.forEach(visit)
  return out
}

/** DFS 3-couleurs. Renvoie le chemin d'un cycle (ids) ou null. Les deps hors graphe sont ignorées. */
function detectCycle(adj: Map<number, number[]>): number[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<number, number>()
  const stack: number[] = []
  let cycle: number[] | null = null
  const visit = (id: number): boolean => {
    color.set(id, GRAY)
    stack.push(id)
    for (const dep of adj.get(id) ?? []) {
      if (!adj.has(dep)) continue
      const c = color.get(dep) ?? WHITE
      if (c === GRAY) { cycle = stack.slice(stack.indexOf(dep)).concat(dep); return true }
      if (c === WHITE && visit(dep)) return true
    }
    stack.pop()
    color.set(id, BLACK)
    return false
  }
  for (const id of adj.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE && visit(id)) break
  }
  return cycle
}

export function validateTaskTree(tree: {
  nextId: number
  sections: SectionNode[]
  archive?: SectionNode[]
  roadmaps?: Roadmap[]
}): string[] {
  const errors: string[] = []
  const seenIds = new Map<number, string>()

  function collectIds(task: TaskNode, path: string) {
    if (seenIds.has(task.id)) {
      errors.push(`id ${task.id} dupliqué : ${seenIds.get(task.id)} et ${path}`)
    } else {
      seenIds.set(task.id, path)
    }
    for (const sub of task.subtasks) collectIds(sub, `${path}/${sub.id}`)
  }

  // Invariant stages STRICT : l'ensemble des sections ACTIVES = exactement les
  // 8 slugs canoniques (ni plus, ni moins), et chaque title = titre canonique.
  // L'archive n'est PAS soumise à cette contrainte (historique).
  const activeSlugs = new Set(tree.sections.map((s) => s.key))
  for (const stage of STAGES) {
    if (!activeSlugs.has(stage.slug)) {
      errors.push(`stage manquant : "${stage.slug}" (${stage.title}) absent de docs/tasks/`)
    }
  }

  for (const section of tree.sections) {
    if (!CANONICAL_TITLE.has(section.key)) {
      errors.push(`${section.key}/: section non canonique — seuls les 8 stages sont admis (${STAGES.map((s) => s.slug).join(', ')})`)
    } else {
      const expected = CANONICAL_TITLE.get(section.key)!
      if (section.title !== expected) {
        errors.push(`${section.key}/_section.yaml: title "${section.title}" ≠ titre canonique "${expected}"`)
      }
    }
    if (!SECTION_STATUSES.includes(section.status)) {
      errors.push(`${section.key}/_section.yaml: status invalide (${section.status})`)
    }
    for (const task of section.tasks) {
      const path = `${section.key}/${task.id}`
      validateTask(task, path, errors)
      collectIds(task, path)
    }
  }

  const maxId = Math.max(0, ...[...seenIds.keys()])
  if (tree.nextId <= maxId) {
    errors.push(`_meta.yaml: nextId (${tree.nextId}) <= id max observé (${maxId}) — collision future garantie`)
  }

  // ---- Invariants roadmap (phase 2) ----
  const archive = tree.archive ?? []
  const roadmaps = tree.roadmaps ?? []
  const active = flattenTasks(tree.sections)
  const knownIds = new Set<number>()
  for (const t of [...active, ...flattenTasks(archive)]) knownIds.add(t.id)

  // slugs de jalons uniques globalement + slugs de roadmaps uniques
  const milestoneSlugs = new Set<string>()
  const roadmapSlugs = new Set<string>()
  for (const r of roadmaps) {
    if (!r.slug) errors.push('_roadmaps.yaml: une roadmap sans slug')
    else if (roadmapSlugs.has(r.slug)) errors.push(`_roadmaps.yaml: slug de roadmap "${r.slug}" dupliqué`)
    else roadmapSlugs.add(r.slug)
    for (const m of r.milestones) {
      if (!m.slug) errors.push(`_roadmaps.yaml: jalon sans slug (roadmap "${r.slug}")`)
      else if (milestoneSlugs.has(m.slug)) errors.push(`_roadmaps.yaml: slug de jalon "${m.slug}" dupliqué (unicité globale requise)`)
      else milestoneSlugs.add(m.slug)
    }
  }

  // deps + milestone par tâche active
  for (const t of active) {
    for (const dep of t.dependsOn) {
      if (dep === t.id) errors.push(`#${t.id}: auto-dépendance interdite`)
      else if (!knownIds.has(dep)) errors.push(`#${t.id}: dépendance #${dep} inexistante`)
    }
    if (t.milestone !== null && !milestoneSlugs.has(t.milestone)) {
      errors.push(`#${t.id}: jalon "${t.milestone}" non déclaré dans _roadmaps.yaml`)
    }
  }

  // cycle sur le graphe global (active + archive)
  const adj = new Map<number, number[]>()
  for (const t of [...active, ...flattenTasks(archive)]) adj.set(t.id, t.dependsOn)
  const cycle = detectCycle(adj)
  if (cycle) errors.push(`graphe de dépendances cyclique : ${cycle.map((i) => `#${i}`).join(' → ')}`)

  return errors
}

// validateTaskTree ne valide QUE les sections actives (tree.sections) — l'archive
// est de l'historique déjà validé à l'époque de sa livraison, on ne la re-schématise
// pas. Mais l'unicité des ids et le contrat nextId sont GLOBAUX (archive comprise :
// un id archivé reste réservé à vie). Ce passage lit le TaskFileMap brut, sans passer
// par buildTaskTree, pour vérifier ces deux invariants sur TOUT docs/tasks/.
export function validateIdUniquenessAcrossFiles(files: TaskFileMap): string[] {
  const errors: string[] = []
  const seenIds = new Map<number, string>()
  let nextId: number | null = null

  for (const [path, content] of Object.entries(files)) {
    const filename = path.split('/').pop() ?? ''
    if (filename === '_meta.yaml') {
      const meta = yaml.load(content) as { nextId?: unknown }
      if (typeof meta?.nextId === 'number') nextId = meta.nextId
      continue
    }
    if (filename === '_section.yaml') continue
    if (filename === '_roadmaps.yaml') continue
    const raw = yaml.load(content) as { id?: unknown }
    if (typeof raw?.id !== 'number') continue
    if (seenIds.has(raw.id)) {
      errors.push(`id ${raw.id} dupliqué (toutes sections/archives confondues) : ${seenIds.get(raw.id)} et ${path}`)
    } else {
      seenIds.set(raw.id, path)
    }
  }

  const maxId = Math.max(0, ...[...seenIds.keys()])
  if (nextId !== null && nextId <= maxId) {
    errors.push(
      `_meta.yaml: nextId (${nextId}) <= id max global (${maxId}, archive comprise) — collision garantie à la prochaine création`,
    )
  }

  return errors
}
