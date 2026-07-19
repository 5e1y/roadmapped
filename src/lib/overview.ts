import type { TaskTree, TaskNode } from './tasks'
import { activeTasks, temperature, localDayMs } from './roadmap'

// ── Helpers Overview (#374, ticket 3 de la spec 2026-07-19-overview-activity-ux) ──
//
// Fonctions PURES alimentant l'écran Overview (#375/#376). Un fichier dédié plutôt
// que d'alourdir roadmap.ts (déjà ~320 l.). Rien ici ne recompute la priorité : le
// tri d'urgence CONSOMME `temperature()` (source unique du calcul de chaleur, #234) ;
// le parsing de date CONSOMME `localDayMs()` (parse LOCAL, source unique #232/#363).
//
// CHOIX « ouverts vs tous » (documenté) : les trois sélecteurs top-N ne portent que
// sur les tickets OUVERTS (status !== 'done'), sous-tâches comprises. La spec cadre
// ces vues comme « tickets actionnables » (les 5 plus urgents / anciens / récents) —
// un ticket done n'est plus actionnable, donc exclu. Le chart créés-vs-fermés, lui,
// regarde TOUT (créations = tous les tickets ; fermetures = les done) : c'est une
// mesure de flux, pas une liste d'actions.

/** Les tickets ouverts du backlog (status ≠ 'done'), à plat, sous-tâches comprises. */
function openTasks(tree: TaskTree): TaskNode[] {
  return activeTasks(tree).filter((t) => t.status !== 'done')
}

/**
 * Les N tickets ouverts les plus URGENTS — température décroissante, puis id
 * croissant (tie-break : le plus ancien d'abord). MÊME ordre canonique que
 * `nextQueue` (#234), mais appliqué à l'ensemble des ouverts (pas seulement les
 * `available`). NE réimplémente PAS le calcul de température : il consomme
 * `temperature()` comme clé de tri. Renvoie au plus N TaskNode.
 */
export function mostUrgent(tree: TaskTree, n: number, today?: string): TaskNode[] {
  return openTasks(tree)
    .map((task) => ({ task, temp: temperature(tree, task, today).value }))
    .sort((a, b) => b.temp - a.temp || a.task.id - b.task.id)
    .slice(0, Math.max(0, n))
    .map((x) => x.task)
}

/**
 * Les N tickets ouverts les plus ANCIENS — createdAt croissant, fallback id
 * croissant (dates égales/absentes). Parse LOCAL via `localDayMs`. Au plus N.
 */
export function oldest(tree: TaskTree, n: number): TaskNode[] {
  return openTasks(tree)
    .slice()
    .sort((a, b) => localDayMs(a.createdAt) - localDayMs(b.createdAt) || a.id - b.id)
    .slice(0, Math.max(0, n))
}

/**
 * Les N tickets ouverts les plus RÉCEMMENT AJOUTÉS — createdAt décroissant,
 * fallback id décroissant (dates égales/absentes). Parse LOCAL. Au plus N.
 */
export function recentlyAdded(tree: TaskTree, n: number): TaskNode[] {
  return openTasks(tree)
    .slice()
    .sort((a, b) => localDayMs(b.createdAt) - localDayMs(a.createdAt) || b.id - a.id)
    .slice(0, Math.max(0, n))
}

// ── Créés vs fermés par semaine ISO ───────────────────────────────────────────

export interface WeekBucket {
  /** Lundi ISO de la semaine, "YYYY-MM-DD" (local). */
  weekStart: string
  /** Tickets dont createdAt tombe dans la semaine. */
  created: number
  /** Tickets done dont completedAt tombe dans la semaine. */
  closed: number
}

export interface DayBucket {
  /** Jour "YYYY-MM-DD" (local). */
  day: string
  created: number
  closed: number
}

/** Minuit LOCAL du jour calendaire de `iso` (pas de décalage semaine). */
function localDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Lundi ISO (00:00 local) de la semaine contenant la date nue de `iso`. */
function isoMonday(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1) // minuit LOCAL du jour calendaire
  const dow = dt.getDay() // 0 = dimanche … 6 = samedi
  // Recule jusqu'au lundi : dimanche (0) → -6, sinon 1 - dow.
  dt.setDate(dt.getDate() + (dow === 0 ? -6 : 1 - dow))
  return dt
}

/** Une Date locale → "YYYY-MM-DD". */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Flux créés-vs-fermés par SEMAINE ISO (lundi → dimanche), ordonné chronologiquement.
 * - `created` bucketise createdAt de TOUS les tickets ; `closed` bucketise
 *   completedAt des tickets done (completedAt null ignoré).
 * - Les semaines VIDES entre la première et la dernière semaine active sont
 *   COMBLÉES (created:0, closed:0) — pas de trou dans la série.
 * - Parsing LOCAL (via `isoMonday`, qui slice la date nue et construit
 *   `new Date(y, m, d)`) : une date sans offset ne bascule JAMAIS de semaine à la
 *   frontière minuit/dimanche, contrairement à `new Date("YYYY-MM-DD")` (UTC).
 * Tableau vide si aucun ticket.
 */
export function createdVsClosedByWeek(tree: TaskTree): WeekBucket[] {
  const tasks = activeTasks(tree)
  const created = new Map<string, number>()
  const closed = new Map<string, number>()
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

  for (const t of tasks) {
    if (t.createdAt) bump(created, ymd(isoMonday(t.createdAt)))
    if (t.status === 'done' && t.completedAt) bump(closed, ymd(isoMonday(t.completedAt)))
  }

  const weeks = [...new Set([...created.keys(), ...closed.keys()])].sort()
  if (weeks.length === 0) return []

  // Comble les semaines vides : itère de lundi en lundi (+7 j, arithmétique LOCALE).
  const out: WeekBucket[] = []
  const cursor = isoMonday(weeks[0])
  const last = weeks[weeks.length - 1]
  let guard = 0
  while (guard++ < 100_000) {
    const key = ymd(cursor)
    out.push({ weekStart: key, created: created.get(key) ?? 0, closed: closed.get(key) ?? 0 })
    if (key === last) break
    cursor.setDate(cursor.getDate() + 7)
  }
  return out
}

/**
 * Créés vs fermés par JOUR (#376) — pour le graphe en aires de l'Overview, qui a
 * besoin de densité (l'hebdo ne donne que ~3 points). Jours vides comblés entre
 * le 1er et le dernier. Parse LOCAL des dates nues (piège UTC #232/#363).
 */
export function createdVsClosedByDay(tree: TaskTree): DayBucket[] {
  const tasks = activeTasks(tree)
  const created = new Map<string, number>()
  const closed = new Map<string, number>()
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1)

  for (const t of tasks) {
    if (t.createdAt) bump(created, ymd(localDay(t.createdAt)))
    if (t.status === 'done' && t.completedAt) bump(closed, ymd(localDay(t.completedAt)))
  }

  const days = [...new Set([...created.keys(), ...closed.keys()])].sort()
  if (days.length === 0) return []

  const out: DayBucket[] = []
  const cursor = localDay(days[0])
  const last = days[days.length - 1]
  let guard = 0
  while (guard++ < 100_000) {
    const key = ymd(cursor)
    out.push({ day: key, created: created.get(key) ?? 0, closed: closed.get(key) ?? 0 })
    if (key === last) break
    cursor.setDate(cursor.getDate() + 1) // +1 jour, arithmétique LOCALE
  }
  return out
}
