import yaml from 'js-yaml'
import type { SectionNode, TaskNode, TaskFileMap, Epic } from './tasks'
import { STAGES, TEAMS } from './tasks.ts'

const TASK_STATUSES = ['todo', 'in_progress', 'done']
const SECTION_STATUSES = ['open', 'done', 'dormant', 'abandoned']
const SIZES = ['S', 'M', 'L', null]
/** createdAt/completedAt : date seule (héritage) ou datetime local à la seconde (#84). */
const DATE_OR_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/
/** Slug d'epic : minuscules/chiffres/tirets, comme les ids de section (#133). */
const EPIC_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Titre canonique attendu pour chaque slug de stage (source unique : STAGES). */
const CANONICAL_TITLE = new Map(STAGES.map((s) => [s.slug, s.title]))

function validateTask(task: TaskNode, path: string, errors: string[]) {
  if (typeof task.id !== 'number') errors.push(`${path}: id manquant ou invalide`)
  if (!task.title) errors.push(`${path}: title manquant`)
  if (!TASK_STATUSES.includes(task.status)) errors.push(`${path}: status invalide (${task.status})`)
  if (!SIZES.includes(task.size)) errors.push(`${path}: size invalide (${task.size})`)
  // kind : 'task' | 'quick' | 'milestone' (toTaskNode met 'task' par défaut ; une
  // valeur brute invalide remonte telle quelle et est rejetée ici).
  if (!['task', 'quick', 'milestone'].includes(task.kind)) errors.push(`${path}: kind invalide (${task.kind}) — attendu task, quick ou milestone`)
  // Garde-fou : un quick reste un mini-ticket. Size L = trop gros = c'est un ticket.
  if (task.kind === 'quick' && task.size === 'L') {
    errors.push(`${path}: un quick ne peut pas être en size L (si c'est gros, c'est un ticket, pas un quick)`)
  }
  // Requis outcome-quick : porté par la VALIDATION (pas seulement doneTask) pour
  // couvrir AUSSI le done du dashboard (PATCH status=done via updateTask, qui ne
  // passe pas par doneTask).
  if (task.kind === 'quick' && task.status === 'done' && !task.outcome) {
    errors.push(`${path}: un quick terminé exige un outcome (l'outcome tient lieu de vérification)`)
  }
  if (!TEAMS.includes(task.team)) {
    errors.push(`${path}: team absente ou invalide (${task.team}) — attendu l'une de : ${TEAMS.join(', ')}`)
  }
  if (!['user', 'ai'].includes(task.source)) errors.push(`${path}: source invalide (${task.source})`)
  if (!task.createdAt) errors.push(`${path}: createdAt manquant`)
  // Accepte les DEUX formats (#84) : date seule (héritage) OU datetime local à la
  // seconde (nouvelles tâches). Le tri consomme l'id, pas createdAt — c'est de l'audit.
  else if (!DATE_OR_DATETIME.test(task.createdAt)) {
    errors.push(`${path}: createdAt format invalide (attendu YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS)`)
  }
  if (task.startedAt && !DATE_OR_DATETIME.test(task.startedAt)) {
    errors.push(`${path}: startedAt format invalide (attendu YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS)`)
  }
  if (task.completedAt && !DATE_OR_DATETIME.test(task.completedAt)) {
    errors.push(`${path}: completedAt format invalide (attendu YYYY-MM-DD ou YYYY-MM-DDTHH:MM:SS)`)
  }
  if (task.outcome !== null && typeof task.outcome !== 'string') {
    errors.push(`${path}: outcome doit être une string ou null`)
  }
  // epic (#133) : simple tag partagé — optionnel, AUCUNE déclaration exigée, mais
  // la forme est un slug (cohérence des regroupements, pas de « Refonte Graphe » vs « refonte-graphe »).
  if (task.epic !== null && (typeof task.epic !== 'string' || !EPIC_SLUG.test(task.epic))) {
    errors.push(`${path}: epic invalide (${task.epic}) — attendu un slug (minuscules/chiffres/tirets) ou null`)
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
  epics?: Epic[]
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

  // Invariant stages STRICT : l'ensemble des sections = exactement les
  // 8 slugs canoniques (ni plus, ni moins), et chaque title = titre canonique.
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

  // ---- Invariants deps & epics ----
  const epics = tree.epics ?? []
  const active = flattenTasks(tree.sections)
  const knownIds = new Set(active.map((t) => t.id))

  // epics déclarés (_epics.yaml, optionnel) : slug requis et unique. Aucune
  // exigence inverse — une tâche peut porter un epic non déclaré (auto-découverte).
  const epicSlugs = new Set<string>()
  for (const e of epics) {
    if (!e.slug) errors.push('_epics.yaml: un epic sans slug')
    else if (epicSlugs.has(e.slug)) errors.push(`_epics.yaml: slug d'epic "${e.slug}" dupliqué`)
    else epicSlugs.add(e.slug)
  }

  // deps par tâche (l'epic est validé par tâche dans validateTask)
  for (const t of active) {
    for (const dep of t.dependsOn) {
      if (dep === t.id) errors.push(`#${t.id}: auto-dépendance interdite`)
      else if (!knownIds.has(dep)) errors.push(`#${t.id}: dépendance #${dep} inexistante`)
    }
  }

  // cycle sur le graphe global
  const adj = new Map<number, number[]>()
  for (const t of active) adj.set(t.id, t.dependsOn)
  const cycle = detectCycle(adj)
  if (cycle) errors.push(`graphe de dépendances cyclique : ${cycle.map((i) => `#${i}`).join(' → ')}`)

  return errors
}

// L'unicité des ids et le contrat nextId sont GLOBAUX (un id reste réservé à vie,
// même après suppression). Ce passage lit le TaskFileMap brut, sans passer par
// buildTaskTree, pour vérifier ces deux invariants sur TOUT docs/tasks/.
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
    if (filename === '_epics.yaml') continue
    if (filename === '_roadmaps.yaml') continue // legacy (rétrocompat lecture #133)
    const raw = yaml.load(content) as { id?: unknown }
    if (typeof raw?.id !== 'number') continue
    if (seenIds.has(raw.id)) {
      errors.push(`id ${raw.id} dupliqué (toutes sections confondues) : ${seenIds.get(raw.id)} et ${path}`)
    } else {
      seenIds.set(raw.id, path)
    }
  }

  const maxId = Math.max(0, ...[...seenIds.keys()])
  if (nextId !== null && nextId <= maxId) {
    errors.push(
      `_meta.yaml: nextId (${nextId}) <= id max global (${maxId}) — collision garantie à la prochaine création`,
    )
  }

  return errors
}
