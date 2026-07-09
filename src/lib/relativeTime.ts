// Format de date relatif partagé (#126) : « 3 days ago », « yesterday »… via
// Intl.RelativeTimeFormat (i18n natif, zéro pluriel fait main). Accepte un ISO
// (YYYY-MM-DD ou datetime local) ou un timestamp ms. La date absolue reste
// disponible via absoluteDate() pour le title/tooltip au survol.

// 'always' → toujours « X <unité> ago » (cohérent avec la demande), plutôt
// que « yesterday »/« last week » de 'auto'.
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' })

// Du plus grand au plus petit : on prend la première unité dont le seuil est atteint.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
]

function toMs(input: string | number): number {
  if (typeof input === 'number') return input
  // Les horodatages sont générés en HEURE LOCALE (taskWrites: `now()` = datetime
  // local, `today()` = date seule locale). `Date.parse` traite un datetime SANS
  // offset comme local (OK) mais une DATE SEULE « YYYY-MM-DD » comme UTC minuit —
  // d'où un décalage jusqu'à ±24 h sur `completedAt` (ex. « 22 hours ago » pour un
  // ticket bouclé aujourd'hui). On force l'interprétation locale en complétant une
  // date seule en datetime local (minuit).
  const s = /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00` : input
  return Date.parse(s)
}

/** « X time ago » en anglais. Renvoie l'entrée brute si non parsable. */
export function relativeTime(input: string | number, now: number = Date.now()): string {
  const then = toMs(input)
  if (Number.isNaN(then)) return String(input)
  const diffSec = Math.round((then - now) / 1000) // négatif = passé
  const abs = Math.abs(diffSec)
  if (abs < 60) return 'just now'
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return RTF.format(Math.round(diffSec / secs), unit)
  }
  return 'just now'
}

/** Date absolue lisible (en-US) pour le title au survol. */
export function absoluteDate(input: string | number): string {
  const ms = toMs(input)
  if (Number.isNaN(ms)) return String(input)
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
