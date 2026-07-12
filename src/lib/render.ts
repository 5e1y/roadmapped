// Rendu partagé du backlog (#90) — extrait de scripts/task.mjs pour être réutilisé par
// le CLI ET le serveur MCP (#91-92). Node-only (git/fs) : ne JAMAIS importer depuis le
// bundle navigateur du dashboard. Les fonctions pures (taskLine, refLine) sont testées
// directement ; l'I/O (git de fraîcheur, extraits de refs) est mince et best-effort.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { findTask } from './taskWrites.ts'
import { activeTasks, nextQueue, globalProgress } from './roadmap.ts'
import { parseRef, locateLine, snippet } from './refExtract.ts'
import type { TaskTree, TaskNode } from './tasks'
import type { FoundTask } from './taskWrites'

export const GLYPH: Record<string, string> = { todo: '[ ]', in_progress: '[~]', done: '[x]' }
export const STATUS_LABEL: Record<string, string> = { todo: 'todo', in_progress: 'in progress', done: 'done' }

/** git best-effort : hors dépôt ou commande en échec → null (jamais d'exception/bruit). */
export function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export function taskLine(t: TaskNode, indent = '  '): string {
  const heatChip = typeof t.heat === 'number' && t.heat > 0 ? `heat ${t.heat}` : null
  const chips = [t.code, t.size, heatChip, t.kind !== 'task' ? t.kind : null, ...t.tags].filter(Boolean).join(' ')
  return `${indent}${GLYPH[t.status]} #${String(t.id).padEnd(4)}${t.title}${chips ? `  (${chips})` : ''}`
}

/** Lien titré « #id titre (statut) » — l'app porte le contexte, l'agent ne navigue plus. */
export function refLine(tree: TaskTree, id: number): string {
  const hit = findTask(tree, id)
  if (!hit) return `#${id} (unknown)`
  const st = STATUS_LABEL[hit.task.status] ?? hit.task.status
  return `#${id} ${hit.task.title} (${st})`
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
  const flag = lastCommit && lastCommit > createdAt ? ' ⚠ modified since the ticket was created' : ''
  const head = `  ${ref}${flag}`
  if (!anchor || !exists) return head
  const line = locateLine(readFileSync(path, 'utf8'), anchor)
  if (line === null) {
    const what = anchor.kind === 'symbol' ? `symbol "${anchor.value}"` : `line ${anchor.value}`
    return `${head}\n    ⚠ anchor not found (${what}) — read the file`
  }
  const snip = snippet(readFileSync(path, 'utf8'), line).split('\n').map((l) => `    ${l}`).join('\n')
  return `${head}\n${snip}`
}

/**
 * LE contexte d'exécution complet et dense d'une tâche (équivalent CLI du « brief
 * agent »). Zéro navigation : deps/liées/sous-tâches titrées, refs + extraits/fraîcheur,
 * rappel done en pied.
 *
 * `kb` (#325) : la section « Knowledge base » pré-rendue (kbCycle.kbBriefSection) —
 * voisinage du graphe embarqué D'OFFICE dans take/brief, ou la ligne discrète
 * « graph not generated ». Optionnelle : absente, la sortie est inchangée.
 */
export function briefText(tree: TaskTree, hit: FoundTask, kb?: string | null): string {
  const t = hit.task
  const out = [`#${t.id} ${t.title}`]
  const meta = [`type: ${hit.sectionKey}`]
  if (typeof t.heat === 'number' && t.heat > 0) meta.push(`heat: ${t.heat}`)
  if (t.kind !== 'task') meta.push(`kind: ${t.kind}`)
  if (t.epic) meta.push(`epic: ${t.epic}`)
  if (t.size) meta.push(`size: ${t.size}`)
  if (t.tags.length) meta.push(`tags: ${t.tags.join(', ')}`)
  out.push(meta.join(' · '))
  if (t.detail) out.push(`detail: ${t.detail.trim()}`)
  if (t.refs.length) { out.push('refs:'); for (const r of t.refs) out.push(renderRef(r, t.createdAt)) }
  if (t.dependsOn.length) { out.push('depends on:'); for (const d of t.dependsOn) out.push(`  ${refLine(tree, d)}`) }
  if (t.links.length) { out.push('linked:'); for (const l of t.links) out.push(`  ${refLine(tree, l)}`) }
  if (t.subtasks.length) { out.push('subtasks:'); for (const s of t.subtasks) out.push(`  ${refLine(tree, s.id)}`) }
  if (kb) out.push(kb)
  out.push(`done ${t.id} --commit <sha> --outcome "…" --verification "…"`)
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
  const candidates = activeTasks(tree)
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
  const ids = new Set(activeTasks(tree).map((t) => t.id))
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
  if (audit === null) return 'commit↔task audit — unavailable (not a git repo)'
  if (audit.length === 0) return 'commit↔task audit — no commits since the last logged task ✔'
  const orphans = audit.filter((c) => c.status === 'orphan')
  const dangling = audit.filter((c) => c.status === 'dangling')
  const ok = audit.length - orphans.length - dangling.length
  const lines = [`commit↔task audit — ${audit.length} commit(s) · ✔ ${ok} linked · ⚠ ${orphans.length} orphan(s) · ⚠ ${dangling.length} dead reference(s)`]
  for (const c of orphans) lines.push(`  orphan    ${c.sha} ${c.subject}`)
  for (const c of dangling) lines.push(`  dead ref  ${c.sha} ${c.subject}  (#${c.ref} unknown)`)
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

/** `kb` (#325) : la ligne d'état du knowledge graph pré-rendue (kbCycle.kbSitrepLine)
 *  — sitrep est injecté à CHAQUE SessionStart : c'est le marqueur systémique de
 *  1ʳᵉ génération / staleness du graphe. Optionnelle : absente, sortie inchangée. */
export function sitrepText(tree: TaskTree, errors: string[], unlogged?: UnloggedCommits | null, kb?: string | null): string {
  const active = activeTasks(tree)
  const today = todayStr()
  const brief = (t: TaskNode) => `#${t.id} ${t.title}`
  const capped = (items: TaskNode[], render: (t: TaskNode) => string, n = 8) => {
    if (items.length === 0) return ''
    const shown = items.slice(0, n).map(render).join(' · ')
    return `: ${shown}${items.length > n ? ` (+${items.length - n} more)` : ''}`
  }
  const dayOf = (iso: string) => iso.slice(0, 10) // datetime → date pour l'âge
  const doneToday = active.filter((t) => t.completedAt && dayOf(t.completedAt) === today)
  const inProgress = active.filter((t) => t.status === 'in_progress')
  const queue = nextQueue(tree).slice(0, 3)
  // Avancement global (#133) : le CLI/agent voit la progression sans ouvrir le dashboard.
  const prog = globalProgress(tree)
  const pct = prog.total === 0 ? 0 : Math.round((prog.done / prog.total) * 100)

  const lines = [
    `sitrep — ${today}`,
    `progress: ${prog.done}/${prog.total} (${pct}%)`,
    `done today (${doneToday.length})${capped(doneToday, brief)}`,
    `in_progress (${inProgress.length})${capped(inProgress, (t) => `${brief(t)} (${daysBetween(dayOf(t.startedAt ?? t.createdAt), today)}d)`)}`,
    `next: ${queue.length ? queue.map(brief).join(' · ') : '— (queue empty)'}`,
    `validate: ${errors.length === 0 ? 'OK' : `${errors.length} error(s)`}`,
  ]
  if (kb) lines.push(kb)
  const stale = inProgress.filter((t) => daysBetween(dayOf(t.startedAt ?? t.createdAt), today) >= 7)
  if (stale.length) lines.push(`⚠ ${stale.length} stale in_progress (≥7d): ${stale.map((t) => `#${t.id}`).join(' ')}`)
  const debt = active.filter((t) => t.status !== 'done' && t.tags.includes('debt'))
  if (debt.length) lines.push(`⚠ ${debt.length} open debt item(s) (#debt): ${debt.map((t) => `#${t.id}`).join(' ')}`)
  // Feedback mode (#149) : une tâche done avec des retours non résolus attend une
  // décision — même périmètre → rouvrir ; nouveau → un quick.
  const openFb = active.filter((t) => t.status === 'done' && (t.feedback ?? []).some((f) => !f.resolved))
  if (openFb.length) lines.push(`⚠ ${openFb.length} done task(s) with open feedback: ${openFb.map((t) => `#${t.id}`).join(' ')} — same scope → reopen; new → quick`)
  // Dérive hors ticket (#101) : muet si une in_progress existe — committer en cours de tâche est normal.
  if (unlogged && unlogged.count > 0 && inProgress.length === 0) {
    lines.push(`⚠ ${unlogged.count} unlogged commit(s) since #${unlogged.sinceId} — every change gets its ticket (quick)`)
  }
  if (errors.length) lines.push('⚠ validate failing — run `validate`')
  return lines.join('\n')
}
