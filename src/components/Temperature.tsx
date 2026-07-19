import type { TaskNode, Temperature } from '../lib/tasks'

/**
 * Affichage de la TEMPÉRATURE (#235, phase 3 — décisions Rémi) : un petit
 * thermomètre SVG maison + la valeur (« 48,7° »). La couleur froid→chaud est
 * CONFINÉE au mercure de l'icône — c'est LA seule exception à la doctrine
 * monochrome (design.md §1), décidée par Rémi ; tout le reste du badge est
 * en encre DS (neutral-500, mono). Trinil n'a pas d'icône thermomètre.
 */


/**
 * Couleur du mercure : rampe froid→chaud façon « coolwarm » — bleu acier (0°)
 * → gris neutre (~50°, un tiède qui reste dans le registre monochrome du DS)
 * → orange brûlé (100°). Interpolation RGB par morceaux : pas de passage par
 * le vert d'une rampe de teinte naïve.
 */
export function tempColor(value: number): string {
  const stops: Array<[number, number, number]> = [
    [59, 107, 199], // froid — bleu acier (≠ accent : jamais confondu avec « actif »)
    [163, 163, 163], // tiède — neutral-400, le milieu se fond dans le DS
    [234, 88, 12], // chaud — orange brûlé
  ]
  const t = Math.min(100, Math.max(0, value)) / 100
  const [from, to, local] = t < 0.5 ? [stops[0], stops[1], t * 2] : [stops[1], stops[2], (t - 0.5) * 2]
  const ch = (i: number) => Math.round(from[i] + (to[i] - from[i]) * local)
  return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`
}

/**
 * Thermomètre SVG inline : piste neutre (décorative, #e5e5e5) + mercure dont
 * la HAUTEUR suit `value` (0–100) et la TEINTE la rampe froid→chaud. Le bulbe
 * est toujours coloré : même à froid, l'icône se lit « thermomètre ».
 * aria-hidden — la valeur texte adjacente porte l'information.
 */
export function ThermoGlyph({ value, size = 12, className = '' }: {
  value: number
  size?: number
  className?: string
}) {
  const frac = Math.min(100, Math.max(0, value)) / 100
  const color = tempColor(value)
  // Tube de y=1,2 à 10,2 ; le mercure monte du bulbe (cy 11) vers le haut.
  const yTop = 1.2 + (1 - frac) * 7.3
  return (
    <svg
      width={(size * 10) / 14}
      height={size}
      viewBox="0 0 10 14"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect x="3.9" y="1.2" width="2.2" height="9" rx="1.1" fill="var(--color-border)" />
      <rect x="3.9" y={yTop} width="2.2" height={11 - yTop} rx="1.1" fill={color} />
      <circle cx="5" cy="11" r="2.5" fill={color} />
    </svg>
  )
}

/** « 48,7° » — virgule décimale (relevé à la française, décision Rémi). */
export function formatTemp(value: number, decimals = 1): string {
  return `${value.toFixed(decimals).replace('.', ',')}°`
}

/** Nombre de la décomposition : 2 décimales max, zéros de queue retirés (« 30 », « 18,67 »). */
function formatTerm(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',')
}

/**
 * Le POURQUOI de la température, en une ligne (tooltip) : la décomposition en
 * trois tiers — auto (blocages transitifs + âge), base (nature du type),
 * seed (chaleur posée à la main, champ `heat`).
 */
export function tempTitle(t: Temperature): string {
  return `Temperature ${formatTemp(t.value, 2)} — auto ${formatTerm(t.auto)} (blocks + age) · base ${formatTerm(t.base)} (type) · seed ${formatTerm(t.seed)} (heat)`
}

/** Décomposition compacte pour affichage (panneau) : « auto 18,67 · base 30 · seed 0 ». */
export function tempBreakdown(t: Temperature): string {
  return `auto ${formatTerm(t.auto)} · base ${formatTerm(t.base)} · seed ${formatTerm(t.seed)}`
}

/**
 * Température à afficher sur une LIGNE ou une CARTE : toutes les tâches
 * OUVERTES en portent une — comme l'ex-chip team, inconditionnel (décision
 * Rémi ; le seuil « un tiers » du spec §7 est écarté : avec les bases
 * canoniques ≤ 30, il masquait tout, tout le temps). Le calme du DS est
 * préservé par la rampe elle-même : un backlog tiède est bleu-gris, seule la
 * chaleur réelle vire à l'orange. Null si absente ou tâche done (une priorité
 * ne veut plus rien dire).
 */
export function rowTemperature(task: Pick<TaskNode, 'status' | 'temperature'>): Temperature | null {
  const t = task.temperature
  if (!t || task.status === 'done') return null
  return t
}

/**
 * LE badge température des lignes/cartes — rendu à l'emplacement de l'ex-chip
 * team : thermomètre coloré + valeur en mono neutral-500, décomposition au
 * survol (title). Pas un `Chip` : la bordure de chip autour d'une icône
 * colorée doublerait le bruit — le glyphe EST le badge.
 */
export function TempBadge({ t, className = '' }: { t: Temperature; className?: string }) {
  return (
    <span
      title={tempTitle(t)}
      className={`inline-flex shrink-0 items-center gap-1 font-mono text-[11px] text-textsoft ${className}`}
    >
      <ThermoGlyph value={t.value} />
      {formatTemp(t.value)}
      <span className="sr-only">temperature, details on hover</span>
    </span>
  )
}
