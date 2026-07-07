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

import { loadPaths } from '../src/lib/paths.ts'
import {
  treeWithErrors, readTree, findTask,
  addTask, startTask, doneTask, updateTask, archiveTask,
} from '../src/lib/taskWrites.ts'
import { computeAvailability, activeTasks } from '../src/lib/roadmap.ts'

const { tasksDir: ROOT } = loadPaths()

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

function requireFlags(flags, names) {
  for (const n of names) {
    if (typeof flags[n] !== 'string' || flags[n] === '') {
      console.error(`Flag requis manquant : --${n}`)
      process.exit(1)
    }
  }
}

function rejectUnknownFlags(flags, allowed) {
  for (const k of Object.keys(flags)) {
    if (!allowed.includes(k)) {
      console.error(`Flag inconnu : --${k} (autorisés : ${allowed.map((a) => `--${a}`).join(', ')})`)
      process.exit(1)
    }
  }
}

const splitList = (v) => (v === '' ? [] : v.split(',').map((s) => s.trim()).filter(Boolean))
const nullable = (v) => (v === 'null' ? null : v)
const parseDeps = (v) => {
  if (v === 'null' || v === '') return []
  const tokens = splitList(v)
  const bad = tokens.filter((t) => Number.isNaN(Number(t)))
  if (bad.length > 0) {
    console.error(`--depends-on : id(s) invalide(s) : ${bad.join(', ')} (attendu des ids numériques séparés par des virgules, ou "null" pour vider).`)
    process.exit(1)
  }
  return tokens.map(Number)
}

// ---------------------------------------------------------------- affichage

const GLYPH = { todo: '[ ]', in_progress: '[~]', done: '[x]' }

function taskLine(t, indent = '  ') {
  const chips = [t.code, t.size, t.zone, ...t.tags].filter(Boolean).join(' ')
  return `${indent}${GLYPH[t.status]} #${String(t.id).padEnd(4)}${t.title}${chips ? `  (${chips})` : ''}`
}

function printTask(hit) {
  const { task, sectionKey, archived } = hit
  console.log(taskLine(task, ''))
  console.log(`  section: ${sectionKey}${archived ? ' (archive)' : ''}`)
  console.log(`  fichier: ${task.file}`)
  if (task.detail) console.log(`  detail: ${task.detail.trim().replace(/\n/g, '\n          ')}`)
  if (task.refs.length) console.log(`  refs: ${task.refs.join(' · ')}`)
  if (task.links.length) console.log(`  liées: ${task.links.map((l) => `#${l}`).join(' ')}`)
  if (task.outcome) console.log(`  outcome: ${task.outcome}`)
  if (task.verification) console.log(`  vérification: ${task.verification}`)
  if (task.commit) console.log(`  commit: ${task.commit}`)
  if (task.release) console.log(`  release: ${task.release}`)
  console.log(`  dates: créée ${task.createdAt}${task.completedAt ? ` · terminée ${task.completedAt}` : ''} · source ${task.source}`)
  for (const sub of task.subtasks) console.log(taskLine(sub, '    '))
}

const USAGE = `task.mjs — gestion de docs/tasks/ (source de vérité du backlog Roadmaped)

Usage : node scripts/task.mjs <commande> [arguments]
        (Node >= 22.18 ; sinon : npm run task --prefix dashboard -- <commande>)

Lecture
  list [--section <key>] [--status todo|in_progress|done] [--archive] [--json]
  show <id> [--json]        détail complet d'une tâche (id global, ex: 42)
  next [--json]             la prochaine tâche : 1ère todo DISPONIBLE (deps done)
                            de la section open la plus prioritaire (= "on enchaîne
                            sur la roadmap") — ne propose jamais une tâche verrouillée
  roadmap [--json]          vue par roadmap/jalon (docs/tasks/_roadmaps.yaml) :
                            progression + état de chaque tâche (done/disponible/verrouillé)
  validate                  valide tout docs/tasks/ (schéma + unicité des ids
                            + nextId, archive comprise) ; exit 1 si erreur

Écriture (id alloué depuis _meta.yaml ; validation après CHAQUE écriture, rollback si erreur)
  add --section <key> --title <t> [--detail <d>] [--tags a,b] [--size S|M|L]
      [--zone <z>] [--code <c>] [--refs a,b] [--links 1,2]
      [--depends-on 1,2] [--milestone <slug>] [--source ai|user] [--json]
  start <id>                status → in_progress
  done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>]
                            status → done + completedAt=aujourd'hui + doc de livraison
                            (--outcome : ce qui a été livré, en une phrase — le changelog)
  update <id> [--title] [--detail] [--status] [--tags] [--refs] [--links]
      [--size] [--zone] [--code] [--source] [--commit] [--outcome] [--verification] [--release]
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
  rejectUnknownFlags(flags, ['section', 'status', 'archive', 'json'])
  const tree = readTree(ROOT)
  let sections = flags.archive ? [...tree.sections, ...tree.archive] : tree.sections
  if (typeof flags.section === 'string') sections = sections.filter((s) => s.key === flags.section)
  if (typeof flags.status === 'string') {
    sections = sections
      .map((s) => ({ ...s, tasks: s.tasks.filter((t) => t.status === flags.status) }))
      .filter((s) => s.tasks.length > 0)
  }
  if (flags.json) {
    console.log(JSON.stringify({ nextId: tree.nextId, sections }, null, 2))
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
  const hit = findTask(readTree(ROOT), id)
  if (!hit) {
    console.error(`Aucune tâche #${id} (actives et archive confondues).`)
    process.exit(1)
  }
  if (flags.json) console.log(JSON.stringify(hit, null, 2))
  else printTask(hit)
}

function cmdNext(flags) {
  const tree = readTree(ROOT)
  const avail = computeAvailability(tree)
  const firstAvailableTodo = (tasks) => {
    for (const t of tasks) {
      if (t.status === 'todo' && avail.get(t.id) === 'available') return t
      const sub = firstAvailableTodo(t.subtasks)
      if (sub) return sub
    }
    return null
  }
  for (const s of tree.sections) {
    if (s.status !== 'open') continue
    const t = firstAvailableTodo(s.tasks)
    if (t) {
      if (flags.json) console.log(JSON.stringify({ task: t, sectionKey: s.key, archived: false }, null, 2))
      else printTask({ task: t, sectionKey: s.key, archived: false })
      return
    }
  }
  console.error('Aucune tâche todo disponible (les todo restantes sont verrouillées par des dépendances non terminées).')
  process.exit(1)
}

/** Traduit un MutationResult en sortie CLI (exit 1 si erreur). */
function report(res, successMessage) {
  if (!res.ok) {
    console.error('Échec :')
    for (const e of res.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  if (successMessage) console.log(successMessage)
  return res
}

function cmdAdd(flags) {
  rejectUnknownFlags(flags, [
    'section', 'title', 'detail', 'tags', 'size', 'zone', 'code', 'refs', 'links',
    'depends-on', 'milestone', 'source', 'json',
  ])
  requireFlags(flags, ['section', 'title'])
  const res = addTask(ROOT, {
    section: flags.section,
    title: flags.title,
    detail: typeof flags.detail === 'string' ? flags.detail : null,
    tags: typeof flags.tags === 'string' ? splitList(flags.tags) : [],
    size: typeof flags.size === 'string' ? flags.size : null,
    zone: typeof flags.zone === 'string' ? flags.zone : null,
    code: typeof flags.code === 'string' ? flags.code : null,
    refs: typeof flags.refs === 'string' ? splitList(flags.refs) : [],
    links: typeof flags.links === 'string' ? splitList(flags.links).map(Number) : [],
    dependsOn: typeof flags['depends-on'] === 'string' ? parseDeps(flags['depends-on']) : [],
    milestone: typeof flags.milestone === 'string' ? nullable(flags.milestone) : null,
    source: typeof flags.source === 'string' ? flags.source : 'ai',
  })
  report(res, flags.json ? null : `#${res.ok ? res.task?.id ?? '?' : ''} créée → ${res.ok ? res.task?.file ?? '?' : ''}`)
  if (flags.json && res.ok) console.log(JSON.stringify(res.task, null, 2))
}

function cmdStart(id) {
  report(startTask(ROOT, id), `#${id} démarrée (in_progress).`)
}

function cmdDone(id, flags) {
  rejectUnknownFlags(flags, ['commit', 'outcome', 'verification', 'release'])
  report(
    doneTask(ROOT, id, {
      commit: typeof flags.commit === 'string' ? flags.commit : undefined,
      outcome: typeof flags.outcome === 'string' ? flags.outcome : undefined,
      verification: typeof flags.verification === 'string' ? flags.verification : undefined,
      release: typeof flags.release === 'string' ? flags.release : undefined,
    }),
    `#${id} terminée (done).`,
  )
}

function cmdUpdate(id, flags) {
  const stringFields = ['title', 'detail', 'status', 'size', 'zone', 'code', 'source', 'commit', 'outcome', 'verification', 'release', 'completedAt']
  const listFields = ['tags', 'refs', 'links']
  rejectUnknownFlags(flags, [...stringFields, ...listFields, 'depends-on', 'milestone'])
  if (Object.keys(flags).length === 0) {
    console.error('update : aucun champ à modifier (voir --help).')
    process.exit(1)
  }
  const patch = {}
  for (const f of stringFields) if (typeof flags[f] === 'string') patch[f] = nullable(flags[f])
  for (const f of listFields) {
    if (typeof flags[f] === 'string') patch[f] = f === 'links' ? splitList(flags[f]).map(Number) : splitList(flags[f])
  }
  if (typeof flags['depends-on'] === 'string') patch.dependsOn = parseDeps(flags['depends-on'])
  if (typeof flags.milestone === 'string') patch.milestone = nullable(flags.milestone)
  report(updateTask(ROOT, id, patch), `#${id} mise à jour.`)
}

function cmdArchive(id) {
  report(archiveTask(ROOT, id), `#${id} archivée → docs/tasks/_archive/…`)
}

function cmdRoadmap(flags) {
  rejectUnknownFlags(flags, ['json'])
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
          id: t.id, title: t.title, state: avail.get(t.id) ?? 'available', missing: missingOf(t),
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
        console.log(`    ${tag} #${t.id} ${t.title}`)
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
  case 'next':
    cmdNext(flags)
    break
  case 'add':
    cmdAdd(flags)
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
