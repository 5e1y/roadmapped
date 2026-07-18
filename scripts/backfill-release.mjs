#!/usr/bin/env node
// One-shot (#340) — backfill du champ `release` sur toutes les tâches DONE.
//
// Chronologie des releases = dates de publish npm (instants UTC faisant foi ;
// le CI publie sur bump de version). Bornes intervalle [début, début_suivant).
//
//   pre-release          completedAt < 1re release publiée
//   0.1.0  [2026-07-11T12:52:08Z, 2026-07-12T15:48:45Z)
//   0.2.0  [2026-07-12T15:48:45Z, 2026-07-13T15:57:55Z)
//   0.2.1  [2026-07-13T15:57:55Z, 2026-07-13T23:46:14Z)
//   0.2.2  [2026-07-13T23:46:14Z, 2026-07-14T00:17:16Z)
//   0.2.3  [2026-07-14T00:17:16Z, +inf)
//
// completedAt : les datetimes NUS (sans offset) sont en heure LOCALE CEST (+02:00)
// — vérifié en ancrant completedAt sur la date de commit +0200 de chaque tâche.
// Les valeurs date-seule (YYYY-MM-DD) sont interprétées à midi CEST (représentant
// neutre ; n'affecte que le bloc du 11/07, tranché pre-release, cohérent avec les
// commits résolus de ce bloc, tous en matinée avant le publish 0.1.0 à 14:52 CEST).
//
// Écriture via updateTask (taskWrites.ts) → passe par le lock + la validation.
// Ne touche QUE le champ release, QUE sur les tâches done. `validate` séparé après.

import { loadPaths } from '../src/lib/paths.ts'
import { readTree, updateTask } from '../src/lib/taskWrites.ts'

const { tasksDir } = loadPaths()

// Bornes de release en instants UTC (dates de publish npm).
const RELEASES = [
  { version: '0.1.0', at: Date.parse('2026-07-11T12:52:08.232Z') },
  { version: '0.2.0', at: Date.parse('2026-07-12T15:48:45.270Z') },
  { version: '0.2.1', at: Date.parse('2026-07-13T15:57:55.583Z') },
  { version: '0.2.2', at: Date.parse('2026-07-13T23:46:14.663Z') },
  { version: '0.2.3', at: Date.parse('2026-07-14T00:17:16.856Z') },
]
const FIRST = RELEASES[0].at

// completedAt → instant absolu (ms). CEST pour les nus, midi CEST pour date-seule.
function toInstant(completedAt) {
  const s = String(completedAt).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T12:00:00+02:00`)
  if (/T/.test(s) && !/[Z+]|-\d{2}:\d{2}$/.test(s)) return Date.parse(`${s}+02:00`)
  return Date.parse(s) // déjà offsetté (défensif)
}

function releaseFor(completedAt) {
  const t = toInstant(completedAt)
  if (Number.isNaN(t)) throw new Error(`completedAt illisible: ${completedAt}`)
  if (t < FIRST) return 'pre-release'
  let picked = RELEASES[0].version
  for (const r of RELEASES) {
    if (t >= r.at) picked = r.version
    else break
  }
  return picked
}

// Parcours de l'arbre : toutes les tâches done (top-level + sous-tâches).
const tree = readTree(tasksDir)
const done = []
const walk = (tasks) => {
  for (const t of tasks) {
    if (t.status === 'done') done.push(t)
    if (t.subtasks?.length) walk(t.subtasks)
  }
}
for (const s of tree.sections) walk(s.tasks)

const DRY = process.argv.includes('--dry')
const tally = {}
let written = 0, skipped = 0
const changes = []

for (const t of done) {
  if (t.completedAt == null) {
    console.error(`! #${t.id} done SANS completedAt — ignoré`)
    continue
  }
  const target = releaseFor(t.completedAt)
  tally[target] = (tally[target] || 0) + 1
  if (t.release === target) { skipped++; continue }
  changes.push({ id: t.id, from: t.release ?? 'null', to: target, completedAt: t.completedAt })
  if (!DRY) {
    const res = updateTask(tasksDir, t.id, { release: target })
    if (!res.ok) { console.error(`ERREUR #${t.id}:`, res.errors ?? res); process.exit(1) }
  }
  written++
}

console.log(`\n=== Répartition (${done.length} done) ===`)
for (const v of ['pre-release', '0.1.0', '0.2.0', '0.2.1', '0.2.2', '0.2.3'])
  console.log(`  ${String(tally[v] || 0).padStart(4)}  ${v}`)
console.log(`\n${DRY ? '[DRY] ' : ''}écrits: ${written} | déjà bons: ${skipped}`)
console.log('\nChangements de valeur non-null existante:')
for (const c of changes.filter((c) => c.from !== 'null'))
  console.log(`  #${c.id}  ${c.from}  ->  ${c.to}   (completedAt ${c.completedAt})`)
