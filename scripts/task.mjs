#!/usr/bin/env node
// CLI de gestion de docs/tasks/ — pensé pour être piloté par un agent (Claude
// Code) autant que par un humain. Toute écriture passe par LA MÊME validation
// que le dashboard (src/lib/validate.ts) : jamais de second schéma parallèle.
//
// Invariants garantis ici :
//   - `id` alloué depuis docs/tasks/_meta.yaml (nextId), monotone, JAMAIS réutilisé
//   - toute mutation est validée APRÈS écriture ; en cas d'erreur, rollback intégral
//
// Depuis Task 2 : toute la lecture/écriture disque vit dans src/lib/taskWrites.ts
// (partagé avec l'API HTTP du dashboard). Ce fichier n'est plus qu'un wrapper CLI
// fin : parsing d'arguments, affichage, et traduction MutationResult → sortie.
//
// Node >= 22.18 exécute les imports TypeScript nativement ; le script npm
// (`npm run task`) garde --experimental-strip-types pour les Node plus vieux.

import { existsSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import { loadPaths, packageRoot } from '../src/lib/paths.ts'
import { autoUpdate } from '../src/lib/updateNotifier.ts'
import {
  treeWithErrors, readTree, findTask, loadFiles,
  addTask, startTask, doneTask, updateTask, addFeedback,
} from '../src/lib/taskWrites.ts'
import { detectLegacyModel } from '../src/lib/validate.ts'
import { computeAvailability, activeTasks, nextQueue, globalProgress, epicProgress, allEpics } from '../src/lib/roadmap.ts'
// Rendu partagé (#90) : CLI et serveur MCP consomment le MÊME code (src/lib/render.ts).
import { git, taskLine, refLine, briefText, sitrepText, unloggedCommits, auditCommits, auditText, stalePassepartout, todayStr } from '../src/lib/render.ts'
import { TYPES } from '../src/lib/tasks.ts'

const { tasksDir: ROOT, root: HOST_ROOT } = loadPaths()

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const flags = {}
  const positional = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) flags[key] = true
      else {
        flags[key] = next
        i++
      }
    } else {
      positional.push(a)
    }
  }
  return { flags, positional }
}

// Toute erreur de flag/valeur est AUTOPORTANTE : le message d'erreur est suivi de
// l'usage EXACT de la commande fautive (2-3 lignes), pas du USAGE global (annexe 2 :
// chaque ligne de sortie est relue N fois — on sert juste ce qu'il faut pour corriger).
function fail(msg, usage) {
  console.error(msg)
  if (usage) console.error(usage)
  process.exit(1)
}

function requireFlags(flags, names, usage) {
  for (const n of names) {
    if (typeof flags[n] !== 'string' || flags[n] === '') {
      fail(`Missing required flag: --${n}`, usage)
    }
  }
}

function rejectUnknownFlags(flags, allowed, usage) {
  for (const k of Object.keys(flags)) {
    if (!allowed.includes(k)) {
      fail(`Unknown flag: --${k}`, usage ?? `(allowed: ${allowed.map((a) => `--${a}`).join(', ')})`)
    }
  }
}

const splitList = (v) => (v === '' ? [] : v.split(',').map((s) => s.trim()).filter(Boolean))
const nullable = (v) => (v === 'null' ? null : v)
const parseDeps = (v, usage) => {
  if (v === 'null' || v === '') return []
  const tokens = splitList(v)
  const bad = tokens.filter((t) => Number.isNaN(Number(t)))
  if (bad.length > 0) {
    fail(`--depends-on: invalid id(s): ${bad.join(', ')} (expected numeric ids separated by commas, or "null" to clear).`, usage)
  }
  return tokens.map(Number)
}

// ---------------------------------------------------------------- affichage
// taskLine/refLine/briefText/sitrepText/git vivent dans src/lib/render.ts (#90),
// partagés avec le serveur MCP. Ici : le seul affichage propre au CLI (printTask).

function printTask(hit, tree) {
  const { task, sectionKey } = hit
  console.log(taskLine(task, ''))
  console.log(`  section: ${sectionKey}`)
  console.log(`  file: ${task.file}`)
  if (task.detail) console.log(`  detail: ${task.detail.trim().replace(/\n/g, '\n          ')}`)
  if (task.refs.length) console.log(`  refs: ${task.refs.join(' · ')}`)
  if (task.dependsOn.length) console.log(`  depends on: ${task.dependsOn.map((d) => refLine(tree, d)).join(' · ')}`)
  if (task.links.length) console.log(`  linked: ${task.links.map((l) => refLine(tree, l)).join(' · ')}`)
  if (task.outcome) console.log(`  outcome: ${task.outcome}`)
  if (task.verification) console.log(`  verification: ${task.verification}`)
  if (task.commit) console.log(`  commit: ${task.commit}`)
  if (task.release) console.log(`  release: ${task.release}`)
  console.log(`  dates: created ${task.createdAt}${task.completedAt ? ` · completed ${task.completedAt}` : ''} · source ${task.source}`)
  for (const sub of task.subtasks) console.log(taskLine(sub, '    '))
}

const USAGE = `task.mjs — manages docs/tasks/ (source of truth for the Roadmapped backlog)

Usage: node scripts/task.mjs <command> [arguments]
        (Node >= 22.18; otherwise: npm run task --prefix dashboard -- <command>)

Types (canonical, fixed sections = the NATURE of the work):
  ${TYPES.map((t) => t.slug).join(' · ')}  (created at init, not editable from the CLI)

Opening a session (machine-first: all the context in 1 call)
  sitrep                    the state of the world in ≤30 lines (done today, in_progress,
                            next 3, validate, alerts) — THE first move of a session
  take [--type <t>] [--json] next + start + brief IN ONE COMMAND (the opening command)
  brief <id>                THE full, dense execution context (titled deps/linked,
                            refs + anchor excerpts & freshness, done reminder) — supersedes show

Reading
  list [--section <key>] [--status todo|in_progress|done] [--type <t>] [--tag <tag>] [--json] [--json-full]
                            --type = filter by nature (section slug, "bug" or "01-bug");
                            --json = lightweight (id,title,status,type,size,kind,heat);
                            --json-full = the full object (nextId + complete sections)
  show <id> [--json]        full detail of a task (titled deps/linked, global id e.g. 42)
  next [--count N] [--type t] [--json]
                            THE work queue: the next N AVAILABLE todo tasks
                            (deps done), ordered by type-column THEN age — computed by
                            the app, to be CONSUMED as-is (never recompute)
  roadmap [--json]          overall progress + epic view (epic field, _epics.yaml
                            optional): progress + state of each task
                            (done/available/locked)
  validate                  validates all of docs/tasks/ (schema + id uniqueness
                            + nextId); exit 1 on error
  guard                     pre-commit guard: refuses a commit with product changes and
                            no in_progress task (logging/merge exempted; --no-verify assumed)
  audit [--json]            parses the #id convention in commits since the last logged
                            task; surfaces orphans (no #id) + dead references

Writing (id allocated from _meta.yaml; validated after EVERY write, full rollback on error)
  add --type <type> --title <t> [--detail <d>] [--tags a,b] [--heat 0-100]
      [--size S|M|L] [--code <c>] [--refs a,b] [--links 1,2]
      [--depends-on 1,2] [--epic <slug>] [--kind task|milestone]
      [--blocks 1,2] [--source ai|user] [--json]
                            --type is the NATURE (section slug, e.g. 02-feature) — REQUIRED
                            (--section / --stage still accepted as aliases);
                            --heat = priority seed 0-100 (optional, absent = cold);
                            --kind milestone = MILESTONE (lock via dependsOn, rendered as diamond);
                            --blocks 1,2 = adds the new task to the dependsOn
                            of the tasks named (the ergonomic inverse of --depends-on)
  quick "<title>" --type <t> [--tags a,b] [--heat 0-100] [--start] [--json]
                            rapid-create alias for a task: title + type suffice.
                            --type is REQUIRED (#293 — no silent default). Plain task (#250).
  start <id>                status → in_progress
  done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>] [--resolve-feedback all|1,3]
                            status → done + completedAt=today + delivery record
                            (--outcome: what was delivered, in one sentence — the changelog)
  feedback <id> "<text>" [--author <name>]
                            capture a note on a task WITHOUT a new ticket (#149).
                            Same scope → reopen (start <id>) + re-done; new scope → a quick.
  update <id> [--title] [--detail] [--status] [--tags] [--refs] [--links]
      [--size] [--heat 0-100|--no-heat] [--code] [--source] [--commit] [--outcome] [--verification] [--release]
      [--depends-on 1,2] [--epic <slug>]
                            generic patch ("null" = reset a field to null;
                            --heat 0 / --no-heat cools the task (clears the field);
                            --depends-on null / --epic null to clear;
                            --milestone still accepted as a deprecated alias of --epic)

Conventions
  - NEVER reuse an id (monotonic nextId counter, _meta.yaml).
  - A done task stays in its type column (Done) — that's the changelog.
  - Subtasks: manually create a twin folder (04-x/ for 04-x.yaml),
    ids taken via add --json on a temporary section or manual edit
    + validate. The CLI only creates top-level tasks.
  - The dashboard (dashboard/: npm run dev) renders the same data, same validation.`

// Usage COURT par commande : servi tel quel sur une erreur de flag/valeur (message
// autoportant, 2-3 lignes), au lieu du USAGE global. Coupe court (annexe 2 du coût).
const CMD_USAGE = {
  list: 'Usage: list [--section <key>] [--status todo|in_progress|done] [--type <t>] [--tag <tag>] [--json] [--json-full]',
  show: 'Usage: show <id> [--json]',
  next: 'Usage: next [--count N] [--type <t>] [--json]',
  take: 'Usage: take [--type <t>] [--json]',
  brief: 'Usage: brief <id>',
  sitrep: 'Usage: sitrep',
  audit: 'Usage: audit [--json]  (parses the #id convention in commits since the last logged task; surfaces orphans + dead references)',
  guard: 'Usage: guard  (pre-commit hook — exit 1 if staged product files have no in_progress task)',
  done: 'Usage: done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>] [--suggest-refs] [--resolve-feedback all|1,3]',
  feedback: 'Usage: feedback <id> "<text>" [--author <name>]',
  roadmap: 'Usage: roadmap [--json]',
  add: 'Usage: add --type <type> --title <t> [--detail <d>] [--tags a,b] [--heat 0-100] [--size S|M|L]\n        [--code <c>] [--refs a,b] [--links 1,2] [--depends-on 1,2] [--epic <slug>]\n        [--kind task|milestone] [--blocks 1,2] [--source ai|user] [--json]  (--section/--stage = aliases of --type)',
  quick: 'Usage: quick "<title>" --type <t> [--tags a,b] [--heat 0-100] [--start] [--json]  (--type REQUIRED, #293)',
  update: 'Usage: update <id> [--title ...] [--detail ...] [--status ...] [--heat 0-100|--no-heat] [--tags a,b] [--refs a,b]\n        [--links 1,2] [--depends-on 1,2] [--epic <slug>] [--size ...] [--code ...] [--outcome ...] …',
}

/**
 * Valeur d'epic depuis les flags : --epic prime ; --milestone reste accepté comme
 * ALIAS DÉPRÉCIÉ (#133 — à retirer à une version majeure), avec avertissement stderr.
 */
function epicFromFlags(flags) {
  if (typeof flags.epic === 'string') return flags.epic
  if (typeof flags.milestone === 'string') {
    console.error('⚠ --milestone is deprecated (renamed --epic, #133) — alias applied.')
    return flags.milestone
  }
  return undefined
}

// ---------------------------------------------------------------- commandes

function cmdValidate() {
  // Garde de version (#248) : AVANT le schéma, repérer l'ancien modèle et sortir
  // sur un message actionnable plutôt qu'un mur d'erreurs (« lance migrate »).
  const legacy = detectLegacyModel(loadFiles(ROOT))
  if (legacy) {
    console.error(legacy)
    process.exit(1)
  }
  const { tree, errors } = treeWithErrors(ROOT)
  if (errors.length > 0) {
    console.error(`${errors.length} error(s):`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const count = (sections) => sections.reduce((n, s) => n + s.tasks.length, 0)
  console.log(
    `OK — ${tree.sections.length} sections (${count(tree.sections)} tasks), nextId=${tree.nextId}.`,
  )
}

function cmdList(flags) {
  rejectUnknownFlags(flags, ['section', 'status', 'type', 'tag', 'json', 'json-full'], CMD_USAGE.list)
  const tree = readTree(ROOT)
  let sections = tree.sections
  const bareType = (key) => key.replace(/^\d+-/, '')
  if (typeof flags.section === 'string') sections = sections.filter((s) => s.key === flags.section)
  // --type = filtre par nature : la section EST le type (#230). Accepte "bug" ou "01-bug".
  if (typeof flags.type === 'string') sections = sections.filter((s) => s.key === flags.type || bareType(s.key) === flags.type)
  const keepTasks = (pred) => {
    sections = sections.map((s) => ({ ...s, tasks: s.tasks.filter(pred) })).filter((s) => s.tasks.length > 0)
  }
  if (typeof flags.status === 'string') keepTasks((t) => t.status === flags.status)
  // --tag : le ledger de dette (#72) est requêtable — `list --tag debt` sort les
  // raccourcis assumés (quick taggés debt) comme l'équivalent des commentaires ponytail:.
  if (typeof flags.tag === 'string') keepTasks((t) => t.tags.includes(flags.tag))
  // --json-full : l'objet intégral d'avant (consommateurs qui exigent le detail).
  // --json (défaut) : ALLÉGÉ — id,title,status,type,size,kind,heat, sous-tâches
  // aplaties. Vérifié : aucun call-site programmatique de `list --json` (l'UI lit
  // /api/tasks → readTree, jamais le CLI ; seuls des docs le mentionnaient).
  if (flags['json-full']) {
    console.log(JSON.stringify({ nextId: tree.nextId, sections }, null, 2))
    return
  }
  if (flags.json) {
    const light = []
    const push = (t, type) =>
      light.push({ id: t.id, title: t.title, status: t.status, type, size: t.size, kind: t.kind, heat: t.heat ?? null })
    for (const s of sections) for (const t of s.tasks) {
      push(t, s.key)
      for (const sub of t.subtasks) push(sub, s.key)
    }
    console.log(JSON.stringify(light, null, 2))
    return
  }
  for (const s of sections) {
    const done = s.tasks.filter((t) => t.status === 'done').length
    console.log(`${s.key} — ${s.title} (${s.status}) ${done}/${s.tasks.length}`)
    for (const t of s.tasks) {
      console.log(taskLine(t))
      for (const sub of t.subtasks) console.log(taskLine(sub, '    '))
    }
  }
}

function cmdShow(id, flags) {
  rejectUnknownFlags(flags, ['json'], CMD_USAGE.show)
  const tree = readTree(ROOT)
  const hit = findTask(tree, id)
  if (!hit) {
    console.error(`No task #${id}.`)
    process.exit(1)
  }
  if (flags.json) console.log(JSON.stringify(hit, null, 2))
  else printTask(hit, tree)
}

function cmdBrief(id, flags) {
  rejectUnknownFlags(flags, [], CMD_USAGE.brief)
  const tree = readTree(ROOT)
  const hit = findTask(tree, id)
  if (!hit) fail(`No task #${id}.`, CMD_USAGE.brief)
  console.log(briefText(tree, hit))
}

function cmdTake(flags) {
  rejectUnknownFlags(flags, ['type', 'json'], CMD_USAGE.take)
  const type = typeof flags.type === 'string' ? flags.type : undefined
  const queue = nextQueue(readTree(ROOT), { type })
  if (queue.length === 0) {
    console.log(
      flags.json
        ? '{}'
        : `No task available${type ? ` for type ${type}` : ''} (everything is done, locked, or in progress).`,
    )
    return
  }
  const id = queue[0].id
  report(startTask(ROOT, id), null) // exit on failure (rollback already handled)
  const tree = readTree(ROOT)
  const hit = findTask(tree, id)
  if (flags.json) {
    console.log(JSON.stringify(hit.task, null, 2))
    return
  }
  console.log(`#${id} started.`)
  console.log(briefText(tree, hit))
}

function cmdNext(flags) {
  rejectUnknownFlags(flags, ['json', 'count', 'type'], CMD_USAGE.next)
  const count = flags.count ? Math.max(1, Number(flags.count) || 1) : 1
  const tree = readTree(ROOT)
  const queue = nextQueue(tree, { type: typeof flags.type === 'string' ? flags.type : undefined }).slice(0, count)
  if (queue.length === 0) {
    console.log(flags.json ? '[]' : 'No task available (everything is done, locked, or in progress).')
    return
  }
  if (flags.json) {
    // count=1 : objet (compat skill) ; sinon tableau ordonné.
    console.log(JSON.stringify(count === 1 ? queue[0] : queue, null, 2))
    return
  }
  for (const task of queue) {
    const hit = findTask(tree, task.id)
    if (count === 1) printTask(hit, tree)
    else console.log(taskLine(task, ''))
  }
}

function report(res, successMessage) {
  if (!res.ok) {
    console.error('Failed:')
    for (const e of res.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  if (successMessage) console.log(successMessage)
  return res
}

// #291 — confirmation d'une mutation : `#N "titre"`, jamais l'id nu. Un id sans
// titre est illisible et masque une cible erronée (post-mortem 2026-07-11 : un
// `start` sur le mauvais id a réussi silencieusement, aucun titre pour le trahir).
function labelOf(tree, id) {
  const hit = findTask(tree, id)
  return hit ? `#${id} "${hit.task.title}"` : `#${id}`
}

/**
 * `--type`/`--section`/`--stage` désignent tous LA nature (= le dossier de section).
 * `--type` est le mot du modèle ; les deux autres restent des alias rétrocompat.
 */
function sectionFromFlags(flags) {
  for (const k of ['type', 'section', 'stage']) {
    if (typeof flags[k] === 'string' && flags[k] !== '') return flags[k]
  }
  return undefined
}

/**
 * Parse `--heat <n>` en nombre (0–100). "null"/absent → undefined (pas de heat).
 * La validation fine (bornes, décimales) est faite après écriture par validate.ts ;
 * ici on garde-fou juste le non-numérique pour un message clair immédiat.
 */
function parseHeat(value, usage) {
  if (value === undefined || value === 'null') return undefined
  const n = Number(value)
  if (Number.isNaN(n)) fail(`--heat invalid: "${value}" (expected a number 0-100).`, usage)
  return n
}

function cmdAdd(flags) {
  rejectUnknownFlags(flags, [
    'type', 'section', 'stage', 'title', 'heat', 'detail', 'tags', 'size', 'code', 'refs', 'links',
    'depends-on', 'epic', 'milestone', 'kind', 'blocks', 'source', 'json',
  ], CMD_USAGE.add)
  requireFlags(flags, ['title'], CMD_USAGE.add)
  const section = sectionFromFlags(flags)
  if (!section) fail('Missing required flag: --type (the nature/section, e.g. 02-feature)', CMD_USAGE.add)
  const heat = parseHeat(flags.heat, CMD_USAGE.add)
  if (typeof flags.kind === 'string' && !['task', 'milestone'].includes(flags.kind)) {
    fail(`--kind invalid: "${flags.kind}" (expected task or milestone; 'quick' removed #250 — use a plain task).`, CMD_USAGE.add)
  }
  // --blocks 1,2 (sucre jalon, #133) : la nouvelle tâche est AJOUTÉE aux dependsOn
  // des tâches citées — l'inverse ergonomique de --depends-on. Ids vérifiés AVANT
  // toute écriture (pas de jalon créé puis chaînage à moitié appliqué).
  const blocks = typeof flags.blocks === 'string' ? parseDeps(flags.blocks, CMD_USAGE.add) : []
  if (blocks.length > 0) {
    const tree = readTree(ROOT)
    for (const id of blocks) {
      const hit = findTask(tree, id)
      if (!hit) fail(`--blocks: no task #${id}.`, CMD_USAGE.add)
    }
  }
  const epic = epicFromFlags(flags)
  const res = addTask(ROOT, {
    section,
    title: flags.title,
    heat,
    kind: typeof flags.kind === 'string' ? flags.kind : 'task',
    detail: typeof flags.detail === 'string' ? flags.detail : null,
    tags: typeof flags.tags === 'string' ? splitList(flags.tags) : [],
    size: typeof flags.size === 'string' ? flags.size : null,
    code: typeof flags.code === 'string' ? flags.code : null,
    refs: typeof flags.refs === 'string' ? splitList(flags.refs) : [],
    links: typeof flags.links === 'string' ? splitList(flags.links).map(Number) : [],
    dependsOn: typeof flags['depends-on'] === 'string' ? parseDeps(flags['depends-on'], CMD_USAGE.add) : [],
    epic: typeof epic === 'string' ? nullable(epic) : null,
    source: typeof flags.source === 'string' ? flags.source : 'ai',
  })
  report(res, flags.json ? null : `#${res.ok ? res.task?.id ?? '?' : ''} created → ${res.ok ? res.task?.file ?? '?' : ''}`)
  // --blocks chaining AFTER creation (the milestone's id now exists).
  if (res.ok && blocks.length > 0) {
    const newId = res.task.id
    for (const id of blocks) {
      const tree = readTree(ROOT)
      const t = findTask(tree, id).task
      if (t.dependsOn.includes(newId)) continue
      report(updateTask(ROOT, id, { dependsOn: [...t.dependsOn, newId] }), null)
    }
    if (!flags.json) console.log(`#${newId} now blocks: ${blocks.map((b) => `#${b}`).join(' ')}`)
  }
  if (flags.json && res.ok) console.log(JSON.stringify(res.task, null, 2))
}

// `quick` : alias de création RAPIDE d'une task (#250 — le kind 'quick' a disparu ;
// la commande survit par rétrocompat, mais crée un task ordinaire avec des défauts).
function cmdQuick(flags, positional) {
  rejectUnknownFlags(flags, ['type', 'section', 'stage', 'heat', 'tags', 'start', 'json'], CMD_USAGE.quick)
  const title = positional[0]
  if (!title || title.trim() === '') {
    fail('quick: title required (1st positional argument, in quotes).', CMD_USAGE.quick)
  }
  const heat = parseHeat(flags.heat, CMD_USAGE.quick)
  // #293 : --type OBLIGATOIRE. Le défaut silencieux (1er type "open") encourageait
  // le dump non catégorisé — quick reste rapide (titre + type), mais typé.
  const section = sectionFromFlags(flags)
  if (!section) fail('quick: --type is required (categorise even quick tasks, e.g. --type 01-bug).', CMD_USAGE.quick)
  const res = addTask(ROOT, {
    section,
    title,
    heat,
    tags: typeof flags.tags === 'string' ? splitList(flags.tags) : [],
  })
  report(res, null) // exit on failure
  const id = res.task.id
  if (!flags.json) console.log(`#${id} created.`)
  if (flags.start) {
    report(startTask(ROOT, id), null)
    if (!flags.json) console.log(`#${id} started.`)
  }
  if (flags.json) {
    const hit = findTask(readTree(ROOT), id)
    console.log(JSON.stringify(hit.task, null, 2))
  }
}

function cmdStart(id) {
  // #291 : statut AVANT mutation — rouvrir une tâche done est légitime (flow feedback),
  // mais le faire en silence masque un start sur la mauvaise cible (post-mortem).
  const before = findTask(readTree(ROOT), id)
  const res = report(startTask(ROOT, id), null)
  console.log(`${labelOf(res.tree, id)} → in_progress.`)
  if (before?.task.status === 'done') {
    console.error(`⚠ was done${before.task.completedAt ? ` since ${before.task.completedAt}` : ''} — reopening.`)
  }
}

/**
 * Fichiers du diff associés à la livraison (#71), pour SUGGESTION uniquement (jamais
 * écrits) : le commit consigné + les changements non commités, moins le bruit des
 * YAML de tâches. L'agent confirme au lieu de lire git.
 */
function suggestedRefs(commit) {
  const files = new Set()
  const add = (out) => { if (out) for (const l of out.split('\n')) if (l.trim()) files.add(l.trim()) }
  if (commit) add(git(`show --name-only --format= ${commit}`))
  add(git('diff --name-only HEAD')) // changements non commités vs HEAD
  return [...files].filter((f) => existsSync(f) && !f.startsWith('docs/tasks/'))
}

/**
 * Feedback (#149) : capture un retour sur une tâche SANS créer de ticket. Un
 * retour de même périmètre → rouvrir la tâche (take/start) et la re-terminer ;
 * un périmètre nouveau → un quick. Le journal rend la distinction auditable.
 */
function cmdFeedback(flags, positional) {
  rejectUnknownFlags(flags, ['author'], CMD_USAGE.feedback)
  const id = parseInt(positional[0], 10)
  if (!Number.isInteger(id)) fail('feedback: <id> required (1st positional).', CMD_USAGE.feedback)
  const text = positional[1]
  if (typeof text !== 'string' || text.trim() === '') {
    fail('feedback: "<text>" required (2nd positional, in quotes).', CMD_USAGE.feedback)
  }
  const author = typeof flags.author === 'string' ? flags.author : undefined
  report(
    addFeedback(ROOT, id, { text, author }),
    `feedback added to #${id}. Same scope → reopen it (take/start ${id}) then re-done; new scope → a quick.`,
  )
}

function cmdDone(id, flags) {
  rejectUnknownFlags(flags, ['commit', 'outcome', 'verification', 'release', 'suggest-refs', 'resolve-feedback'], CMD_USAGE.done)
  // --resolve-feedback : sans valeur (ou 'all') → tous ; sinon positions 1-based "1,3".
  const rf = flags['resolve-feedback']
  let resolveFeedback
  if (rf === true || rf === 'all') resolveFeedback = 'all'
  else if (typeof rf === 'string') resolveFeedback = rf.split(',').map((n) => parseInt(n, 10)).filter(Number.isInteger)
  // Auto-contexte (#71) : sans --commit, l'app consigne le HEAD courant (l'agent ne
  // lit plus git). Hors dépôt → git null → commit reste absent (rétrocompat sandbox).
  let commit = typeof flags.commit === 'string' ? flags.commit : undefined
  if (commit === undefined) {
    const head = git('rev-parse --short HEAD')
    if (head) commit = head
  }
  const res = report(
    doneTask(ROOT, id, {
      commit,
      outcome: typeof flags.outcome === 'string' ? flags.outcome : undefined,
      verification: typeof flags.verification === 'string' ? flags.verification : undefined,
      release: typeof flags.release === 'string' ? flags.release : undefined,
      resolveFeedback,
    }),
    null,
  )
  console.log(`${labelOf(res.tree, id)} done.${commit && typeof flags.commit !== 'string' ? ` commit=${commit} (HEAD).` : ''}`)
  // Non-blocking warnings (e.g. task delivered with no refs) → stderr, success preserved.
  if (res.ok && res.warnings) for (const w of res.warnings) console.error(`⚠ ${w}`)
  // --suggest-refs: lists the diff for CONFIRMATION, never applied (spec caution).
  if (res.ok && flags['suggest-refs']) {
    const refs = suggestedRefs(commit)
    if (refs.length === 0) console.error('suggested refs: none (no usable diff).')
    else {
      console.error('suggested refs (diff — TO CONFIRM, not written):')
      for (const f of refs) console.error(`  ${f}`)
      console.error(`→ to apply: update ${id} --refs ${refs.join(',')}`)
    }
  }
}

function cmdUpdate(id, flags) {
  const stringFields = ['title', 'detail', 'status', 'size', 'code', 'source', 'commit', 'outcome', 'verification', 'release', 'completedAt']
  const listFields = ['tags', 'refs', 'links']
  rejectUnknownFlags(flags, [...stringFields, ...listFields, 'heat', 'no-heat', 'depends-on', 'epic', 'milestone'], CMD_USAGE.update)
  if (Object.keys(flags).length === 0) {
    fail('update: no field to modify.', CMD_USAGE.update)
  }
  const patch = {}
  for (const f of stringFields) if (typeof flags[f] === 'string') patch[f] = nullable(flags[f])
  // --heat <n> pose/monte la chaleur ; --no-heat (ou --heat 0) refroidit (efface le champ).
  if (flags['no-heat']) patch.heat = 0
  else if (flags.heat !== undefined) patch.heat = parseHeat(flags.heat, CMD_USAGE.update) ?? 0
  for (const f of listFields) {
    if (typeof flags[f] !== 'string') continue
    // Parité avec --depends-on null : la valeur exacte "null" vide la liste ([]).
    // Sans ça, splitList('null') produirait un élément littéral "null".
    if (flags[f] === 'null') { patch[f] = []; continue }
    patch[f] = f === 'links' ? splitList(flags[f]).map(Number) : splitList(flags[f])
  }
  if (typeof flags['depends-on'] === 'string') patch.dependsOn = parseDeps(flags['depends-on'], CMD_USAGE.update)
  const epic = epicFromFlags(flags)
  if (typeof epic === 'string') patch.epic = nullable(epic)
  const res = report(updateTask(ROOT, id, patch), null)
  console.log(`${labelOf(res.tree, id)} updated.`)
}

// Garde pre-commit (#100, spec 2026-07-08-process-enforcement) : tout changement du
// repo = une unité roadmapped. Refuse un commit produit sans tâche in_progress ; laisse
// passer la consignation (backlog seul), les merges, et un repo non initialisé.
// Appelé par scripts/githooks/pre-commit (core.hooksPath, activé au npm prepare).
function cmdGuard(flags) {
  rejectUnknownFlags(flags, [], CMD_USAGE.guard)
  if (!existsSync(join(ROOT, '_meta.yaml'))) return // repo non initialisé : rien à garder
  const top = git('rev-parse --show-toplevel')
  if (!top) return // pas de dépôt git
  if (git('rev-parse -q --verify MERGE_HEAD')) return // merge en cours = intégration, pas travail nouveau
  const staged = (git('diff --cached --name-only') ?? '').split('\n').filter(Boolean)
  if (staged.length === 0) return
  // Consignation exemptée : fichiers sous le tasksDir configuré (realpath : /tmp vs /private/tmp).
  const relRoot = relative(realpathSync(top), realpathSync(ROOT))
  const offenders = relRoot.startsWith('..')
    ? staged
    : staged.filter((f) => f !== relRoot && !f.startsWith(`${relRoot}/`))
  if (offenders.length === 0) return
  const tree = readTree(ROOT)
  const inProgress = activeTasks(tree).filter((t) => t.status === 'in_progress')
  if (inProgress.length === 0) {
    console.error(
      [
        '✋ guard: commit refused — no in_progress task covers this work.',
        `Files outside the task log: ${offenders.join(', ')}`,
        'The quick path (~2 commands), then recommit:',
        '  npx roadmapped quick "<title>" --type <type> --start',
        '(Conscious escape hatch: git commit --no-verify — the drift will still show up in sitrep.)',
      ].join('\n'),
    )
    process.exit(1)
  }
  // #105: coverage exists, but if the ONLY in_progress is old it's the "eternal
  // in_progress" catch-all — name the credited task (non-blocking).
  const stale = stalePassepartout(tree, todayStr(), Number(process.env.ROADMAPED_GUARD_STALE_DAYS ?? 7))
  if (stale.length) {
    console.error(
      [
        '⚠ guard: commit credited to a stale in_progress — likely a catch-all ticket.',
        `  ${stale.map((s) => `#${s.id} "${s.title}" (${s.ageDays}d)`).join(', ')}`,
        '  If the work is done → done; otherwise a dedicated quick. (Non-blocking — no need for --no-verify.)',
      ].join('\n'),
    )
  }
}

async function cmdSitrep(flags) {
  rejectUnknownFlags(flags, [], CMD_USAGE.sitrep)
  const { tree, errors } = treeWithErrors(ROOT)
  console.log(sitrepText(tree, errors, unloggedCommits(tree)))
  // #294 : sitrep = l'ouverture de session (hook SessionStart) → point d'accroche de
  // l'auto-MAJ. Non bloquant, no-op si à jour/self-host/offline. Après la sortie
  // sitrep pour ne pas la retarder ; la ligne « updating… » s'affiche dessous.
  await autoUpdate(packageRoot(), HOST_ROOT)
}

function cmdAudit(flags) {
  rejectUnknownFlags(flags, ['json'], CMD_USAGE.audit)
  const tree = readTree(ROOT)
  const audit = auditCommits(tree)
  if (flags.json) return console.log(JSON.stringify(audit, null, 2))
  console.log(auditText(audit))
}

function cmdRoadmap(flags) {
  rejectUnknownFlags(flags, ['json'], CMD_USAGE.roadmap)
  const tree = readTree(ROOT)
  const avail = computeAvailability(tree)
  const active = activeTasks(tree)
  const missingOf = (t) => t.dependsOn.filter((d) => avail.get(d) === 'available' || avail.get(d) === 'locked')
  const progress = globalProgress(tree)
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  // Epics = déclarés (_epics.yaml) PUIS auto-découverts sur les tâches (allEpics).
  const model = allEpics(tree).map((e) => ({
    slug: e.slug,
    title: e.title,
    ...epicProgress(tree, e.slug),
    tasks: active.filter((t) => t.epic === e.slug).map((t) => ({
      id: t.id, title: t.title, kind: t.kind,
      state: avail.get(t.id) ?? 'available', missing: missingOf(t),
    })),
  }))
  const unassigned = active.filter((t) => t.epic === null)

  if (flags.json) {
    console.log(JSON.stringify({ progress, epics: model, unassigned: unassigned.length }, null, 2))
    return
  }
  console.log(`overall progress: ${progress.done}/${progress.total} (${pct}%)`)
  if (model.length === 0) {
    console.log('No epics (no task carries the epic field; _epics.yaml absent).')
    return
  }
  for (const e of model) {
    console.log(`\n${e.slug}${e.title !== e.slug ? ` — ${e.title}` : ''}  ${e.done}/${e.total}`)
    for (const t of e.tasks) {
      const tag = t.state === 'done' ? '[x]' : t.state === 'available' ? '[~] (available)' : `[ ] (locked: ${t.missing.map((d) => `#${d}`).join(' ')})`
      const chips = [t.kind !== 'task' ? t.kind : null].filter(Boolean).join(' ')
      console.log(`  ${tag} #${t.id} ${t.title}${chips ? `  (${chips})` : ''}`)
    }
  }
  if (unassigned.length > 0) console.log(`\n(no epic) ${unassigned.length} active task(s) unassigned`)
}

// ---------------------------------------------------------------- dispatch

const [cmd, ...rest] = process.argv.slice(2)
const { flags, positional } = parseArgs(rest)

const needId = () => {
  const id = parseInt(positional[0], 10)
  if (!Number.isInteger(id)) {
    console.error('Required argument: numeric <id> (e.g. task.mjs show 42).')
    process.exit(1)
  }
  return id
}

switch (cmd) {
  case 'validate':
    cmdValidate()
    break
  case 'list':
    cmdList(flags)
    break
  case 'show':
    cmdShow(needId(), flags)
    break
  case 'brief':
    cmdBrief(needId(), flags)
    break
  case 'sitrep':
    await cmdSitrep(flags)
    break
  case 'audit':
    cmdAudit(flags)
    break
  case 'guard':
    cmdGuard(flags)
    break
  case 'take':
    cmdTake(flags)
    break
  case 'next':
    cmdNext(flags)
    break
  case 'add':
    cmdAdd(flags)
    break
  case 'quick':
    cmdQuick(flags, positional)
    break
  case 'start':
    cmdStart(needId())
    break
  case 'feedback':
    cmdFeedback(flags, positional)
    break
  case 'done':
    cmdDone(needId(), flags)
    break
  case 'update':
    cmdUpdate(needId(), flags)
    break
  case 'roadmap':
    cmdRoadmap(flags)
    break
  case undefined:
  case 'help':
  case '--help':
    console.log(USAGE)
    break
  default:
    console.error(`Unknown command: ${cmd}\n`)
    console.log(USAGE)
    process.exit(1)
}
