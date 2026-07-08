// Format de date relatif partagé (#126) : « il y a 3 jours », « hier »… via
// Intl.RelativeTimeFormat (i18n natif, zéro pluriel fait main). Accepte un ISO
// (YYYY-MM-DD ou datetime local) ou un timestamp ms. La date absolue reste
// disponible via absoluteDate() pour le title/tooltip au survol.

// 'always' → toujours « il y a X <unité> » (cohérent avec la demande), plutôt
// que « hier »/« la semaine dernière » de 'auto'.
const RTF = new Intl.RelativeTimeFormat('fr', { numeric: 'always' })

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
  return typeof input === 'number' ? input : Date.parse(input)
}

/** « il y a X temps » en français. Renvoie l'entrée brute si non parsable. */
export function relativeTime(input: string | number, now: number = Date.now()): string {
  const then = toMs(input)
  if (Number.isNaN(then)) return String(input)
  const diffSec = Math.round((then - now) / 1000) // négatif = passé
  const abs = Math.abs(diffSec)
  if (abs < 60) return "à l'instant"
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return RTF.format(Math.round(diffSec / secs), unit)
  }
  return "à l'instant"
}

/** Date absolue lisible (fr-FR) pour le title au survol. */
export function absoluteDate(input: string | number): string {
  const ms = toMs(input)
  if (Number.isNaN(ms)) return String(input)
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
