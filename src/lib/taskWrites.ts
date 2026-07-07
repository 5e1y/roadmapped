import {
  readdirSync, readFileSync, writeFileSync, statSync, unlinkSync,
  existsSync, mkdirSync, rmSync,
} from 'node:fs'
import { join, relative, dirname } from 'node:path'
import yaml from 'js-yaml'
import { buildTaskTree } from './tasks.ts'
import { validateTaskTree, validateIdUniquenessAcrossFiles } from './validate.ts'
import type { TaskTree, TaskNode, TaskFileMap } from './tasks'

export const FIELD_ORDER = [
  'id', 'kind', 'code', 'title', 'status', 'tags', 'size', 'team', 'detail',
  'refs', 'links', 'dependsOn', 'milestone', 'source', 'createdAt', 'completedAt', 'commit',
  'outcome', 'verification', 'release',
]

export interface FoundTask { task: TaskNode; sectionKey: string; archived: boolean }

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
  const search = (tasks: TaskNode[], sectionKey: string, archived: boolean): FoundTask | null => {
    for (const t of tasks) {
      if (t.id === id) return { task: t, sectionKey, archived }
      const hit = search(t.subtasks, sectionKey, archived)
      if (hit) return hit
    }
    return null
  }
  for (const s of tree.sections) {
    const hit = search(s.tasks, s.key, false)
    if (hit) return hit
  }
  for (const s of tree.archive) {
    const hit = search(s.tasks, s.key, true)
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
    // kind est ADDITIF : on ne l'écrit QUE pour un quick. Un task (le défaut) reste
    // sans champ kind — sinon `kind ?? null` forcerait "kind: null" sur tous les
    // YAML existants (violation de la rétrocompat). Position (après id) garantie
    // par FIELD_ORDER quand présent.
    if (key === 'kind') {
      if (raw.kind === 'quick') ordered.kind = 'quick'
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
  /** Équipe métier (enum fixe, REQUISE). Validée après écriture par validate.ts. */
  team: string
  /** 'quick' pour un mini-ticket ; absent/'task' = ticket normal (kind omis du YAML). */
  kind?: 'task' | 'quick'
  detail?: string | null
  tags?: string[]
  size?: string | null
  code?: string | null
  refs?: string[]
  links?: number[]
  dependsOn?: number[]
  milestone?: string | null
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
    // 'task' par défaut : dumpTask omet alors le champ (rétrocompat). Seul 'quick' est écrit.
    kind: input.kind === 'quick' ? 'quick' : 'task',
    code: str(input.code),
    title: input.title,
    status: 'todo',
    tags: input.tags ?? [],
    size: str(input.size),
    // team REQUISE : une valeur absente/vide part telle quelle et validate.ts
    // rejette (rollback) — jamais de coercion silencieuse vers une valeur bidon.
    team: typeof input.team === 'string' && input.team !== '' ? input.team : null,
    detail: str(input.detail),
    refs: input.refs ?? [],
    links: input.links ?? [],
    dependsOn: input.dependsOn ?? [],
    milestone: str(input.milestone),
    source: input.source ?? 'ai',
    createdAt: today(),
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

/** Localise une tâche ACTIVE et lui applique un mutateur, puis commit. */
function patchActive(
  tasksDir: string,
  id: number,
  mutate: (raw: Record<string, unknown>) => void,
): MutationResult {
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  if (hit.archived) {
    return { ok: false, errors: [`#${id} est archivée — édition manuelle uniquement.`] }
  }
  const absPath = absPathOf(tasksDir, hit.task.file)
  const prevContent = readFileSync(absPath, 'utf8')
  const raw = yaml.load(prevContent) as Record<string, unknown>
  mutate(raw)
  return commitWrites(tasksDir, [{ absPath, content: dumpTask(raw), prevContent }])
}

export function startTask(tasksDir: string, id: number): MutationResult {
  return withLock(tasksDir, () =>
    patchActive(tasksDir, id, (raw) => {
      raw.status = 'in_progress'
    }),
  )
}

export function doneTask(
  tasksDir: string,
  id: number,
  opts: { commit?: string; outcome?: string; verification?: string; release?: string },
): MutationResult {
  return withLock(tasksDir, () => doneTaskImpl(tasksDir, id, opts))
}

function doneTaskImpl(
  tasksDir: string,
  id: number,
  opts: { commit?: string; outcome?: string; verification?: string; release?: string },
): MutationResult {
  // Pré-lecture pour arbitrer selon le kind AVANT d'écrire (message clair plutôt
  // qu'un rollback de validation opaque) et pour composer les warnings non bloquants.
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  if (hit.archived) return { ok: false, errors: [`#${id} est archivée — édition manuelle uniquement.`] }
  const t = hit.task
  const finalOutcome = typeof opts.outcome === 'string' ? opts.outcome : t.outcome
  if (t.kind === 'quick' && (finalOutcome === null || finalOutcome === undefined || finalOutcome.trim() === '')) {
    return { ok: false, errors: [`#${id} est un quick : --outcome requis au done (l'outcome tient lieu de vérification).`] }
  }
  const warnings: string[] = []
  // Anti-exploration (spec §4) : une task livrée sans refs = le prochain lecteur
  // explorera. Discipline rendue visible, pas punitive → warning, jamais un échec.
  if (t.kind !== 'quick' && t.refs.length === 0) {
    warnings.push(`#${id} terminée sans refs — ticket sans refs = le prochain lecteur explorera. Ajoute des refs (fichiers/specs) pour ancrer le contexte.`)
  }
  const res = patchActive(tasksDir, id, (raw) => {
    raw.status = 'done'
    raw.completedAt = today()
    if (typeof opts.commit === 'string') raw.commit = opts.commit
    if (typeof opts.outcome === 'string') raw.outcome = opts.outcome
    if (typeof opts.verification === 'string') raw.verification = opts.verification
    if (typeof opts.release === 'string') raw.release = opts.release
  })
  if (res.ok && warnings.length > 0) return { ...res, warnings }
  return res
}

export interface UpdateTaskPatch {
  title?: string
  detail?: string | null
  status?: string
  size?: string | null
  team?: string | null
  code?: string | null
  milestone?: string | null
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
}

export function updateTask(tasksDir: string, id: number, patch: UpdateTaskPatch): MutationResult {
  return withLock(tasksDir, () => updateTaskImpl(tasksDir, id, patch))
}

function updateTaskImpl(tasksDir: string, id: number, patch: UpdateTaskPatch): MutationResult {
  const stringFields: (keyof UpdateTaskPatch)[] = [
    'title', 'detail', 'status', 'size', 'team', 'code', 'milestone', 'source',
    'commit', 'outcome', 'verification', 'release', 'completedAt',
  ]
  const listFields: (keyof UpdateTaskPatch)[] = ['tags', 'refs', 'links', 'dependsOn']
  return patchActive(tasksDir, id, (raw) => {
    const prevStatus = raw.status
    for (const f of stringFields) {
      if (patch[f] !== undefined) raw[f] = patch[f]
    }
    for (const f of listFields) {
      if (patch[f] !== undefined) raw[f] = patch[f]
    }
    // Parité avec doneTask : un passage à done date la complétion (l'archive
    // est le journal de livraison), un retour en arrière la retire — sauf si
    // l'appelant a fourni completedAt explicitement.
    if (patch.completedAt === undefined && patch.status !== undefined && patch.status !== prevStatus) {
      if (patch.status === 'done' && raw.completedAt == null) raw.completedAt = today()
      else if (patch.status !== 'done') raw.completedAt = null
    }
  })
}

// ---------------------------------------------------------------- archive / delete

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

export function archiveTask(tasksDir: string, id: number): MutationResult {
  return withLock(tasksDir, () => archiveTaskImpl(tasksDir, id))
}

function archiveTaskImpl(tasksDir: string, id: number): MutationResult {
  const tree = readTree(tasksDir)
  const hit = findTask(tree, id)
  if (!hit) return { ok: false, errors: [`Aucune tâche #${id}.`], notFound: true }
  if (hit.archived) return { ok: false, errors: [`#${id} est déjà archivée.`] }
  if (hit.task.status !== 'done') {
    return { ok: false, errors: [`#${id} doit être done avant d'être archivée.`] }
  }

  const rel = hit.task.file.replace(/^docs\/tasks\//, '') // ex: 01-x/03-tache.yaml
  const parts = rel.split('/')
  const sectionDir = parts[0]
  const filename = parts[1]
  const base = filename.replace(/\.yaml$/, '') // ex: 03-tache

  // La destination peut DÉJÀ exister (même préfixe/slug réalloué dans la section
  // active puis réarchivé) : capturer son contenu réel, sinon un rollback ultérieur
  // ferait unlinkSync (prevContent: null = création) et détruirait l'archive d'origine.
  const prevOf = (abs: string): string | null =>
    existsSync(abs) ? readFileSync(abs, 'utf8') : null

  const srcFile = join(tasksDir, sectionDir, filename)
  const dstFile = join(tasksDir, '_archive', sectionDir, filename)
  const ops: Op[] = [
    { absPath: srcFile, content: null, prevContent: readFileSync(srcFile, 'utf8') },
    { absPath: dstFile, content: readFileSync(srcFile, 'utf8'), prevContent: prevOf(dstFile) },
  ]

  // Dossier jumeau de sous-tâches, s'il existe : chaque fichier déplacé en miroir.
  const twinSrc = join(tasksDir, sectionDir, base)
  if (existsSync(twinSrc) && statSync(twinSrc).isDirectory()) {
    for (const abs of listFilesRecursive(twinSrc)) {
      const relInTwin = relative(twinSrc, abs)
      const dst = join(tasksDir, '_archive', sectionDir, base, relInTwin)
      const content = readFileSync(abs, 'utf8')
      ops.push({ absPath: abs, content: null, prevContent: content })
      ops.push({ absPath: dst, content, prevContent: prevOf(dst) })
    }
  }

  const res = commitWrites(tasksDir, ops)
  // Nettoyer le dossier jumeau source devenu vide (best-effort, hors validation).
  if (res.ok && existsSync(twinSrc)) rmSync(twinSrc, { recursive: true, force: true })
  return res
}

export function deleteTask(tasksDir: string, id: number): MutationResult {
  return withLock(tasksDir, () => deleteTaskImpl(tasksDir, id))
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
  if (parts.length === (hit.archived ? 3 : 2) && existsSync(twin) && statSync(twin).isDirectory()) {
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

// La CRÉATION de section a disparu (stages fixes) : docs/tasks/ contient
// exactement les 8 stages canoniques, créés à l'init. Seul l'édition
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
  const meta = { title: raw.title, status: raw.status, note: raw.note ?? null }
  return commitWrites(tasksDir, [
    { absPath: absMeta, content: yaml.dump(meta, { lineWidth: 100, quotingType: '"' }), prevContent },
  ])
}

// ---------------------------------------------------------------- roadmaps

export interface SaveRoadmapsInput {
  roadmaps?: Array<{ slug?: unknown; title?: unknown; milestones?: unknown }>
}

/**
 * Réécrit ENTIÈREMENT _roadmaps.yaml (racine de tasksDir). Pas de merge partiel :
 * l'appelant fournit la liste complète des roadmaps. Un body malformé ({} sans
 * "roadmaps", élément sans slug/title string non vide, milestones non-tableau,
 * slugs dupliqués dans la requête) est REJETÉ avant toute écriture — jamais de
 * coercion silencieuse vers une liste vide qui écraserait le fichier. Ensuite
 * commitWrites → validation totale (jalons déclarés vs tâches) + rollback.
 */
export function saveRoadmaps(tasksDir: string, input: SaveRoadmapsInput): MutationResult {
  return withLock(tasksDir, () => saveRoadmapsImpl(tasksDir, input))
}

function saveRoadmapsImpl(tasksDir: string, input: SaveRoadmapsInput): MutationResult {
  if (!Array.isArray(input?.roadmaps)) {
    return { ok: false, errors: ['Body invalide : "roadmaps" doit être un tableau (réécriture complète).'] }
  }
  const errors: string[] = []
  const roadmapSlugs = new Set<string>()
  const milestoneSlugs = new Set<string>()
  const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
  const clean: Array<{ slug: string; title: string; milestones: Array<{ slug: string; title: string }> }> = []
  input.roadmaps.forEach((r, i) => {
    if (!nonEmpty(r?.slug)) errors.push(`roadmaps[${i}] : slug requis (string non vide).`)
    else if (roadmapSlugs.has(r.slug)) errors.push(`roadmaps[${i}] : slug "${r.slug}" dupliqué dans la requête.`)
    else roadmapSlugs.add(r.slug)
    if (!nonEmpty(r?.title)) errors.push(`roadmaps[${i}] : title requis (string non vide).`)
    if (!Array.isArray(r?.milestones)) {
      errors.push(`roadmaps[${i}] : "milestones" doit être un tableau.`)
      return
    }
    const milestones: Array<{ slug: string; title: string }> = []
    r.milestones.forEach((m: { slug?: unknown; title?: unknown }, j: number) => {
      if (!nonEmpty(m?.slug)) errors.push(`roadmaps[${i}].milestones[${j}] : slug requis (string non vide).`)
      else if (milestoneSlugs.has(m.slug)) errors.push(`roadmaps[${i}].milestones[${j}] : slug de jalon "${m.slug}" dupliqué dans la requête.`)
      else milestoneSlugs.add(m.slug)
      if (!nonEmpty(m?.title)) errors.push(`roadmaps[${i}].milestones[${j}] : title requis (string non vide).`)
      if (nonEmpty(m?.slug) && nonEmpty(m?.title)) milestones.push({ slug: m.slug as string, title: m.title as string })
    })
    if (nonEmpty(r?.slug) && nonEmpty(r?.title)) clean.push({ slug: r.slug as string, title: r.title as string, milestones })
  })
  if (errors.length > 0) return { ok: false, errors }

  const abs = join(tasksDir, '_roadmaps.yaml')
  const prevContent = existsSync(abs) ? readFileSync(abs, 'utf8') : null
  const content = yaml.dump({ roadmaps: clean }, { lineWidth: 100, quotingType: '"' })
  return commitWrites(tasksDir, [{ absPath: abs, content, prevContent }])
}
