import type { TaskTree, TaskNode, SectionNode } from './tasks'

export type Availability = 'done' | 'available' | 'locked'

function flatten(sections: SectionNode[]): TaskNode[] {
  const out: TaskNode[] = []
  const visit = (t: TaskNode) => { out.push(t); t.subtasks.forEach(visit) }
  for (const s of sections) s.tasks.forEach(visit)
  return out
}

/** Toutes les tâches actives (sections actives + sous-tâches), à plat. */
export function activeTasks(tree: TaskTree): TaskNode[] {
  return flatten(tree.sections)
}

/** Toutes les tâches archivées, à plat (une dep archivée = done de fait). */
export function archivedTasks(tree: TaskTree): TaskNode[] {
  return flatten(tree.archive)
}

/**
 * État de chaque tâche ACTIVE : done / available / locked.
 * - done  : status === 'done'
 * - available : status ≠ done ET toutes les deps sont done (une dep archivée = done de fait ;
 *              une dep vers un id inconnu est ignorée défensivement — la validation l'interdit déjà)
 * - locked : au moins une dep non done
 */
export function computeAvailability(tree: TaskTree): Map<number, Availability> {
  const active = flatten(tree.sections)
  const archivedIds = new Set(flatten(tree.archive).map((t) => t.id))
  const activeById = new Map(active.map((t) => [t.id, t]))
  const isDone = (id: number): boolean => {
    if (archivedIds.has(id)) return true
    const t = activeById.get(id)
    return t ? t.status === 'done' : true
  }
  const result = new Map<number, Availability>()
  for (const t of active) {
    if (t.status === 'done') result.set(t.id, 'done')
    else result.set(t.id, t.dependsOn.every(isDone) ? 'available' : 'locked')
  }
  return result
}

/**
 * Prérequis d'une tâche qui ne sont PAS encore faits, d'après la carte
 * d'availability. Une dep absente de la map (archivée / inconnue) est done de
 * fait — elle n'est jamais listée. Source unique partagée par le Graphe et les
 * Colonnes pour afficher « Prérequis manquants (#…) » de façon cohérente.
 */
export function missingPrereqs(task: TaskNode, avail: Map<number, Availability>): number[] {
  return task.dependsOn.filter((d) => {
    const st = avail.get(d)
    return st !== undefined && st !== 'done'
  })
}

/**
 * Dépendances INVERSES : les tâches ACTIVES (sous-tâches comprises) dont
 * `dependsOn` contient `id`. Triées par id croissant. Alimente le bloc « Bloque »
 * du panneau — entièrement calculé, aucun champ YAML.
 */
export function reverseDependents(tree: TaskTree, id: number): TaskNode[] {
  return activeTasks(tree)
    .filter((t) => t.dependsOn.includes(id))
    .sort((a, b) => a.id - b.id)
}

/**
 * État d'affichage d'une dépendance (bloc « Dépend de » du panneau) :
 * - 'archived' : la dep vit dans l'archive (done de fait, mais affichée avec son
 *   badge), OU son id est inconnu — traité comme archivé défensivement : une dep
 *   validée pointe toujours vers un id connu, on n'échoue donc pas l'affichage ;
 * - sinon l'availability calculée de la tâche active : 'done' | 'available' | 'locked'
 *   (réutilise computeAvailability, source unique de l'état des tâches).
 */
export function depState(tree: TaskTree, id: number): Availability | 'archived' {
  const archivedIds = new Set(archivedTasks(tree).map((t) => t.id))
  if (archivedIds.has(id)) return 'archived'
  return computeAvailability(tree).get(id) ?? 'archived'
}

/**
 * Range les tâches en couches topologiques. La couche d'une tâche = profondeur
 * maximale de sa chaîne de dépendances DANS l'ensemble fourni (deps hors ensemble ignorées).
 * Couche 0 = tâches sans dépendance interne. Déterministe, pas de mesure DOM.
 */
export function topoLayers(tasks: TaskNode[]): TaskNode[][] {
  const inSet = new Set(tasks.map((t) => t.id))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const cache = new Map<number, number>()
  const depth = (id: number, stack: Set<number>): number => {
    if (cache.has(id)) return cache.get(id)!
    const t = byId.get(id)
    if (!t || stack.has(id)) return 0 // hors ensemble ou cycle (défensif : la validation interdit les cycles)
    stack.add(id)
    const deps = t.dependsOn.filter((d) => inSet.has(d) && d !== id)
    const d = deps.length === 0 ? 0 : 1 + Math.max(...deps.map((x) => depth(x, stack)))
    stack.delete(id)
    cache.set(id, d)
    return d
  }
  const layers: TaskNode[][] = []
  for (const t of tasks) {
    const d = depth(t.id, new Set())
    ;(layers[d] ??= []).push(t)
  }
  return layers.map((l) => l ?? [])
}

/** Progression d'un jalon : tâches actives portant ce slug (les archivées vivent dans le Backlog). */
export function milestoneProgress(tree: TaskTree, slug: string): { done: number; total: number } {
  const tasks = flatten(tree.sections).filter((t) => t.milestone === slug)
  return { total: tasks.length, done: tasks.filter((t) => t.status === 'done').length }
}

/** Slug depuis un titre : ASCII minuscule, tirets, 40 car. max. Fallback "roadmap". */
export function slugify(input: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'roadmap'
  )
}

/**
 * LA file de travail canonique (décision Rémi 2026-07-07) : les tâches todo
 * DISPONIBLES (deps done), triées par stage (une tâche Build passe avant une
 * tâche Launch) puis par ancienneté (id croissant = createdAt). C'est l'app
 * qui calcule la priorité — le CLI la sert (`next --count`), le skill la
 * CONSOMME sans jamais la recalculer (coût en tokens). Sections non `open`
 * exclues ; tâches de premier niveau uniquement (les sous-tâches suivent leur
 * parent). `team` optionnelle pour la vue Teams.
 */
export function nextQueue(tree: TaskTree, opts: { team?: string } = {}): TaskNode[] {
  const avail = computeAvailability(tree)
  // Ordre de stage = préfixe NN du dossier (robuste à l'ordre du tableau).
  const stageOf = (key: string) => parseInt(key, 10) || 0
  const out: Array<{ stage: number; task: TaskNode }> = []
  for (const section of tree.sections) {
    if (section.status !== 'open') continue
    for (const t of section.tasks) {
      if (t.status !== 'todo') continue
      if (avail.get(t.id) !== 'available') continue
      if (opts.team && t.team !== opts.team) continue
      out.push({ stage: stageOf(section.key), task: t })
    }
  }
  return out
    .sort((a, b) => a.stage - b.stage || a.task.id - b.task.id)
    .map((x) => x.task)
}
