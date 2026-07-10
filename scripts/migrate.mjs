#!/usr/bin/env node
// `roadmapped migrate` (#248) — fait passer un backlog de l'ANCIEN modèle
// (8 stages + `team:` + `kind: quick`) au modèle « jalons par TYPE » (9 types).
// Idempotent : rejoué sur un repo déjà v2, il ne touche à rien et le dit.
//
// Ce qu'il fait, dans l'ordre :
//   1. Déplace chaque docs/tasks/<NN-stage>/… vers docs/tasks/<NN-type>/… en
//      classant par team+tags (table §4.3 du brainstorm jalons-par-type).
//   2. Retire les lignes `team:` et `kind: quick` (champs disparus du modèle).
//   3. Crée les 9 _section.yaml canoniques SI on a fait un vrai déplacement
//      (sinon on préserve ceux de l'hôte — baseHeat customisé compris).
//   4. Migre _archive/ en miroir (team/quick CONSERVÉS — jamais re-validés).
//   5. Revalide et écrit migration-report.txt.
//
// Déplacements par `git mv` (réversibles). _meta.yaml / ids / nextId / epics INTOUCHÉS.
// cwd = repo hôte (le proxy bin préserve le cwd). Node ≥ 22.18 (strip-types pour TYPES).

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { TYPES } from '../src/lib/tasks.ts'
import { detectLegacyModel } from '../src/lib/validate.ts'
import { loadFiles, validateAll } from '../src/lib/taskWrites.ts'

const ROOT = 'docs/tasks'
const OLD_SECTIONS = ['01-idea', '02-initial', '03-identity', '04-build', '05-gtm', '06-launch', '07-scale', '08-mature']

/** slug de type → dossier NN-type (source unique : TYPES). */
const DIR = Object.fromEntries(TYPES.map((t) => [t.slug.replace(/^\d+-/, ''), t.slug]))

/**
 * LE classement mécanique (table §4.3 + arbre §3.2, premier match gagne) :
 * la NATURE du livrable, dérivée de team + tags. Déterministe. Renvoie {type, rule}.
 */
function classify(team, tags) {
  const has = (t) => tags.includes(t)
  if (has('bug')) return { type: 'bug', rule: 'tag:bug→bug' }
  if (has('spec') || has('brainstorm')) return { type: 'brainstorm', rule: 'tag:spec/brainstorm→brainstorm' }
  if (team === 'design') return { type: 'design', rule: 'team:design→design' }
  if (team === 'legal') return { type: 'legal', rule: 'team:legal→legal' }
  if (team === 'sales' || team === 'finance') return { type: 'business', rule: `team:${team}→business` }
  if (team === 'marketing') {
    if (has('posts') || has('annonces') || has('annonce')) return { type: 'communication', rule: 'team:marketing+posts/annonces→communication' }
    return { type: 'marketing', rule: 'team:marketing→marketing' }
  }
  if (team === 'support') return { type: 'communication', rule: 'team:support→communication' }
  if (team === 'operations') return { type: 'chore', rule: 'team:operations→chore' }
  // engineering (et défaut) : raffinement par tags, sinon feature.
  for (const t of ['debt', 'refactor', 'process', 'cli', 'data-model']) {
    if (has(t)) return { type: 'chore', rule: `team:engineering+tag:${t}→chore` }
  }
  return { type: 'feature', rule: `team:${team || '∅'}→feature` }
}

const gitmv = (from, to) => execFileSync('git', ['mv', from, to])
const isTaskFile = (name) => name.endsWith('.yaml') && !name.startsWith('_')

/** Retire les lignes `team:` et `kind: quick` d'un YAML texte, sans toucher au reste. */
function stripLegacyFields(absPath) {
  const src = readFileSync(absPath, 'utf8')
  const out = src
    .replace(/^team:.*(\r?\n|$)/m, '')
    .replace(/^kind:\s*quick\s*(\r?\n|$)/m, '')
  if (out !== src) writeFileSync(absPath, out, 'utf8')
}

// --- Idempotence : si rien n'est à migrer, on sort proprement. detectLegacyModel
// couvre les trois signaux (vieux dossiers, team:, kind: quick) sur l'actif.
const legacy = detectLegacyModel(loadFiles(ROOT))
if (!legacy) {
  console.log('roadmapped migrate: ce backlog est déjà au modèle « jalons par type » — rien à migrer.')
  process.exit(0)
}

const report = []
const counts = {}

// A-t-on de VRAIS déplacements à faire (vieux dossiers présents avec des tâches) ?
const hasOldFolders = OLD_SECTIONS.some((s) => {
  const d = join(ROOT, s)
  return existsSync(d) && statSync(d).isDirectory() && readdirSync(d).some(isTaskFile)
})

// Les 9 dossiers-types doivent exister AVANT tout `git mv`.
for (const t of TYPES) execFileSync('mkdir', ['-p', join(ROOT, t.slug)])

/**
 * Déplace les fichiers-tâches d'un ensemble de dossiers-stages vers les dossiers-types.
 * `stripFields` : true pour l'actif, false pour l'archive (conservée, non re-validée).
 */
function migrateTree(base, { stripFields }) {
  for (const oldSection of OLD_SECTIONS) {
    const dir = join(base, oldSection)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (!statSync(abs).isFile() || !isTaskFile(name)) continue
      const raw = yaml.load(readFileSync(abs, 'utf8'))
      if (!raw || typeof raw.id !== 'number') continue
      const { type, rule } = classify(raw.team, raw.tags ?? [])
      const dest = join(base, DIR[type], name)
      gitmv(abs, dest)
      if (stripFields) stripLegacyFields(dest)
      const scope = base === ROOT ? '' : '[archive] '
      counts[type] = (counts[type] ?? 0) + 1
      report.push(`${scope}#${raw.id} ${oldSection}/${name} → ${DIR[type]}/${name}  [${rule}]  status=${raw.status} :: ${raw.title}`)
    }
  }
}

/** Retire team:/kind: quick des fichiers DÉJÀ dans les dossiers-types (cas « v2 mais champs résiduels »). */
function stripInPlace(base) {
  for (const t of TYPES) {
    const dir = join(base, t.slug)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      if (!isTaskFile(name)) continue
      const abs = join(dir, name)
      const before = readFileSync(abs, 'utf8')
      stripLegacyFields(abs)
      if (readFileSync(abs, 'utf8') !== before) report.push(`#? ${t.slug}/${name} : team:/kind: quick retiré (en place)`)
    }
  }
}

// 1) Actif.
if (hasOldFolders) migrateTree(ROOT, { stripFields: true })
stripInPlace(ROOT)

// 2) Archive (miroir) : champs CONSERVÉS.
const archive = join(ROOT, '_archive')
if (existsSync(archive) && hasOldFolders) {
  for (const t of TYPES) execFileSync('mkdir', ['-p', join(archive, t.slug)])
  migrateTree(archive, { stripFields: false })
}

// 3) Retirer les anciens _section.yaml + dossiers-stages vidés (actif ET archive).
if (hasOldFolders) {
  for (const base of [ROOT, ...(existsSync(archive) ? [archive] : [])]) {
    for (const oldSection of OLD_SECTIONS) {
      const dir = join(base, oldSection)
      if (!existsSync(dir)) continue
      const remaining = readdirSync(dir).filter((n) => n !== '_section.yaml' && n !== '.lock')
      if (remaining.length > 0) {
        console.error(`⚠ ${dir} n'est pas vide après migration : ${remaining.join(', ')}`)
        continue
      }
      const meta = join(dir, '_section.yaml')
      if (existsSync(meta)) execFileSync('git', ['rm', '-q', meta])
      rmSync(dir, { recursive: true, force: true })
    }
  }
  // 4) Créer les 9 _section.yaml canoniques (uniquement quand on a vraiment migré ;
  //    sinon on PRÉSERVE ceux de l'hôte, baseHeat customisé compris).
  for (const t of TYPES) {
    const meta = join(ROOT, t.slug, '_section.yaml')
    if (existsSync(meta)) continue
    writeFileSync(meta, yaml.dump({ title: t.title, status: 'open', baseHeat: t.baseHeat, note: t.note }, { lineWidth: 100, quotingType: '"' }), 'utf8')
    execFileSync('git', ['add', meta])
  }
}

// 5) Revalider + rapport.
const errors = validateAll(loadFiles(ROOT))
const header = [
  `Migration jalons par TYPE (#248) — ${new Date().toISOString()}`,
  `Fichiers migrés : ${report.length}`,
  'Par type : ' + TYPES.map((t) => `${t.slug}=${counts[t.slug.replace(/^\d+-/, '')] ?? 0}`).join(' · '),
  '',
]
writeFileSync('migration-report.txt', header.concat(report.sort()).join('\n') + '\n', 'utf8')
console.log(header.join('\n'))
console.log('rapport → migration-report.txt')
if (errors.length > 0) {
  console.error(`\n⚠ ${errors.length} erreur(s) de validation APRÈS migration — à corriger à la main :`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log('\n✓ Backlog migré et validé. Relis migration-report.txt puis commit.')
