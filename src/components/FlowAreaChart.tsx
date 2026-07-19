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

  return (
    <div className="px-4 pb-3 pt-1">
      {/* Légende — même registre que les autres viz de l'Overview. */}
      <div className="mb-2 flex items-center gap-4 text-[11px] text-textsoft">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-round bg-neutral-400" aria-hidden="true" /> Created
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-round bg-accent" aria-hidden="true" /> Closed
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Created vs closed per day">
        <defs>
          <linearGradient id="flow-created" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-neutral-400)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-neutral-400)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="flow-closed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Repères Y : 0, milieu, max. */}
        {[0, 0.5, 1].map((f) => {
          const y = BASE_Y - f * PLOT_H
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--color-neutral-200)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-neutral-500" fontSize="11" fontFamily="ui-monospace, monospace">
                {Math.round(f * max)}
              </text>
            </g>
          )
        })}

        {/* Aires superposées : créés (neutre) dessous, fermés (accent) au-dessus. */}
        <path d={smoothArea(createdPts)} fill="url(#flow-created)" />
        <path d={smoothArea(closedPts)} fill="url(#flow-closed)" />
        {/* Lignes de crête par-dessus les aires. */}
        <path d={smoothLine(createdPts)} fill="none" stroke="var(--color-neutral-400)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={smoothLine(closedPts)} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

        {/* Étiquettes X. */}
        {[...tickIdx].sort((a, b) => a - b).map((i) => (
          <text
            key={i}
            x={createdPts[i][0]}
            y={H - 6}
            textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
            className="fill-neutral-500"
            fontSize="11"
            fontFamily="ui-monospace, monospace"
          >
            {short(data[i].day)}
          </text>
        ))}
      </svg>
    </div>
  )
}
