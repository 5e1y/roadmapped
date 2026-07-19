/*
 * Regroupement du feed Activity (#377) par JOUR local. `LiveEntry.at` n'est que
 * l'heure (HH:MM:SS) → le jour se dérive de `receivedAt` (epoch ms). Fonction
 * PURE, testée dans activityFeed.test.ts.
 *
 * Timezone : on prend le minuit LOCAL du jour calendaire (mêmes composantes que
 * roadmap.ts#localDayMs, mais depuis un epoch ms et non un ISO) — jamais un delta
 * fixe de 86.4M ms qui décale à la frontière de minuit locale et en DST. Le log
 * arrive déjà trié récent→ancien, donc les entrées d'un même jour sont contiguës :
 * un simple parcours suffit et préserve l'ordre.
 */

export interface ActivityDayGroup<E> {
  /** Minuit local du jour (epoch ms) — clé stable du groupe. */
  dayMs: number
  /** En-tête affichée : « Aujourd'hui » / « Hier » / date courte YYYY-MM-DD. */
  label: string
  entries: E[]
}

/** Minuit LOCAL du jour calendaire contenant `ms`. */
export function localMidnight(ms: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** En-tête d'un groupe : relatif (aujourd'hui / hier) sinon date courte. */
export function dayLabel(dayMs: number, nowMs: number): string {
  const today = localMidnight(nowMs)
  if (dayMs === today) return "Aujourd'hui"
  const t = new Date(today)
  const yesterday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1).getTime()
  if (dayMs === yesterday) return 'Hier'
  const d = new Date(dayMs)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Groupe des entrées (déjà triées récent→ancien) par jour LOCAL dérivé de
 * `receivedAt`. Générique : le test peut passer des objets minimaux.
 */
export function groupByDay<E extends { receivedAt: number }>(
  entries: E[],
  nowMs: number = Date.now(),
): ActivityDayGroup<E>[] {
  const groups: ActivityDayGroup<E>[] = []
  for (const entry of entries) {
    const dayMs = localMidnight(entry.receivedAt)
    const last = groups[groups.length - 1]
    if (last && last.dayMs === dayMs) {
      last.entries.push(entry)
    } else {
      groups.push({ dayMs, label: dayLabel(dayMs, nowMs), entries: [entry] })
    }
  }
  return groups
}
