#!/usr/bin/env node
// Migration JETABLE (#233, phase 1) — passe le backlog du modèle stage+team au
// modèle « jalons par TYPE ». Déplace chaque fichier docs/tasks/<NN-stage>/…
// vers docs/tasks/<NN-type>/… selon la table §4.3 du doc
// docs/specs/2026-07-09-jalons-par-type-brainstorm.md, SUPPRIME la ligne `team:`,
// crée les 9 _section.yaml canoniques, migre _archive/ en miroir (team CONSERVÉE
// dans l'archive — non re-validée) et écrit un rapport migration-report.txt.
//
// Déplacements par `git mv` (réversibles). _meta.yaml / ids / nextId / epics INTOUCHÉS.
// À exécuter UNE fois dans le worktree, puis à supprimer.
//
// Node ≥ 22.18 (strip-types natif pour l'import .ts de TYPES).

import { readdirSync, statSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import yaml from 'js-yaml'
import { TYPES } from '../src/lib/tasks.ts'

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

/** Retire la (les) ligne(s) `team:` d'un YAML texte, sans toucher au reste. */
function stripTeamLine(absPath) {
  const src = readFileSync(absPath, 'utf8')
  const out = src.replace(/^team:.*(\r?\n|$)/m, '')
  if (out !== src) writeFileSync(absPath, out, 'utf8')
}

const report = []
const counts = {}

// Les 9 dossiers-types doivent exister AVANT tout `git mv` (git mv ne crée pas
// le dossier de destination). Idem pour l'archive si elle existe.
for (const t of TYPES) execFileSync('mkdir', ['-p', join(ROOT, t.slug)])

/**
 * Migre les fichiers-tâches d'un ensemble de dossiers-sections vers les dossiers-types.
 * `stripTeam` : true pour l'actif (team supprimée), false pour l'archive (conservée).
 */
function migrateTree(base, { stripTeam }) {
  for (const oldSection of OLD_SECTIONS) {
    const dir = join(base, oldSection)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (!statSync(abs).isFile() || !isTaskFile(name)) continue
      const raw = yaml.load(readFileSync(abs, 'utf8'))
      if (!raw || typeof raw.id !== 'number') continue
      const { type, rule } = classify(raw.team, raw.tags ?? [])
      const destDir = join(base, DIR[type])
      const dest = join(destDir, name)
      gitmv(abs, dest)
      if (stripTeam) stripTeamLine(dest)
      const scope = base === ROOT ? '' : '[archive] '
      counts[type] = (counts[type] ?? 0) + 1
      report.push(
        `${scope}#${raw.id} ${oldSection}/${name} → ${DIR[type]}/${name}  [${rule}]  status=${raw.status} :: ${raw.title}`,
      )
    }
  }
}

// 1) Actif : team supprimée.
migrateTree(ROOT, { stripTeam: true })

// 2) Archive (miroir) : team CONSERVÉE (non re-validée). Absente ici, mais géré.
const archive = join(ROOT, '_archive')
if (existsSync(archive)) {
  for (const t of TYPES) execFileSync('mkdir', ['-p', join(archive, t.slug)])
  migrateTree(archive, { stripTeam: false })
}

// 3) Retirer les anciens _section.yaml + dossiers-sections vidés (actif ET archive).
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

// 4) Créer les 9 _section.yaml canoniques (actif uniquement — l'archive n'a pas de sections).
for (const t of TYPES) {
  const dir = join(ROOT, t.slug)
  execFileSync('mkdir', ['-p', dir])
  const meta = join(dir, '_section.yaml')
  writeFileSync(meta, yaml.dump({ title: t.title, status: 'open', baseHeat: t.baseHeat, note: t.note }, { lineWidth: 100, quotingType: '"' }), 'utf8')
  execFileSync('git', ['add', meta])
}

// 5) Rapport.
const header = [
  `Migration jalons par TYPE (#233) — ${new Date().toISOString()}`,
  `Fichiers migrés : ${report.length}`,
  'Par type : ' + TYPES.map((t) => `${t.slug}=${counts[t.slug.replace(/^\d+-/, '')] ?? 0}`).join(' · '),
  '',
]
writeFileSync('migration-report.txt', header.concat(report.sort()).join('\n') + '\n', 'utf8')
console.log(header.join('\n'))
console.log('rapport → migration-report.txt')
