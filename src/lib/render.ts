// Rendu partagé du backlog (#90) — extrait de scripts/task.mjs pour être réutilisé par
// le CLI ET le serveur MCP (#91-92). Node-only (git/fs) : ne JAMAIS importer depuis le
// bundle navigateur du dashboard. Les fonctions pures (taskLine, refLine) sont testées
// directement ; l'I/O (git de fraîcheur, extraits de refs) est mince et best-effort.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { findTask } from './taskWrites.ts'
import { activeTasks, archivedTasks, nextQueue } from './roadmap.ts'
import { parseRef, locateLine, snippet } from './refExtract.ts'
import type { TaskTree, TaskNode } from './tasks'
import type { FoundTask } from './taskWrites'

export const GLYPH: Record<string, string> = { todo: '[ ]', in_progress: '[~]', done: '[x]' }
export const STATUS_FR: Record<string, string> = { todo: 'à faire', in_progress: 'en cours', done: 'faite' }

/** git best-effort : hors dépôt ou commande en échec → null (jamais d'exception/bruit). */
export function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export function taskLine(t: TaskNode, indent = '  '): string {
  const chips = [t.code, t.size, t.team, t.kind === 'quick' ? 'quick' : null, ...t.tags].filter(Boolean).join(' ')
  return `${indent}${GLYPH[t.status]} #${String(t.id).padEnd(4)}${t.title}${chips ? `  (${chips})` : ''}`
}

/** Lien titré « #id titre (statut) » — l'app porte le contexte, l'agent ne navigue plus. */
export function refLine(tree: TaskTree, id: number): string {
  const hit = findTask(tree, id)
  if (!hit) return `#${id} (inconnu)`
  const st = STATUS_FR[hit.task.status] ?? hit.task.status
  return `#${id} ${hit.task.title} (${hit.archived ? `${st}, archivée` : st})`
}

/**
 * Rend UNE ref dans le brief (#69) : drapeau de fraîcheur pour toute ref dont le
 * fichier a été commité après createdAt, et — si la ref est ancrée (fichier#symbole
 * ou fichier:ligne) — l'extrait ~10 lignes lu AU SERVE (toujours le code actuel).
 */
export function renderRef(ref: string, createdAt: string): string {
  const { path, anchor } = parseRef(ref)
  const exists = existsSync(path)
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
 * agent »). Zéro navigation : deps/liées/sous-tâches titrées, refs + extraits/fraîcheur,
 * rappel done en pied (verification omise pour un quick).
 */
export function briefText(tree: TaskTree, hit: FoundTask): string {
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

export const todayStr = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysBetween = (isoA: string, isoB: string) =>
  Math.round((Date.parse(isoB) - Date.parse(isoA)) / 86_400_000)

/**
 * L'état du monde en ≤30 lignes (#70). Pur (tree + erreurs de validation en entrée) :
 * le CLI et le serveur MCP le partagent. L'âge in_progress se compte depuis createdAt
 * (proxy — pas de startedAt, cf. dette #82).
 */
export function sitrepText(tree: TaskTree, errors: string[]): string {
  const active = activeTasks(tree)
  const today = todayStr()
  const brief = (t: TaskNode) => `#${t.id} ${t.title}`
  const capped = (items: TaskNode[], render: (t: TaskNode) => string, n = 8) => {
    if (items.length === 0) return ''
    const shown = items.slice(0, n).map(render).join(' · ')
    return `: ${shown}${items.length > n ? ` (+${items.length - n} autres)` : ''}`
  }
  const dayOf = (iso: string) => iso.slice(0, 10) // datetime → date pour l'âge
  const doneToday = [...active, ...archivedTasks(tree)].filter((t) => t.completedAt && dayOf(t.completedAt) === today)
  const inProgress = active.filter((t) => t.status === 'in_progress')
  const queue = nextQueue(tree).slice(0, 3)

  const lines = [
    `sitrep — ${today}`,
    `done aujourd'hui (${doneToday.length})${capped(doneToday, brief)}`,
    `in_progress (${inProgress.length})${capped(inProgress, (t) => `${brief(t)} (${daysBetween(dayOf(t.createdAt), today)}j)`)}`,
    `prochaines: ${queue.length ? queue.map(brief).join(' · ') : '— (file vide)'}`,
    `validate: ${errors.length === 0 ? 'OK' : `${errors.length} erreur(s)`}`,
  ]
  const stale = inProgress.filter((t) => daysBetween(dayOf(t.createdAt), today) >= 7)
  if (stale.length) lines.push(`⚠ ${stale.length} in_progress ancienne(s) (≥7j) : ${stale.map((t) => `#${t.id}`).join(' ')}`)
  const debt = active.filter((t) => t.status !== 'done' && t.tags.includes('debt'))
  if (debt.length) lines.push(`⚠ ${debt.length} dette(s) ouverte(s) (#debt) : ${debt.map((t) => `#${t.id}`).join(' ')}`)
  if (errors.length) lines.push('⚠ validate rouge — lance `validate`')
  return lines.join('\n')
}
