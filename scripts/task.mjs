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

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { loadPaths } from '../src/lib/paths.ts'
import {
  treeWithErrors, readTree, findTask,
  addTask, startTask, doneTask, updateTask, archiveTask,
} from '../src/lib/taskWrites.ts'
import { computeAvailability, activeTasks, archivedTasks, nextQueue } from '../src/lib/roadmap.ts'
import { parseRef, locateLine, snippet } from '../src/lib/refExtract.ts'
import { TEAMS } from '../src/lib/tasks.ts'

const { tasksDir: ROOT } = loadPaths()

// git best-effort : hors dépôt ou commande en échec → null (jamais d'exception ni de
// bruit sur stderr). Sert la fraîcheur des refs (#69), l'autofill du commit et la
// suggestion de refs au done (#71). Le token le moins cher est celui que l'agent ne lit pas.
function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

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
      fail(`Flag requis manquant : --${n}`, usage)
    }
  }
}

function rejectUnknownFlags(flags, allowed, usage) {
  for (const k of Object.keys(flags)) {
    if (!allowed.includes(k)) {
      fail(`Flag inconnu : --${k}`, usage ?? `(autorisés : ${allowed.map((a) => `--${a}`).join(', ')})`)
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
    fail(`--depends-on : id(s) invalide(s) : ${bad.join(', ')} (attendu des ids numériques séparés par des virgules, ou "null" pour vider).`, usage)
  }
  return tokens.map(Number)
}

// ---------------------------------------------------------------- affichage

const GLYPH = { todo: '[ ]', in_progress: '[~]', done: '[x]' }
const STATUS_FR = { todo: 'à faire', in_progress: 'en cours', done: 'faite' }

function taskLine(t, indent = '  ') {
  const chips = [t.code, t.size, t.team, t.kind === 'quick' ? 'quick' : null, ...t.tags].filter(Boolean).join(' ')
  return `${indent}${GLYPH[t.status]} #${String(t.id).padEnd(4)}${t.title}${chips ? `  (${chips})` : ''}`
}

/**
 * Lien titré « #id titre (statut) » — l'app porte le contexte, l'agent ne navigue
 * plus en cascade. Helper UNIQUE partagé par show et brief pour deps/liées/sous-tâches.
 */
function refLine(tree, id) {
  const hit = findTask(tree, id)
  if (!hit) return `#${id} (inconnu)`
  const st = STATUS_FR[hit.task.status] ?? hit.task.status
  return `#${id} ${hit.task.title} (${hit.archived ? `${st}, archivée` : st})`
}

function printTask(hit, tree) {
  const { task, sectionKey, archived } = hit
  console.log(taskLine(task, ''))
  console.log(`  section: ${sectionKey}${archived ? ' (archive)' : ''}`)
  console.log(`  fichier: ${task.file}`)
  if (task.detail) console.log(`  detail: ${task.detail.trim().replace(/\n/g, '\n          ')}`)
  if (task.refs.length) console.log(`  refs: ${task.refs.join(' · ')}`)
  if (task.dependsOn.length) console.log(`  dépend de: ${task.dependsOn.map((d) => refLine(tree, d)).join(' · ')}`)
  if (task.links.length) console.log(`  liées: ${task.links.map((l) => refLine(tree, l)).join(' · ')}`)
  if (task.outcome) console.log(`  outcome: ${task.outcome}`)
  if (task.verification) console.log(`  vérification: ${task.verification}`)
  if (task.commit) console.log(`  commit: ${task.commit}`)
  if (task.release) console.log(`  release: ${task.release}`)
  console.log(`  dates: créée ${task.createdAt}${task.completedAt ? ` · terminée ${task.completedAt}` : ''} · source ${task.source}`)
  for (const sub of task.subtasks) console.log(taskLine(sub, '    '))
}

/**
 * Rend UNE ref dans le brief (#69) : drapeau de fraîcheur pour TOUTE ref dont le
 * fichier a été modifié après `createdAt` (git log), et — si la ref est ANCRÉE
 * (`fichier#symbole` ou `fichier:ligne`) — l'extrait ~10 lignes autour, lu au serve
 * (donc toujours le code actuel). Une ref nue reste une simple ligne : les tickets
 * existants ne gonflent pas, l'ancrage est opt-in.
 */
function renderRef(ref, createdAt) {
  const { path, anchor } = parseRef(ref)
  const exists = existsSync(path)
  // %cs = date du dernier commit touchant le fichier (YYYY-MM-DD) ; compare ISO en
  // chaîne. Granularité au jour (le datetime précis viendra avec #77) : un même-jour
  // ne lève pas le drapeau.
  const lastCommit = exists ? git(`log -1 --format=%cs -- "${path}"`) : null
  const flag = lastCommit && lastCommit > createdAt ? ' ⚠ modifié depuis la création du ticket' : ''
  const head = `  ${ref}${flag}`
  if (!anchor || !exists) return head
  const line = locateLine(readFileSync(path, 'utf8'), anchor)
  if (line === null) {
    const what = anchor.kind === 'symbol' ? `symbole "${anchor.value}"` : `ligne ${anchor.value}`
    return `${head}\n    ⚠ ancre introuvable (${what}) — lire le fichier`
  }
  const snip = snippet(readFileSync(path, 'utf8'), line).split('\n').map((l) => `    ${l}`).join('\n')
  return `${head}\n${snip}`
}

/**
 * LE contexte d'exécution complet et dense d'une tâche (équivalent CLI du « brief
 * agent »). Zéro navigation : deps/liées/sous-tâches titrées + statut inline, refs
 * une par ligne (extraits d'ancre + fraîcheur, #69), rappel `done` en pied
 * (verification omise pour un quick).
 */
function briefText(tree, hit) {
  const t = hit.task
  const out = [`#${t.id} ${t.title}`]
  const meta = [`stage: ${hit.sectionKey}`, `team: ${t.team}`]
  if (t.kind === 'quick') meta.push('kind: quick')
  if (t.size) meta.push(`size: ${t.size}`)
  if (t.tags.length) meta.push(`tags: ${t.tags.join(', ')}`)
  out.push(meta.join(' · '))
  if (t.detail) out.push(`detail: ${t.detail.trim()}`)
  if (t.refs.length) { out.push('refs:'); for (const r of t.refs) out.push(renderRef(r, t.createdAt)) }
  if (t.dependsOn.length) { out.push('dépend de:'); for (const d of t.dependsOn) out.push(`  ${refLine(tree, d)}`) }
  if (t.links.length) { out.push('liées:'); for (const l of t.links) out.push(`  ${refLine(tree, l)}`) }
  if (t.subtasks.length) { out.push('sous-tâches:'); for (const s of t.subtasks) out.push(`  ${refLine(tree, s.id)}`) }
  out.push(
    t.kind === 'quick'
      ? `done ${t.id} --commit <sha> --outcome "…"`
      : `done ${t.id} --commit <sha> --outcome "…" --verification "…"`,
  )
  return out.join('\n')
}

const USAGE = `task.mjs — gestion de docs/tasks/ (source de vérité du backlog Roadmaped)

Usage : node scripts/task.mjs <commande> [arguments]
        (Node >= 22.18 ; sinon : npm run task --prefix dashboard -- <commande>)

Stages (sections canoniques, fixes) : 01-idea · 02-initial · 03-identity · 04-build
  05-gtm · 06-launch · 07-scale · 08-mature  (créés à l'init, non modifiables au CLI)
Teams (équipe métier, enum fixe) : ${TEAMS.join(' · ')}

Ouverture de session (machine-first : tout le contexte en 1 appel)
  sitrep                    l'état du monde en ≤30 lignes (done du jour, in_progress,
                            3 prochaines, validate, alertes) — LE 1er geste de session
  take [--team <t>] [--json] next + start + brief EN UNE COMMANDE (la commande d'ouverture)
  brief <id>                LE contexte d'exécution complet et dense (deps/liées titrées,
                            refs + extraits d'ancre & fraîcheur, rappel done) — remplace show en cascade

Lecture
  list [--section <key>] [--status todo|in_progress|done] [--team <t>] [--tag <tag>] [--archive] [--json] [--json-full]
                            --json = allégé (id,title,status,team,stage,size,kind) ;
                            --json-full = l'objet intégral (nextId + sections complètes)
  show <id> [--json]        détail complet d'une tâche (deps/liées titrées, id global ex: 42)
  next [--count N] [--team t] [--json]
                            LA file de travail : les N prochaines todo DISPONIBLES
                            (deps done), ordre stage PUIS ancienneté — calculé par
                            l'app, à CONSOMMER tel quel (jamais recalculer)
  roadmap [--json]          vue par roadmap/jalon (docs/tasks/_roadmaps.yaml) :
                            progression + état de chaque tâche (done/disponible/verrouillé)
  validate                  valide tout docs/tasks/ (schéma + unicité des ids
                            + nextId, archive comprise) ; exit 1 si erreur

Écriture (id alloué depuis _meta.yaml ; validation après CHAQUE écriture, rollback si erreur)
  add --section <stage> --title <t> --team <team> [--detail <d>] [--tags a,b]
      [--size S|M|L] [--code <c>] [--refs a,b] [--links 1,2]
      [--depends-on 1,2] [--milestone <slug>] [--source ai|user] [--json]
                            --team est REQUIS (enum fixe ci-dessus)
  quick "<titre>" --team <t> [--stage <s>] [--tags a,b] [--start] [--json]
                            mini-ticket : titre+team suffisent (stage défaut = 1er open) ;
                            au done, --outcome requis mais --verification facultative
  start <id>                status → in_progress
  done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>]
                            status → done + completedAt=aujourd'hui + doc de livraison
                            (--outcome : ce qui a été livré, en une phrase — le changelog)
  update <id> [--title] [--detail] [--status] [--tags] [--refs] [--links]
      [--size] [--team] [--code] [--source] [--commit] [--outcome] [--verification] [--release]
      [--depends-on 1,2] [--milestone <slug>]
                            patch générique ("null" = remettre un champ à null ;
                            --depends-on null / --milestone null pour vider)
  archive <id>              déplace une tâche done vers _archive/<section>/ (+ jumeau)

Conventions
  - Ne JAMAIS réutiliser un id (compteur nextId monotone, _meta.yaml).
  - Archiver une tâche actée = \`task.mjs archive <id>\` (déplace son fichier + le
    dossier jumeau de sous-tâches vers docs/tasks/_archive/<section>/).
  - Sous-tâches : créer à la main un dossier jumeau (04-x/ pour 04-x.yaml),
    ids pris via add --json sur une section temporaire ou édition manuelle
    + validate. Le CLI ne crée que des tâches de premier niveau.
  - Le dashboard (dashboard/ : npm run dev) rend la même donnée, même validation.`

// Usage COURT par commande : servi tel quel sur une erreur de flag/valeur (message
// autoportant, 2-3 lignes), au lieu du USAGE global. Coupe court (annexe 2 du coût).
const CMD_USAGE = {
  list: 'Usage : list [--section <key>] [--status todo|in_progress|done] [--team <t>] [--tag <tag>] [--archive] [--json] [--json-full]',
  show: 'Usage : show <id> [--json]',
  next: 'Usage : next [--count N] [--team <t>] [--json]',
  take: 'Usage : take [--team <t>] [--json]',
  brief: 'Usage : brief <id>',
  sitrep: 'Usage : sitrep',
  done: 'Usage : done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>] [--suggest-refs]',
  roadmap: 'Usage : roadmap [--json]',
  add: 'Usage : add --section <stage> --title <t> --team <team> [--detail <d>] [--tags a,b] [--size S|M|L]\n        [--code <c>] [--refs a,b] [--links 1,2] [--depends-on 1,2] [--milestone <slug>] [--source ai|user] [--json]',
  quick: 'Usage : quick "<titre>" --team <t> [--stage <s>] [--tags a,b] [--start] [--json]',
  update: 'Usage : update <id> [--title ...] [--detail ...] [--status ...] [--team ...] [--tags a,b] [--refs a,b]\n        [--links 1,2] [--depends-on 1,2] [--milestone <slug>] [--size ...] [--code ...] [--outcome ...] …',
}

// ---------------------------------------------------------------- commandes

function cmdValidate() {
  const { tree, errors } = treeWithErrors(ROOT)
  if (errors.length > 0) {
    console.error(`${errors.length} erreur(s) :`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const count = (sections) => sections.reduce((n, s) => n + s.tasks.length, 0)
  console.log(
    `OK — ${tree.sections.length} sections actives (${count(tree.sections)} tâches), ` +
      `${tree.archive.length} sections archivées (${count(tree.archive)} tâches), nextId=${tree.nextId}.`,
  )
}

function cmdList(flags) {
  rejectUnknownFlags(flags, ['section', 'status', 'team', 'tag', 'archive', 'json', 'json-full'], CMD_USAGE.list)
  const tree = readTree(ROOT)
  let sections = flags.archive ? [...tree.sections, ...tree.archive] : tree.sections
  if (typeof flags.section === 'string') sections = sections.filter((s) => s.key === flags.section)
  const keepTasks = (pred) => {
    sections = sections.map((s) => ({ ...s, tasks: s.tasks.filter(pred) })).filter((s) => s.tasks.length > 0)
  }
  if (typeof flags.status === 'string') keepTasks((t) => t.status === flags.status)
  if (typeof flags.team === 'string') keepTasks((t) => t.team === flags.team)
  // --tag : le ledger de dette (#72) est requêtable — `list --tag debt` sort les
  // raccourcis assumés (quick taggés debt) comme l'équivalent des commentaires ponytail:.
  if (typeof flags.tag === 'string') keepTasks((t) => t.tags.includes(flags.tag))
  // --json-full : l'objet intégral d'avant (consommateurs qui exigent le detail).
  // --json (défaut) : ALLÉGÉ — id,title,status,team,stage,size,kind, sous-tâches
  // aplaties. Vérifié : aucun call-site programmatique de `list --json` (l'UI lit
  // /api/tasks → readTree, jamais le CLI ; seuls des docs le mentionnaient).
  if (flags['json-full']) {
    console.log(JSON.stringify({ nextId: tree.nextId, sections }, null, 2))
    return
  }
  if (flags.json) {
    const light = []
    const push = (t, stage) =>
      light.push({ id: t.id, title: t.title, status: t.status, team: t.team, stage, size: t.size, kind: t.kind })
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
    console.error(`Aucune tâche #${id} (actives et archive confondues).`)
    process.exit(1)
  }
  if (flags.json) console.log(JSON.stringify(hit, null, 2))
  else printTask(hit, tree)
}

function cmdBrief(id, flags) {
  rejectUnknownFlags(flags, [], CMD_USAGE.brief)
  const tree = readTree(ROOT)
  const hit = findTask(tree, id)
  if (!hit) fail(`Aucune tâche #${id} (actives et archive confondues).`, CMD_USAGE.brief)
  console.log(briefText(tree, hit))
}

function cmdTake(flags) {
  rejectUnknownFlags(flags, ['team', 'json'], CMD_USAGE.take)
  const team = typeof flags.team === 'string' ? flags.team : undefined
  const queue = nextQueue(readTree(ROOT), { team })
  if (queue.length === 0) {
    console.log(
      flags.json
        ? '{}'
        : `Aucune tâche disponible${team ? ` pour la team ${team}` : ''} (tout est fait, verrouillé ou en cours).`,
    )
    return
  }
  const id = queue[0].id
  report(startTask(ROOT, id), null) // exit si échec (rollback déjà géré)
  const tree = readTree(ROOT)
  const hit = findTask(tree, id)
  if (flags.json) {
    console.log(JSON.stringify(hit.task, null, 2))
    return
  }
  console.log(`#${id} démarrée.`)
  console.log(briefText(tree, hit))
}

function cmdNext(flags) {
  rejectUnknownFlags(flags, ['json', 'count', 'team'], CMD_USAGE.next)
  const count = flags.count ? Math.max(1, Number(flags.count) || 1) : 1
  const tree = readTree(ROOT)
  const queue = nextQueue(tree, { team: typeof flags.team === 'string' ? flags.team : undefined }).slice(0, count)
  if (queue.length === 0) {
    console.log(flags.json ? '[]' : 'Aucune tâche disponible (tout est fait, verrouillé ou en cours).')
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
    console.error('Échec :')
    for (const e of res.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  if (successMessage) console.log(successMessage)
  return res
}

/** Vérifie qu'une valeur de team appartient à l'enum ; sinon quitte en listant les 8. */
function assertTeam(value, usage) {
  if (!TEAMS.includes(value)) {
    fail(`--team invalide : "${value}" (attendu l'une de : ${TEAMS.join(', ')})`, usage)
  }
}

function cmdAdd(flags) {
  rejectUnknownFlags(flags, [
    'section', 'title', 'team', 'detail', 'tags', 'size', 'code', 'refs', 'links',
    'depends-on', 'milestone', 'source', 'json',
  ], CMD_USAGE.add)
  requireFlags(flags, ['section', 'title', 'team'], CMD_USAGE.add)
  assertTeam(flags.team, CMD_USAGE.add)
  const res = addTask(ROOT, {
    section: flags.section,
    title: flags.title,
    team: flags.team,
    detail: typeof flags.detail === 'string' ? flags.detail : null,
    tags: typeof flags.tags === 'string' ? splitList(flags.tags) : [],
    size: typeof flags.size === 'string' ? flags.size : null,
    code: typeof flags.code === 'string' ? flags.code : null,
    refs: typeof flags.refs === 'string' ? splitList(flags.refs) : [],
    links: typeof flags.links === 'string' ? splitList(flags.links).map(Number) : [],
    dependsOn: typeof flags['depends-on'] === 'string' ? parseDeps(flags['depends-on'], CMD_USAGE.add) : [],
    milestone: typeof flags.milestone === 'string' ? nullable(flags.milestone) : null,
    source: typeof flags.source === 'string' ? flags.source : 'ai',
  })
  report(res, flags.json ? null : `#${res.ok ? res.task?.id ?? '?' : ''} créée → ${res.ok ? res.task?.file ?? '?' : ''}`)
  if (flags.json && res.ok) console.log(JSON.stringify(res.task, null, 2))
}

function cmdQuick(flags, positional) {
  rejectUnknownFlags(flags, ['team', 'stage', 'tags', 'start', 'json'], CMD_USAGE.quick)
  const title = positional[0]
  if (!title || title.trim() === '') {
    fail('quick : titre requis (1er argument positionnel, entre guillemets).', CMD_USAGE.quick)
  }
  requireFlags(flags, ['team'], CMD_USAGE.quick)
  assertTeam(flags.team, CMD_USAGE.quick)
  // Stage par défaut = le premier stage "open" (Build aujourd'hui). tree.sections
  // est déjà trié par préfixe numérique croissant.
  const stage = typeof flags.stage === 'string'
    ? flags.stage
    : readTree(ROOT).sections.find((s) => s.status === 'open')?.key
  if (!stage) fail('Aucun stage "open" pour accueillir le quick — préciser --stage.', CMD_USAGE.quick)
  const res = addTask(ROOT, {
    section: stage,
    title,
    team: flags.team,
    tags: typeof flags.tags === 'string' ? splitList(flags.tags) : [],
    kind: 'quick',
  })
  report(res, null) // exit si échec
  const id = res.task.id
  if (!flags.json) console.log(`#${id} créée (quick).`)
  if (flags.start) {
    report(startTask(ROOT, id), null)
    if (!flags.json) console.log(`#${id} démarrée.`)
  }
  if (flags.json) {
    const hit = findTask(readTree(ROOT), id)
    console.log(JSON.stringify(hit.task, null, 2))
  }
}

function cmdStart(id) {
  report(startTask(ROOT, id), `#${id} démarrée (in_progress).`)
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

function cmdDone(id, flags) {
  rejectUnknownFlags(flags, ['commit', 'outcome', 'verification', 'release', 'suggest-refs'], CMD_USAGE.done)
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
    }),
    `#${id} terminée (done).${commit && typeof flags.commit !== 'string' ? ` commit=${commit} (HEAD).` : ''}`,
  )
  // Warnings non bloquants (ex: task livrée sans refs) → stderr, succès préservé.
  if (res.ok && res.warnings) for (const w of res.warnings) console.error(`⚠ ${w}`)
  // --suggest-refs : liste le diff pour CONFIRMATION, jamais appliquée (prudence spec).
  if (res.ok && flags['suggest-refs']) {
    const refs = suggestedRefs(commit)
    if (refs.length === 0) console.error('refs suggérées : aucune (pas de diff exploitable).')
    else {
      console.error('refs suggérées (diff — À CONFIRMER, non écrites) :')
      for (const f of refs) console.error(`  ${f}`)
      console.error(`→ pour les appliquer : update ${id} --refs ${refs.join(',')}`)
    }
  }
}

function cmdUpdate(id, flags) {
  const stringFields = ['title', 'detail', 'status', 'size', 'team', 'code', 'source', 'commit', 'outcome', 'verification', 'release', 'completedAt']
  const listFields = ['tags', 'refs', 'links']
  rejectUnknownFlags(flags, [...stringFields, ...listFields, 'depends-on', 'milestone'], CMD_USAGE.update)
  if (Object.keys(flags).length === 0) {
    fail('update : aucun champ à modifier.', CMD_USAGE.update)
  }
  // --team : valider l'enum avant écriture (message clair listant les 8),
  // sauf "null" qui n'a pas de sens ici (team obligatoire) mais reste rejeté par validate.
  if (typeof flags.team === 'string' && flags.team !== 'null') assertTeam(flags.team, CMD_USAGE.update)
  const patch = {}
  for (const f of stringFields) if (typeof flags[f] === 'string') patch[f] = nullable(flags[f])
  for (const f of listFields) {
    if (typeof flags[f] !== 'string') continue
    // Parité avec --depends-on null : la valeur exacte "null" vide la liste ([]).
    // Sans ça, splitList('null') produirait un élément littéral "null".
    if (flags[f] === 'null') { patch[f] = []; continue }
    patch[f] = f === 'links' ? splitList(flags[f]).map(Number) : splitList(flags[f])
  }
  if (typeof flags['depends-on'] === 'string') patch.dependsOn = parseDeps(flags['depends-on'], CMD_USAGE.update)
  if (typeof flags.milestone === 'string') patch.milestone = nullable(flags.milestone)
  report(updateTask(ROOT, id, patch), `#${id} mise à jour.`)
}

function cmdArchive(id) {
  report(archiveTask(ROOT, id), `#${id} archivée → docs/tasks/_archive/…`)
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (isoA, isoB) =>
  Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86_400_000)

/**
 * L'état du monde en ≤30 lignes (#70) : ouverture de session en UN appel. Ce que
 * l'agent relisait dans le backlog (~1 200 tokens) devient ~150. Titres seuls, pas
 * de detail. L'âge in_progress se compte depuis createdAt (faute de startedAt — un
 * proxy, pas une horloge de démarrage). Signale la dette ouverte via les tags.
 */
function cmdSitrep(flags) {
  rejectUnknownFlags(flags, [], CMD_USAGE.sitrep)
  const { tree, errors } = treeWithErrors(ROOT)
  const active = activeTasks(tree)
  const today = todayStr()
  const brief = (t) => `#${t.id} ${t.title}`
  // Plafonne l'affichage (le budget est ≤30 lignes / ~150 tokens) : le COMPTE reste
  // exact, seuls les titres au-delà de N sont résumés en « +K autres ».
  const capped = (items, render, n = 8) => {
    if (items.length === 0) return ''
    const shown = items.slice(0, n).map(render).join(' · ')
    return `: ${shown}${items.length > n ? ` (+${items.length - n} autres)` : ''}`
  }
  const doneToday = [...active, ...archivedTasks(tree)].filter((t) => t.completedAt === today)
  const inProgress = active.filter((t) => t.status === 'in_progress')
  const queue = nextQueue(tree).slice(0, 3)

  console.log(`sitrep — ${today}`)
  console.log(`done aujourd'hui (${doneToday.length})${capped(doneToday, brief)}`)
  console.log(`in_progress (${inProgress.length})${capped(inProgress, (t) => `${brief(t)} (${daysBetween(t.createdAt, today)}j)`)}`)
  console.log(`prochaines: ${queue.length ? queue.map(brief).join(' · ') : '— (file vide)'}`)
  console.log(`validate: ${errors.length === 0 ? 'OK' : `${errors.length} erreur(s)`}`)

  const alerts = []
  const stale = inProgress.filter((t) => daysBetween(t.createdAt, today) >= 7)
  if (stale.length) alerts.push(`${stale.length} in_progress ancienne(s) (≥7j) : ${stale.map((t) => `#${t.id}`).join(' ')}`)
  const debt = active.filter((t) => t.status !== 'done' && t.tags.includes('debt'))
  if (debt.length) alerts.push(`${debt.length} dette(s) ouverte(s) (#debt) : ${debt.map((t) => `#${t.id}`).join(' ')}`)
  if (errors.length) alerts.push(`validate rouge — lance \`validate\``)
  if (alerts.length) for (const a of alerts) console.log(`⚠ ${a}`)
}

function cmdRoadmap(flags) {
  rejectUnknownFlags(flags, ['json'], CMD_USAGE.roadmap)
  const tree = readTree(ROOT)
  const avail = computeAvailability(tree)
  const active = activeTasks(tree)
  const missingOf = (t) => t.dependsOn.filter((d) => avail.get(d) === 'available' || avail.get(d) === 'locked')
  const model = tree.roadmaps.map((r) => ({
    slug: r.slug,
    title: r.title,
    milestones: r.milestones.map((m) => {
      const tasks = active.filter((t) => t.milestone === m.slug)
      return {
        slug: m.slug,
        title: m.title,
        done: tasks.filter((t) => t.status === 'done').length,
        total: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id, title: t.title, team: t.team, state: avail.get(t.id) ?? 'available', missing: missingOf(t),
        })),
      }
    }),
  }))
  const unassigned = active.filter((t) => t.milestone === null)

  if (flags.json) {
    console.log(JSON.stringify({ roadmaps: model, unassigned: unassigned.length }, null, 2))
    return
  }
  if (model.length === 0) {
    console.log('Aucune roadmap (docs/tasks/_roadmaps.yaml absent).')
    return
  }
  for (const r of model) {
    console.log(`${r.slug} — ${r.title}`)
    for (const m of r.milestones) {
      console.log(`  ${m.slug} — ${m.title}  ${m.done}/${m.total}`)
      for (const t of m.tasks) {
        const tag = t.state === 'done' ? '[x]' : t.state === 'available' ? '[~] (disponible)' : `[ ] (verrouillé: ${t.missing.map((d) => `#${d}`).join(' ')})`
        console.log(`    ${tag} #${t.id} ${t.title}${t.team ? `  (${t.team})` : ''}`)
      }
    }
  }
  if (unassigned.length > 0) console.log(`\n(sans jalon) ${unassigned.length} tâche(s) active(s) non affectée(s)`)
}

// ---------------------------------------------------------------- dispatch

const [cmd, ...rest] = process.argv.slice(2)
const { flags, positional } = parseArgs(rest)

const needId = () => {
  const id = parseInt(positional[0], 10)
  if (!Number.isInteger(id)) {
    console.error('Argument requis : <id> numérique (ex: task.mjs show 42).')
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
    cmdSitrep(flags)
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
  case 'done':
    cmdDone(needId(), flags)
    break
  case 'update':
    cmdUpdate(needId(), flags)
    break
  case 'archive':
    cmdArchive(needId())
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
    console.error(`Commande inconnue : ${cmd}\n`)
    console.log(USAGE)
    process.exit(1)
}
