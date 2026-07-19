import type { DayBucket } from '../lib/overview'

/**
 * Graphe en AIRES créés vs fermés par jour (#376, retour Rémi : style shadcn —
 * deux séries lissées, dégradé, superposées dans le MÊME espace x/y, pas des
 * barres groupées). Créés = flux entrant en NEUTRE ; fermés = le débit mis en
 * avant en ACCENT (seule série colorée — doctrine monochrome + accent rare).
 * SVG maison, courbe lissée Catmull-Rom (le flux « qui coule » de la réf), aires
 * remplies par un dégradé qui s'estompe vers la ligne de base. Tokens CSS only.
 */

const W = 720
const H = 240
// #385 — left/bottom élargis pour loger les étiquettes d'axes passées de 9 à
// 11px (plancher micro-text design.md §1) sans rogner le tracé ni les chiffres.
const PAD = { top: 14, right: 12, bottom: 26, left: 32 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const BASE_Y = PAD.top + PLOT_H

/** Points d'une série en coordonnées SVG (x réparti, y ∝ valeur / max). */
function points(values: number[], max: number): [number, number][] {
  const n = values.length
  const step = n > 1 ? PLOT_W / (n - 1) : 0
  return values.map((v, i) => [
    PAD.left + (n > 1 ? i * step : PLOT_W / 2),
    BASE_Y - (max > 0 ? (v / max) * PLOT_H : 0),
  ])
}

/** Courbe lissée (Catmull-Rom → cubiques de Bézier) traversant tous les points. */
function smoothLine(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2[0]} ${p2[1]}`
  }
  return d
}

/** Aire = courbe lissée refermée sur la ligne de base. */
function smoothArea(pts: [number, number][]): string {
  if (pts.length === 0) return ''
  return `${smoothLine(pts)} L ${pts[pts.length - 1][0]} ${BASE_Y} L ${pts[0][0]} ${BASE_Y} Z`
}

/** "YYYY-MM-DD" → "DD/MM". */
const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function FlowAreaChart({ data }: { data: DayBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center px-4 text-center text-xs text-textsoft">
        No activity to chart yet.
      </div>
    )
  }

  const createdVals = data.map((d) => d.created)
  const closedVals = data.map((d) => d.closed)
  const max = Math.max(1, ...createdVals, ...closedVals)
  const createdPts = points(createdVals, max)
  const closedPts = points(closedVals, max)

  // Étiquettes X : premier, dernier, et ~3 repères au milieu (sans surcharge).
  const tickIdx = new Set<number>([0, data.length - 1])
  const stride = Math.max(1, Math.round((data.length - 1) / 4))
  for (let i = 0; i < data.length; i += stride) tickIdx.add(i)

  const xTicks = [...tickIdx].sort((a, b) => a - b)
  const pct = (n: number, total: number) => `${(n / total) * 100}%`

  return (
    <div className="flex h-full flex-col px-4 pb-3 pt-1">
      {/* Légende — même registre que les autres viz de l'Overview. */}
      <div className="mb-2 flex shrink-0 items-center gap-4 text-[11px] text-textsoft">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-round" style={{ backgroundColor: 'var(--color-textsoft)' }} aria-hidden="true" /> Created
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-round bg-accent" aria-hidden="true" /> Closed
        </span>
      </div>
      {/* Conteneur relatif : le SVG remplit sa largeur (hauteur via viewBox), les
          ÉTIQUETTES sont en overlay HTML — taille en px FIXES, indépendante de la
          largeur (un <text> SVG est mis à l'échelle par le viewBox → énorme en
          pleine largeur, minuscule en colonne ; retour Rémi). Positions en % =
          coordonnées viewBox / dimension. */}
      <div className="relative min-h-[180px] w-full flex-1">
        {/* preserveAspectRatio=none : le tracé s'ÉTIRE pour remplir la hauteur de la
            carte (sinon un grand vide sous un chart court à côté du radar). Les
            traits restent à 1,5px (vectorEffect non-scaling) et les étiquettes,
            en overlay HTML positionné en %, suivent. */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-full w-full" role="img" aria-label="Created vs closed per day">
          <defs>
            <linearGradient id="flow-created" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-textsoft)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-textsoft)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="flow-closed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Repères Y : 0, milieu, max (lignes SEULEMENT — les chiffres sont en HTML). */}
          {[0, 0.5, 1].map((f) => {
            const y = BASE_Y - f * PLOT_H
            return (
              <line key={f} x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            )
          })}

          {/* Aires superposées : créés (neutre) dessous, fermés (accent) au-dessus. */}
          <path d={smoothArea(createdPts)} fill="url(#flow-created)" />
          <path d={smoothArea(closedPts)} fill="url(#flow-closed)" />
          {/* Lignes de crête par-dessus les aires. */}
          <path d={smoothLine(createdPts)} fill="none" stroke="var(--color-textsoft)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={smoothLine(closedPts)} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>

        {/* Étiquettes Y (overlay HTML, alignées à droite juste avant le tracé). */}
        {[0, 0.5, 1].map((f) => (
          <span
            key={f}
            className="pointer-events-none absolute -translate-y-1/2 font-mono text-[10px] tabular-nums text-textsoft"
            style={{ left: pct(PAD.left - 4, W), top: pct(BASE_Y - f * PLOT_H, H), transform: 'translate(-100%, -50%)' }}
          >
            {Math.round(f * max)}
          </span>
        ))}
        {/* Étiquettes X (overlay HTML, ancrées début/milieu/fin). */}
        {xTicks.map((i) => (
          <span
            key={i}
            className="pointer-events-none absolute bottom-0 font-mono text-[10px] text-textsoft"
            style={{
              left: pct(createdPts[i][0], W),
              transform: i === 0 ? 'translateX(0)' : i === data.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
            }}
          >
            {short(data[i].day)}
          </span>
        ))}
      </div>
    </div>
  )
}
