#!/usr/bin/env node
// One-shot (#350) — retrait des champs décoratifs `size` (S/M/L) et `code` de tous
// les YAML de docs/tasks/. Décision Rémi : les deux champs sont purement décoratifs,
// AUCUNE logique ne les lisait (ni température, ni availability). Ils ont été retirés
// du modèle (tasks.ts / validate.ts) et de FIELD_ORDER (taskWrites.ts) ; ce script
// nettoie les fichiers existants qui les portent encore.
//
// Mécanique : réécriture via le SÉRIALISEUR CANONIQUE (dumpTask de taskWrites.ts),
// PAS de sed. dumpTask n'écrit que les clés de FIELD_ORDER ; size/code en étant
// absents, ils disparaissent naturellement du fichier (même migration que
// milestone→epic). On NE passe PAS par updateTask : inutile de bumper `updatedAt`
// sur (quasiment) tout le backlog pour un simple retrait de champ décoratif — la
// réécriture directe préserve updatedAt tel quel.
//
// Idempotent : seuls les fichiers qui portent ENCORE une clé `size`/`code` sont
// réécrits ; un backlog déjà propre = 0 écriture. Rétrocompat lecture assurée en
// amont (toTaskNode ignore les clés inconnues) : ce script n'est qu'un nettoyage.
//
// ATTENTION worktree : exécute la migration DANS le worktree où il tourne (loadPaths
// résout le tasksDir de l'hôte courant). L'orchestrateur la relancera dans main à
// l'intégration si docs/tasks a bougé.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'
import { loadPaths } from '../src/lib/paths.ts'
import { dumpTask, withLock } from '../src/lib/taskWrites.ts'

const { tasksDir } = loadPaths()
const DRY = process.argv.includes('--dry')

const META = new Set(['_meta.yaml', '_section.yaml', '_epics.yaml', '_roadmaps.yaml'])

/** Tous les fichiers de tâche (*.yaml hors méta) sous tasksDir, récursif. */
function taskFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === '.lock') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...taskFiles(full))
    else if (entry.endsWith('.yaml') && !META.has(entry)) out.push(full)
  }
  return out
}

function run() {
  const files = taskFiles(tasksDir)
  let rewritten = 0
  let skipped = 0
  const touched = []

  for (const abs of files) {
    const prev = readFileSync(abs, 'utf8')
    const raw = yaml.load(prev)
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'number') { skipped++; continue }
    // Seuls les fichiers portant ENCORE size/code sont concernés (idempotence).
    if (!('size' in raw) && !('code' in raw)) { skipped++; continue }
    // Réécriture canonique : dumpTask laisse tomber size/code (absents de FIELD_ORDER).
    const next = dumpTask(raw)
    if (next === prev) { skipped++; continue }
    touched.push(abs.replace(`${tasksDir}/`, ''))
    if (!DRY) writeFileSync(abs, next, 'utf8')
    rewritten++
  }

  console.log(`\n=== strip-size-code (#350) ===`)
  console.log(`fichiers scannés : ${files.length}`)
  console.log(`${DRY ? '[DRY] ' : ''}réécrits (size/code retirés) : ${rewritten} | inchangés : ${skipped}`)
  for (const f of touched) console.log(`  ~ ${f}`)
}

// Verrou de mutation (#83) — cohérent avec les autres écrivains, même si un one-shot
// tourne seul. En DRY on ne prend pas le verrou (lecture pure).
if (DRY) run()
else withLock(tasksDir, run)
