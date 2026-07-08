// Rendu partagé du backlog (#90) — extrait de scripts/task.mjs pour être réutilisé par
// le CLI ET le serveur MCP (#91-92). Node-only (git/fs) : ne JAMAIS importer depuis le
// bundle navigateur du dashboard. Les fonctions pures (taskLine, refLine) sont testées
// directement ; l'I/O (git de fraîcheur, extraits de refs) est mince et best-effort.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { findTask } from './taskWrites.ts'
import { activeTasks, archivedTasks, nextQueue, globalProgress } from './roadmap.ts'
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
  const chips = [t.code, t.size, t.team, t.kind !== 'task' ? t.kind : null, ...t.tags].filter(Boolean).join(' ')
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
  if (t.kind !== 'task') meta.push(`kind: ${t.kind}`)
  if (t.epic) meta.push(`epic: ${t.epic}`)
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
 * le CLI et le serveur MCP le partagent. L'âge in_progress se compte depuis startedAt
 * (#82), avec fallback createdAt pour les tâches d'avant le champ.
 */
/**
 * Commits plus récents que la dernière livraison consignée (#101) — le signal de la
 * dérive « travail hors ticket ». Best-effort comme git() : null si pas de dépôt, rien
 * de consigné, ou sha disparu (rebase/amend) — jamais de bruit.
 */
/**
 * Dernière tâche consignée (commit + completedAt) — l'ancre du signal de dérive.
 * On saute toute ancre dont le sha n'EXISTE PAS dans CE dépôt (#143) : travail
 * livré dans un autre repo (ex. le site), commit rebasé/amendé disparu, ou valeur
 * parasite. Sans ce filtre, un sha étranger en tête coupait audit et « commits non
 * consignés » en silence. On descend la liste triée jusqu'au 1er sha résolvable.
 */
function lastLogged(tree: TaskTree): { commit: string; id: number } | null {
  const candidates = [...activeTasks(tree), ...archivedTasks(tree)]
    .filter((t) => t.commit && t.completedAt)
    // completedAt desc, id desc en bris d'égalité (dates au jour : les ids sont monotones)
    .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : b.completedAt! < a.completedAt! ? -1 : b.id - a.id))
  for (const t of candidates) {
    if (git(`rev-parse --verify --quiet ${t.commit}^{commit}`) !== null) return { commit: t.commit!, id: t.id }
  }
  return null
}

export interface UnloggedCommits { count: number; sinceId: number }
export function unloggedCommits(tree: TaskTree): UnloggedCommits | null {
  const last = lastLogged(tree)
  if (!last) return null
  const out = git(`rev-list --count ${last.commit}..HEAD`)
  const count = out === null ? NaN : Number(out)
  return Number.isInteger(count) ? { count, sinceId: last.id } : null
}

/**
 * Audit commit↔tâche (#104) — parse la convention `#id` du sujet de chaque commit depuis
 * la dernière tâche consignée. `orphan` = aucun `#id` ; `dangling` = `#id` inconnu du
 * backlog ; `ok` = lié. Best-effort comme git() : null hors dépôt / rien de consigné.
 * ponytail: match le PREMIER `#id` du sujet — un commit qui en cite deux, cas non couvert.
 */
export interface CommitAudit { sha: string; subject: string; ref: number | null; status: 'orphan' | 'dangling' | 'ok' }
export function auditCommits(tree: TaskTree): CommitAudit[] | null {
  const anchor = lastLogged(tree)
  const out = git(`log ${anchor ? `${anchor.commit}..HEAD` : 'HEAD'} --format=%h%x09%s`)
  if (out === null) return null
  if (out === '') return []
  const ids = new Set([...activeTasks(tree), ...archivedTasks(tree)].map((t) => t.id))
  return out.split('\n').map((line) => {
    const tab = line.indexOf('\t')
    const sha = line.slice(0, tab)
    const subject = line.slice(tab + 1)
    const m = subject.match(/#(\d+)/)
    const ref = m ? Number(m[1]) : null
    const status: CommitAudit['status'] = ref === null ? 'orphan' : ids.has(ref) ? 'ok' : 'dangling'
    return { sha, subject, ref, status }
  })
}

export function auditText(audit: CommitAudit[] | null): string {
  if (audit === null) return 'audit commit↔tâche — indisponible (hors dépôt git)'
  if (audit.length === 0) return 'audit commit↔tâche — aucun commit depuis la dernière tâche consignée ✔'
  const orphans = audit.filter((c) => c.status === 'orphan')
  const dangling = audit.filter((c) => c.status === 'dangling')
  const ok = audit.length - orphans.length - dangling.length
  const lines = [`audit commit↔tâche — ${audit.length} commit(s) · ✔ ${ok} lié(s) · ⚠ ${orphans.length} orphelin(s) · ⚠ ${dangling.length} référence(s) morte(s)`]
  for (const c of orphans) lines.push(`  orphelin  ${c.sha} ${c.subject}`)
  for (const c of dangling) lines.push(`  ref morte ${c.sha} ${c.subject}  (#${c.ref} inconnu)`)
  return lines.join('\n')
}

/**
 * Passe-partout « in_progress éternelle » (#105) : si AUCUNE in_progress fraîche ne couvre
 * le commit — toutes ≥ thresholdDays d'âge — retourne ces tâches anciennes (id/titre/âge)
 * pour alerte guard ; [] si une fraîche existe ou aucune in_progress.
 * Âge mesuré depuis startedAt (#82), fallback createdAt pour les tâches d'avant le champ.
 */
export function stalePassepartout(
  tree: TaskTree,
  todayIso: string,
  thresholdDays = 7,
): { id: number; title: string; ageDays: number }[] {
  const inProgress = activeTasks(tree).filter((t) => t.status === 'in_progress')
  if (inProgress.length === 0) return []
  const aged = inProgress.map((t) => ({
    id: t.id,
    title: t.title,
    ageDays: Math.floor((Date.parse(todayIso) - Date.parse((t.startedAt ?? t.createdAt).slice(0, 10))) / 86_400_000),
  }))
  return aged.some((a) => a.ageDays < thresholdDays) ? [] : aged
}

export function sitrepText(tree: TaskTree, errors: string[], unlogged?: UnloggedCommits | null): string {
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
  // Avancement global (#133) : le CLI/agent voit la progression sans ouvrir le dashboard.
  const prog = globalProgress(tree)
  const pct = prog.total === 0 ? 0 : Math.round((prog.done / prog.total) * 100)

  const lines = [
    `sitrep — ${today}`,
    `avancement: ${prog.done}/${prog.total} (${pct}%)`,
    `done aujourd'hui (${doneToday.length})${capped(doneToday, brief)}`,
    `in_progress (${inProgress.length})${capped(inProgress, (t) => `${brief(t)} (${daysBetween(dayOf(t.startedAt ?? t.createdAt), today)}j)`)}`,
    `prochaines: ${queue.length ? queue.map(brief).join(' · ') : '— (file vide)'}`,
    `validate: ${errors.length === 0 ? 'OK' : `${errors.length} erreur(s)`}`,
  ]
  const stale = inProgress.filter((t) => daysBetween(dayOf(t.startedAt ?? t.createdAt), today) >= 7)
  if (stale.length) lines.push(`⚠ ${stale.length} in_progress ancienne(s) (≥7j) : ${stale.map((t) => `#${t.id}`).join(' ')}`)
  const debt = active.filter((t) => t.status !== 'done' && t.tags.includes('debt'))
  if (debt.length) lines.push(`⚠ ${debt.length} dette(s) ouverte(s) (#debt) : ${debt.map((t) => `#${t.id}`).join(' ')}`)
  // Dérive hors ticket (#101) : muet si une in_progress existe — committer en cours de tâche est normal.
  if (unlogged && unlogged.count > 0 && inProgress.length === 0) {
    lines.push(`⚠ ${unlogged.count} commit(s) non consigné(s) depuis #${unlogged.sinceId} — chaque changement a son ticket (quick)`)
  }
  if (errors.length) lines.push('⚠ validate rouge — lance `validate`')
  return lines.join('\n')
}
