import {
  readdirSync, readFileSync, writeFileSync, statSync, unlinkSync,
  existsSync, mkdirSync, rmSync,
} from 'node:fs'
import { join, relative, dirname } from 'node:path'
import yaml from 'js-yaml'
import { buildTaskTree } from './tasks.ts'
import { findHostRoot } from './paths.ts'
import { validateTaskTree, validateIdUniquenessAcrossFiles } from './validate.ts'
import type { TaskTree, TaskNode, TaskFileMap, FeedbackItem } from './tasks'
import { TYPES } from './tasks.ts'

export const FIELD_ORDER = [
  'id', 'kind', 'code', 'title', 'status', 'tags', 'size', 'heat', 'detail',
  'refs', 'links', 'dependsOn', 'epic', 'source', 'createdAt', 'startedAt', 'updatedAt', 'completedAt', 'commit',
  'outcome', 'verification', 'release', 'feedback',
]

export interface FoundTask { task: TaskNode; sectionKey: string }

export type MutationResult =
  | { ok: true; tree: TaskTree; task?: TaskNode; warnings?: string[] }
  | { ok: false; errors: string[]; notFound?: boolean }

interface Op {
  absPath: string
  /** null = suppression du fichier ; sinon contenu à écrire. */
  content: string | null
  /** null = le fichier n'existait pas (création) ; sinon contenu d'origine (rollback). */
  prevContent: string | null
}

// ---------------------------------------------------------------- lecture

function walk(dir: string, root: string, files: TaskFileMap): void {
  for (const entry of readdirSync(dir)) {
    if (entry === '.lock') continue // verrou de mutation (#83), pas une section
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, root, files)
    } else if (entry.endsWith('.yaml')) {
      // Clé logique préfixée `docs/tasks/` : convention requise par parsePath
      // (tasks.ts), indépendante du vrai nom de tasksDir. Cf. note d'archi du plan.
      files[`docs/tasks/${relative(root, full).replace(/\\/g, '/')}`] = readFileSync(full, 'utf8')
    }
  }
}

export function loadFiles(tasksDir: string): TaskFileMap {
  const files: TaskFileMap = {}
  walk(tasksDir, tasksDir, files)
  return files
}

export function validateAll(files: TaskFileMap): string[] {
  return [...validateTaskTree(buildTaskTree(files)), ...validateIdUniquenessAcrossFiles(files)]
}

export function readTree(tasksDir: string): TaskTree {
  return buildTaskTree(loadFiles(tasksDir))
}

export function treeWithErrors(tasksDir: string): { tree: TaskTree; errors: string[] } {
  const files = loadFiles(tasksDir)
  return { tree: buildTaskTree(files), errors: validateAll(files) }
}

export function findTask(tree: TaskTree, id: number): FoundTask | null {
  const search = (tasks: TaskNode[], sectionKey: string): FoundTask | null => {
    for (const t of tasks) {
      if (t.id === id) return { task: t, sectionKey }
      const hit = search(t.subtasks, sectionKey)
      if (hit) return hit
    }
    return null
  }
  for (const s of tree.sections) {
    const hit = search(s.tasks, s.key)
    if (hit) return hit
  }
  return null
}

// ---------------------------------------------------------------- verrou

// Verrou global de mutation (#83). Toute écriture sérialise via mkdir docs/tasks/.lock
// (atomique sur tous les filesystems) — sans lui, deux agents concurrents allouent le
// même nextId ou relisent des fichiers à moitié écrits par un voisin. Les LECTURES ne
// prennent pas le verrou (writeFileSync est atomique par fichier une fois les écrivains
// sérialisés). Limite assumée : aucune garantie inter-branches/worktrees (cf. delegation.md).
// TTL/timeout surchargeables par env (défaut 10s) — la surcharge sert les tests
// (timeout court sans attendre 10s) ; en prod les défauts tiennent. Lus à l'acquisition.
const lockTtlMs = () => Number(process.env.ROADMAPED_LOCK_TTL_MS) || 10_000
const lockTimeoutMs = () => Number(process.env.ROADMAPED_LOCK_TIMEOUT_MS) || 10_000

/** Sommeil synchrone sans spawn (Atomics.wait sur un buffer partagé jamais notifié). */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Âge (ms) du verrou courant. D'abord via le fichier `owner` (pid:timestamp) ; s'il
 * n'est pas ENCORE écrit — fenêtre entre le mkdir et l'écriture du détenteur — on se
 * rabat sur le mtime du dossier `.lock`. Un verrou tout frais a donc un âge minuscule
 * (jamais volé à tort). null seulement si le dossier a disparu (⇒ l'appelant retente).
 */
function lockAgeMs(lockDir: string): number | null {
  try {
    const ts = Number(readFileSync(join(lockDir, 'owner'), 'utf8').split(':')[1])
    if (Number.isFinite(ts)) return Date.now() - ts
  } catch {
    /* owner pas encore écrit ou illisible → fallback mtime du dossier */
  }
  try {
    return Date.now() - statSync(lockDir).mtimeMs
  } catch {
    return null // dossier volatilisé entre l'EEXIST et le stat
  }
}

export function withLock<T>(tasksDir: string, fn: () => T): T {
  const lockDir = join(tasksDir, '.lock')
  const ttl = lockTtlMs()
  const timeout = lockTimeoutMs()
  const deadline = Date.now() + timeout
  let delay = 50
  for (;;) {
    try {
      mkdirSync(lockDir) // échoue (EEXIST) si un autre écrivain tient le verrou
      break
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e
      const age = lockAgeMs(lockDir)
      if (age === null) continue // dossier disparu → retente le mkdir immédiatement
      if (age > ttl) {
        rmSync(lockDir, { recursive: true, force: true }) // vol de l'orphelin (process mort)
        continue
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Verrou docs/tasks/.lock tenu depuis ${Math.round(age / 1000)}s — abandon après ` +
            `${Math.round(timeout / 1000)}s. Un autre écrivain est actif ; supprime .lock si tu es sûr qu'aucun ne tourne.`,
        )
      }
      sleepSync(delay)
      delay = Math.min(1000, delay * 1.5)
    }
  }
  try {
    writeFileSync(join(lockDir, 'owner'), `${process.pid}:${Date.now()}`)
    return fn()
  } finally {
    rmSync(lockDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------- écriture

function dumpTask(raw: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {}
  for (const key of FIELD_ORDER) {
    // kind est ADDITIF : on ne l'écrit QUE si = milestone. Un task (le défaut) reste
    // sans champ kind — sinon `kind ?? null` forcerait "kind: null" sur tous les YAML
    // existants (violation de la rétrocompat). L'ex-'quick' (#250) n'est plus jamais
    // écrit. Position (après id) garantie par FIELD_ORDER quand présent.
    if (key === 'kind') {
      if (raw.kind === 'milestone') ordered.kind = raw.kind
      continue
    }
    // heat ADDITIF (#230/#231) : écrit seulement s'il est un nombre > 0. Absent = froid
    // (0) ; --heat 0 / --no-heat REFROIDIT en effaçant le champ (l'absence EST le zéro).
    if (key === 'heat') {
      if (typeof raw.heat === 'number' && raw.heat > 0) ordered.heat = raw.heat
      continue
    }
    // startedAt ADDITIF (comme kind) : écrit seulement quand posé, sinon les YAML
    // d'avant le champ (#82) prendraient tous un "startedAt: null" au prochain dump.
    if (key === 'startedAt') {
      if (raw.startedAt) ordered.startedAt = raw.startedAt
      continue
    }
    // updatedAt ADDITIF (#147, Live 4) : écrit seulement quand posé — les YAML
    // d'avant le champ ne prennent pas "updatedAt: null" au prochain dump.
    if (key === 'updatedAt') {
      if (raw.updatedAt) ordered.updatedAt = raw.updatedAt
      continue
    }
    // feedback ADDITIF (#149) : écrit seulement si non vide — aucun YAML sans
    // retour ne prend "feedback: []" au prochain dump.
    if (key === 'feedback') {
      if (Array.isArray(raw.feedback) && raw.feedback.length > 0) ordered.feedback = raw.feedback
      continue
    }
    // epic (#133, ex-milestone) : un YAML d'avant le renommage porte encore
    // `milestone:` — sa valeur migre vers epic au prochain dump (jamais perdue),
    // et le champ milestone disparaît (absent de FIELD_ORDER).
    if (key === 'epic') {
      // `!== undefined` (pas ??) : un patch { epic: null } doit VIDER le champ,
      // pas ressusciter la valeur milestone héritée du fichier.
      ordered.epic = raw.epic !== undefined ? raw.epic : (raw.milestone ?? null)
      continue
    }
    ordered[key] = raw[key] ?? null
  }
  for (const listKey of ['tags', 'refs', 'links', 'dependsOn']) {
    if (ordered[listKey] === null) ordered[listKey] = []
  }
  return yaml.dump(ordered, { lineWidth: 100, quotingType: '"' })
}

function absPathOf(tasksDir: string, file: string): string {
  return join(tasksDir, file.replace(/^docs\/tasks\//, ''))
}

function slugify(title: string): string {
  return (
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'tache'
  )
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Horodatage local à la seconde (#84) : createdAt des nouvelles tâches — audit fin. */
function now(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${today()}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function numericPrefix(name: string): number | null {
  const m = name.match(/^(\d+)-/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Applique les ops (write/create/delete/mkdir implicite) puis revalide TOUT le
 * tasksDir. En cas d'erreur, restaure chaque fichier (rollback) et renvoie les
 * erreurs. Ne lève jamais, ne quitte jamais le process.
 */
function commitWrites(tasksDir: string, ops: Op[]): MutationResult {
  const applied: Op[] = []
  try {
    for (const op of ops) {
      if (op.content === null) {
        if (existsSync(op.absPath)) unlinkSync(op.absPath)
      } else {
        mkdirSync(dirname(op.absPath), { recursive: true })
        writeFileSync(op.absPath, op.content, 'utf8')
      }
      applied.push(op)
    }
  } catch (e) {
    rollback(applied)
    return { ok: false, errors: [`Écriture disque échouée : ${(e as Error).message}`] }
  }

  const errors = validateAll(loadFiles(tasksDir))
  if (errors.length > 0) {
    rollback(applied)
    return { ok: false, errors }
  }
  return { ok: true, tree: readTree(tasksDir) }
}

function rollback(applied: Op[]): void {
  // ordre inverse : défaire les ops les plus récentes d'abord
  for (let i = applied.length - 1; i >= 0; i--) {
    const op = applied[i]
    if (op.prevContent === null) {
      // était une création : supprimer
      if (existsSync(op.absPath)) unlinkSync(op.absPath)
    } else {
      // restaurer le contenu d'origine
      mkdirSync(dirname(op.absPath), { recursive: true })
      writeFileSync(op.absPath, op.prevContent, 'utf8')
    }
  }
}

// ---------------------------------------------------------------- tâches

export interface AddTaskInput {
  section: string
  title: string
  /** Seed de priorité (#230/#231) : 0–100, OPTIONNEL. Absent = froid. Validé après écriture. */
  heat?: number | null
  /** 'milestone' (jalon) ; absent/'task' = ticket normal (kind omis du YAML). Ex-'quick' supprimé (#250). */
  kind?: 'task' | 'milestone'
  detail?: string | null
  tags?: string[]
  size?: string | null
  code?: string | null
  refs?: string[]
  links?: number[]
  dependsOn?: number[]
  epic?: string | null
  source?: 'user' | 'ai'
}

export function addTask(tasksDir: string, input: AddTaskInput): MutationResult {
  return withLock(tasksDir, () => addTaskImpl(tasksDir, input))
}

function addTaskImpl(tasksDir: string, input: AddTaskInput): MutationResult {
  const sectionDir = join(tasksDir, input.section)
  if (
    input.section.startsWith('_') ||
    !existsSync(sectionDir) ||
    !existsSync(join(sectionDir, '_section.yaml'))
  ) {
    return { ok: false, errors: [`Section active introuvable : "${input.section}"`], notFound: true }
  }
  if (!input.title || input.title.trim() === '') {
    return { ok: false, errors: ['Le titre est obligatoire.'] }
  }

  const metaPath = join(tasksDir, '_meta.yaml')
  const metaPrev = readFileSync(metaPath, 'utf8')
  const nextId = (yaml.load(metaPrev) as { nextId?: unknown }).nextId
  if (typeof nextId !== 'number') {
    return { ok: false, errors: ['_meta.yaml : nextId illisible.'] }
  }

  const prefixes = readdirSync(sectionDir)
    .filter((f) => f.endsWith('.yaml') && f !== '_section.yaml')
    .map((f) => numericPrefix(f))
    .filter((n): n is number => n !== null)
  const prefix = String(Math.max(0, ...prefixes) + 1).padStart(2, '0')
  const filename = `${prefix}-${slugify(input.title)}.yaml`
  const absPath = join(sectionDir, filename)
  if (existsSync(absPath)) {
    return { ok: false, errors: [`Le fichier ${filename} existe déjà dans ${input.section}/.`] }
  }

  const str = (v: string | null | undefined): string | null =>
    typeof v === 'string' && v !== '' ? v : null
  const raw = {
    id: nextId,
    // 'task' par défaut : dumpTask omet alors le champ (rétrocompat). Seul milestone est écrit.
    kind: input.kind === 'milestone' ? input.kind : 'task',
    code: str(input.code),
    title: input.title,
    status: 'todo',
    tags: input.tags ?? [],
    size: str(input.size),
    // heat ADDITIF : dumpTask ne l'écrit que si nombre > 0 (absent = froid).
    heat: typeof input.heat === 'number' ? input.heat : null,
    detail: str(input.detail),
    refs: input.refs ?? [],
    links: input.links ?? [],
    dependsOn: input.dependsOn ?? [],
    epic: str(input.epic),
    source: input.source ?? 'ai',
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
    commit: null,
    outcome: null,
    verification: null,
    release: null,
  }

  const res = commitWrites(tasksDir, [
    { absPath, content: dumpTask(raw), prevContent: null },
    { absPath: metaPath, content: `nextId: ${nextId + 1}\n`, prevContent: metaPrev },
  ])
  if (!res.ok) return res
  const created = findTask(res.tree, nextId)?.task
  return { ok: true, tree: res.tree, task: created }
}

/** Localise une tâche et lui applique un mutateur, puis commit. */
function patchActive(
  tasksDir: string,
  id: number,
  mutate: (raw: Record<string, unknown>) => void,
): MutationResult {
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  const absPath = absPathOf(tasksDir, hit.task.file)
  const prevContent = readFileSync(absPath, 'utf8')
  const raw = yaml.load(prevContent) as Record<string, unknown>
  mutate(raw)
  raw.updatedAt = now() // #147 Live 4 : toute écriture date le ticket (source des badges NEW)
  return commitWrites(tasksDir, [{ absPath, content: dumpTask(raw), prevContent }])
}

export function startTask(tasksDir: string, id: number): MutationResult {
  return withLock(tasksDir, () =>
    patchActive(tasksDir, id, (raw) => {
      raw.status = 'in_progress'
      if (!raw.startedAt) raw.startedAt = now() // #82 — posé une seule fois, pas ré-écrasé au re-start
      // Réouverture (#149) : une tâche done redevenue in_progress n'est plus complétée.
      raw.completedAt = null
    }),
  )
}

/** Ajoute un retour au journal de feedback (#149) — capture sans créer de ticket. */
export function addFeedback(
  tasksDir: string,
  id: number,
  opts: { text: string; author?: string },
): MutationResult {
  return withLock(tasksDir, () =>
    patchActive(tasksDir, id, (raw) => {
      const list = Array.isArray(raw.feedback) ? (raw.feedback as unknown[]) : []
      list.push({ date: now(), author: opts.author?.trim() || 'user', text: opts.text, resolved: false })
      raw.feedback = list
    }),
  )
}

interface DoneOpts {
  commit?: string
  outcome?: string
  verification?: string
  /** Version de release (#341). ABSENT (undefined) → auto-stamp de la version du
   *  package.json HÔTE (#341). String → priorité. `null` explicite → efface le champ. */
  release?: string | null
  /** Résout les feedbacks à la clôture (#149) : 'all' ou des positions 1-based. */
  resolveFeedback?: 'all' | number[]
}

/**
 * Version du package.json du repo HÔTE, pour l'auto-stamp de release au done (#341).
 * La racine hôte est RE-DÉRIVÉE du tasksDir via findHostRoot (le même mécanisme que
 * loadPaths) — robuste à un tasksDir custom (remonte jusqu'au marqueur config/.git),
 * là où un simple `../../` casserait. null (jamais d'erreur) si pas de package.json,
 * JSON illisible, ou champ `version` absent/non-string : le done ne doit JAMAIS
 * casser sur un hôte sans package versionné.
 */
function hostPackageVersion(tasksDir: string): string | null {
  try {
    const json = JSON.parse(readFileSync(join(findHostRoot(tasksDir), 'package.json'), 'utf8')) as {
      version?: unknown
    }
    return typeof json.version === 'string' && json.version.trim() !== '' ? json.version : null
  } catch {
    return null
  }
}

export function doneTask(tasksDir: string, id: number, opts: DoneOpts): MutationResult {
  return withLock(tasksDir, () => doneTaskImpl(tasksDir, id, opts))
}

function doneTaskImpl(tasksDir: string, id: number, opts: DoneOpts): MutationResult {
  // Pré-lecture pour arbitrer selon le kind AVANT d'écrire (message clair plutôt
  // qu'un rollback de validation opaque) et pour composer les warnings non bloquants.
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  const t = hit.task
  const warnings: string[] = []
  // #250 : plus d'exception « outcome requis / verification facultative pour un quick »
  // — la verification est ENCOURAGÉE mais non bloquante pour toutes les tâches, aucun
  // done ne bloque désormais sur l'outcome (la légèreté du done trivial est préservée
  // sans kind dédié).
  // Anti-exploration (spec §4) : une task livrée sans refs = le prochain lecteur
  // explorera. Discipline rendue visible, pas punitive → warning, jamais un échec.
  // Les jalons (kind milestone : un marqueur, pas du travail) sont exemptés.
  if (t.kind === 'task' && t.refs.length === 0) {
    warnings.push(`#${id} terminée sans refs — ticket sans refs = le prochain lecteur explorera. Ajoute des refs (fichiers/specs) pour ancrer le contexte.`)
  }
  const res = patchActive(tasksDir, id, (raw) => {
    raw.status = 'done'
    // #292 : datetime local (comme createdAt/startedAt), pas date seule — sinon
    // relativeTime ne peut afficher que le jour (« completed today » au lieu de
    // « 2 hours ago »). #84 avait porté createdAt en datetime mais oublié celui-ci.
    raw.completedAt = now()
    if (typeof opts.commit === 'string') raw.commit = opts.commit
    if (typeof opts.outcome === 'string') raw.outcome = opts.outcome
    if (typeof opts.verification === 'string') raw.verification = opts.verification
    // Release (#341) : un opts.release explicite garde TOUJOURS la priorité — string
    // (valeur) ou null (efface). ABSENT → auto-stamp de la version du package.json
    // hôte (null si absent/sans version) ; à défaut on préserve un release déjà posé
    // (re-done après réouverture), sinon null. Aucune erreur possible.
    if (opts.release !== undefined) raw.release = opts.release
    else raw.release = hostPackageVersion(tasksDir) ?? raw.release ?? null
    // Résolution des feedbacks à la clôture (#149) : 'all' ou positions 1-based.
    if (opts.resolveFeedback && Array.isArray(raw.feedback)) {
      ;(raw.feedback as { resolved: boolean }[]).forEach((f, i) => {
        if (opts.resolveFeedback === 'all' || (Array.isArray(opts.resolveFeedback) && opts.resolveFeedback.includes(i + 1))) {
          f.resolved = true
        }
      })
    }
  })
  if (res.ok && warnings.length > 0) return { ...res, warnings }
  return res
}

export interface UpdateTaskPatch {
  title?: string
  detail?: string | null
  status?: string
  size?: string | null
  /** Seed de priorité (#230/#231) : 0–100. 0 ou null REFROIDIT (efface le champ). */
  heat?: number | null
  code?: string | null
  epic?: string | null
  source?: string
  commit?: string | null
  outcome?: string | null
  verification?: string | null
  release?: string | null
  completedAt?: string | null
  tags?: string[]
  refs?: string[]
  links?: number[]
  dependsOn?: number[]
  /** Remplacement complet du journal de feedback (#149) — l'UI lit/modifie/renvoie. */
  feedback?: FeedbackItem[]
}

export function updateTask(tasksDir: string, id: number, patch: UpdateTaskPatch): MutationResult {
  return withLock(tasksDir, () => updateTaskImpl(tasksDir, id, patch))
}

function updateTaskImpl(tasksDir: string, id: number, patch: UpdateTaskPatch): MutationResult {
  const stringFields: (keyof UpdateTaskPatch)[] = [
    'title', 'detail', 'status', 'size', 'code', 'epic', 'source',
    'commit', 'outcome', 'verification', 'release', 'completedAt',
  ]
  const listFields: (keyof UpdateTaskPatch)[] = ['tags', 'refs', 'links', 'dependsOn']
  return patchActive(tasksDir, id, (raw) => {
    const prevStatus = raw.status
    for (const f of stringFields) {
      if (patch[f] !== undefined) raw[f] = patch[f]
    }
    // heat (#230/#231) : nombre ou null. dumpTask efface le champ si 0/null (refroidit).
    if (patch.heat !== undefined) raw.heat = patch.heat
    for (const f of listFields) {
      if (patch[f] !== undefined) raw[f] = patch[f]
    }
    // Journal de feedback (#149) : remplacement complet (l'UI renvoie le tableau modifié).
    if (patch.feedback !== undefined) raw.feedback = patch.feedback
    // Parité avec doneTask : un passage à done date la complétion (le journal
    // de livraison), un retour en arrière la retire — sauf si l'appelant a
    // fourni completedAt explicitement.
    if (patch.completedAt === undefined && patch.status !== undefined && patch.status !== prevStatus) {
      if (patch.status === 'done' && raw.completedAt == null) raw.completedAt = now() // #292 datetime, cf. doneTask
      else if (patch.status !== 'done') raw.completedAt = null
    }
  })
}

// ---------------------------------------------------------------- delete

/** Liste récursive des fichiers sous un dossier (chemins absolus). */
function listFilesRecursive(dir: string): string[] {
  const out: string[] = []
  const walkDir = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry)
      if (statSync(full).isDirectory()) walkDir(full)
      else out.push(full)
    }
  }
  if (existsSync(dir)) walkDir(dir)
  return out
}

export function deleteTask(tasksDir: string, id: number): MutationResult {
  return withLock(tasksDir, () => deleteTaskImpl(tasksDir, id))
}

/** Déplace une tâche de premier niveau vers un autre TYPE (#251). Le type EST le
 *  dossier ; changer le type = déplacer le fichier (write neuf + delete ancien),
 *  dossier-jumeau de sous-tâches compris. No-op si déjà dans ce type. La base de
 *  température suit automatiquement (dérivée de la nouvelle section). */
export function moveTask(tasksDir: string, id: number, newSection: string): MutationResult {
  return withLock(tasksDir, () => moveTaskImpl(tasksDir, id, newSection))
}

function moveTaskImpl(tasksDir: string, id: number, newSection: string): MutationResult {
  if (!TYPES.some((t) => t.slug === newSection)) {
    return { ok: false, errors: [`Type inconnu : ${newSection} — attendu l'un des 9 types canoniques.`] }
  }
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  const rel = hit.task.file.replace(/^docs\/tasks\//, '')
  const parts = rel.split('/')
  if (parts.length !== 2) {
    return { ok: false, errors: [`#${id} est une sous-tâche — son type suit son parent ; déplace le parent.`] }
  }
  if (parts[0] === newSection) return { ok: true, tree } // déjà dans ce type

  const filename = parts[1]
  const absOld = absPathOf(tasksDir, hit.task.file)
  const prevContent = readFileSync(absOld, 'utf8')
  const raw = yaml.load(prevContent) as Record<string, unknown>
  raw.updatedAt = now()
  const absNew = join(tasksDir, newSection, filename)
  const ops: Op[] = [
    { absPath: absNew, content: dumpTask(raw), prevContent: null },
    { absPath: absOld, content: null, prevContent },
  ]
  // Dossier-jumeau de sous-tâches (rare) : le déplacer avec son parent.
  const base = filename.replace(/\.yaml$/, '')
  const twinOld = join(dirname(absOld), base)
  const twinNew = join(tasksDir, newSection, base)
  if (existsSync(twinOld) && statSync(twinOld).isDirectory()) {
    for (const abs of listFilesRecursive(twinOld)) {
      ops.push({ absPath: join(twinNew, relative(twinOld, abs)), content: readFileSync(abs, 'utf8'), prevContent: null })
      ops.push({ absPath: abs, content: null, prevContent: readFileSync(abs, 'utf8') })
    }
  }
  const res = commitWrites(tasksDir, ops)
  if (res.ok && existsSync(twinOld)) rmSync(twinOld, { recursive: true, force: true })
  return res
}

function deleteTaskImpl(tasksDir: string, id: number): MutationResult {
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }

  const rel = hit.task.file.replace(/^docs\/tasks\//, '')
  const parts = rel.split('/')
  const filename = parts[parts.length - 1]
  const base = filename.replace(/\.yaml$/, '')
  const absFile = absPathOf(tasksDir, hit.task.file)

  const ops: Op[] = [{ absPath: absFile, content: null, prevContent: readFileSync(absFile, 'utf8') }]

  // dossier jumeau (uniquement pour une tâche de premier niveau)
  const twin = join(dirname(absFile), base)
  if (parts.length === 2 && existsSync(twin) && statSync(twin).isDirectory()) {
    for (const abs of listFilesRecursive(twin)) {
      ops.push({ absPath: abs, content: null, prevContent: readFileSync(abs, 'utf8') })
    }
  }

  const res = commitWrites(tasksDir, ops)
  // _meta.yaml (nextId) volontairement INTACT : un id supprimé n'est jamais réalloué.
  if (res.ok && existsSync(twin)) rmSync(twin, { recursive: true, force: true })
  return res
}

// ---------------------------------------------------------------- sections

// La CRÉATION de section a disparu (types fixes) : docs/tasks/ contient
// exactement les 9 types canoniques, créés à l'init. Seul l'édition
// (title canonique, status, note) reste possible via updateSection.

export interface UpdateSectionPatch {
  title?: string
  status?: string
  note?: string | null
}

export function updateSection(
  tasksDir: string,
  dir: string,
  patch: UpdateSectionPatch,
): MutationResult {
  return withLock(tasksDir, () => updateSectionImpl(tasksDir, dir, patch))
}

function updateSectionImpl(
  tasksDir: string,
  dir: string,
  patch: UpdateSectionPatch,
): MutationResult {
  const absMeta = join(tasksDir, dir, '_section.yaml')
  if (dir.startsWith('_') || !existsSync(absMeta)) {
    return { ok: false, errors: [`Section introuvable : "${dir}".`], notFound: true }
  }
  const prevContent = readFileSync(absMeta, 'utf8')
  const raw = yaml.load(prevContent) as Record<string, unknown>
  if (patch.title !== undefined) raw.title = patch.title
  if (patch.status !== undefined) raw.status = patch.status
  if (patch.note !== undefined) raw.note = patch.note
  // baseHeat (#234) PRÉSERVÉ : une édition de status/note/titre ne doit pas effacer la
  // chaleur de départ du jalon. Réécrit seulement s'il existait (sinon champ absent = défaut).
  const meta: Record<string, unknown> = { title: raw.title, status: raw.status }
  if (raw.baseHeat !== undefined && raw.baseHeat !== null) meta.baseHeat = raw.baseHeat
  meta.note = raw.note ?? null
  return commitWrites(tasksDir, [
    { absPath: absMeta, content: yaml.dump(meta, { lineWidth: 100, quotingType: '"' }), prevContent },
  ])
}

// ---------------------------------------------------------------- epics

export interface SaveEpicsInput {
  epics?: Array<{ slug?: unknown; title?: unknown }>
}

/**
 * Réécrit ENTIÈREMENT _epics.yaml (racine de tasksDir) — la déclaration OPTIONNELLE
 * des epics (titre lisible, ordre). Pas de merge partiel : l'appelant fournit la
 * liste complète. Un body malformé ({} sans "epics", élément sans slug/title string
 * non vide, slugs dupliqués dans la requête) est REJETÉ avant toute écriture —
 * jamais de coercion silencieuse vers une liste vide qui écraserait le fichier.
 * Ensuite commitWrites → validation totale + rollback.
 */
export function saveEpics(tasksDir: string, input: SaveEpicsInput): MutationResult {
  return withLock(tasksDir, () => saveEpicsImpl(tasksDir, input))
}

function saveEpicsImpl(tasksDir: string, input: SaveEpicsInput): MutationResult {
  if (!Array.isArray(input?.epics)) {
    return { ok: false, errors: ['Body invalide : "epics" doit être un tableau (réécriture complète).'] }
  }
  const errors: string[] = []
  const slugs = new Set<string>()
  const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  const clean: Array<{ slug: string; title: string }> = []
  input.epics.forEach((e, i) => {
    if (!nonEmpty(e?.slug)) errors.push(`epics[${i}] : slug requis (string non vide).`)
    else if (slugs.has(e.slug)) errors.push(`epics[${i}] : slug "${e.slug}" dupliqué dans la requête.`)
    else slugs.add(e.slug)
    if (!nonEmpty(e?.title)) errors.push(`epics[${i}] : title requis (string non vide).`)
    if (nonEmpty(e?.slug) && nonEmpty(e?.title)) clean.push({ slug: e.slug as string, title: e.title as string })
  })
  if (errors.length > 0) return { ok: false, errors }

  const abs = join(tasksDir, '_epics.yaml')
  const prevContent = existsSync(abs) ? readFileSync(abs, 'utf8') : null
  const content = yaml.dump({ epics: clean }, { lineWidth: 100, quotingType: '"' })
  return commitWrites(tasksDir, [{ absPath: abs, content, prevContent }])
}
