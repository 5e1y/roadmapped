import type { WeekBucket } from '../lib/overview'

/*
 * Chart CRÉÉS-vs-FERMÉS par SEMAINE (#376, ticket 5 de la spec
 * 2026-07-19-overview-activity-ux) — ÉTAPE 2 de l'Overview.
 *
 * Fonction PURE de rendu : props = WeekBucket[] (déjà calculés par
 * `createdVsClosedByWeek`, #374 — rien n'est recompté ici). Choix BARRES GROUPÉES
 * plutôt que double courbe : le projet a ~2-3 semaines d'historique, où deux
 * courbes de 2-3 points se lisent mal (segments quasi droits, croisements
 * ambigus) ; deux barres par semaine comparent créés/fermés d'un coup d'œil.
 *
 * SVG MAISON (aucune lib de charting), même langage que TypesRadar / ThermoGlyph :
 * géométrie en unités SVG, traits non-scalants, TOKENS CSS uniquement (jamais de
 * hex en dur). Monochrome + accent rare : « créés » = flux entrant, en NEUTRE
 * (var(--color-neutral-400)) ; « fermés » = le débit, le signal qu'on veut voir
 * monter, en ACCENT (var(--color-accent)). Seule cette série porte la couleur.
 */

// Géométrie (unités SVG). Le viewBox s'élargit avec le nombre de semaines pour
// garder des barres de largeur constante ; le svg est ensuite plafonné à sa
// taille naturelle et centré (pas d'étirement disgracieux sur une carte large).
const BAND = 88 // largeur d'une semaine
const BAR = 22 // largeur d'une barre
const BAR_GAP = 10 // écart créés↔fermés dans une semaine
const M = { top: 16, right: 16, bottom: 28, left: 34 } // marges (labels Y à gauche, X en bas)
const PLOT_H = 200 // hauteur de la zone traçée
const H = M.top + PLOT_H + M.bottom

/** "YYYY-MM-DD" → "DD/MM" (parse purement lexical, pas de fuseau). */
function shortLabel(weekStart: string): string {
  const [, m, d] = weekStart.slice(0, 10).split('-')
  return `${d}/${m}`
}

/** Paliers Y « ronds » : 0, milieu, max (max = plus haut bucket, ≥ 1). */
function yTicks(max: number): number[] {
  if (max <= 1) return [0, 1]
  const mid = Math.round(max / 2)
  return mid > 0 && mid < max ? [0, mid, max] : [0, max]
}

/** Une pastille de légende : carré de couleur + libellé. */
function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-500">
      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: swatch }} />
      {label}
    </span>
  )
}

export function WeeklyFlowChart({ data }: { data: WeekBucket[] }) {
  if (data.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-xs text-neutral-500">
        Pas encore d'activité hebdomadaire — le flux apparaîtra dès qu'un ticket sera créé ou fermé.
      </p>
    )
  }

  const max = Math.max(1, ...data.flatMap((w) => [w.created, w.closed]))
  const ticks = yTicks(max)
  const width = M.left + data.length * BAND + M.right
  const baseline = M.top + PLOT_H
  const yOf = (v: number) => M.top + PLOT_H - (v / max) * PLOT_H
  const groupInset = (BAND - (2 * BAR + BAR_GAP)) / 2 // centre les 2 barres dans la bande

  return (
    <div className="p-4">
      {/* Légende — au-dessus du tracé, mêmes libellés que les séries. */}
      <div className="mb-3 flex items-center gap-4 px-1">
        <LegendItem swatch="var(--color-neutral-400)" label="Créés" />
        <LegendItem swatch="var(--color-accent)" label="Fermés" />
      </div>

      <svg
        viewBox={`0 0 ${width} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tickets créés et fermés par semaine"
        className="mx-auto block h-auto w-full"
        style={{ maxWidth: width }}
      >
        {/* Repères Y : ligne horizontale + étiquette du compte à chaque palier. */}
        {ticks.map((t) => {
          const y = yOf(t)
          return (
            <g key={t}>
              <line
                x1={M.left}
                y1={y}
                x2={width - M.right}
                y2={y}
                stroke="var(--color-neutral-200)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <text x={M.left - 6} y={y} dy="0.32em" textAnchor="end" className="fill-neutral-400 text-[10px] font-mono">
                {t}
              </text>
            </g>
          )
        })}

        {/* Une bande par semaine : 2 barres groupées + étiquette de semaine. */}
        {data.map((w, i) => {
          const bandX = M.left + i * BAND + groupInset
          const createdX = bandX
          const closedX = bandX + BAR + BAR_GAP
          const centerX = M.left + i * BAND + BAND / 2
          return (
            <g key={w.weekStart}>
              {/* Créés — neutre. */}
              <rect
                data-testid="bar-created"
                x={createdX}
                y={yOf(w.created)}
                width={BAR}
                height={baseline - yOf(w.created)}
                fill="var(--color-neutral-400)"
                rx={1.5}
              />
              {/* Fermés — accent (le débit, la série mise en avant). */}
              <rect
                data-testid="bar-closed"
                x={closedX}
                y={yOf(w.closed)}
                width={BAR}
                height={baseline - yOf(w.closed)}
                fill="var(--color-accent)"
                rx={1.5}
              />
              {/* Valeurs au-dessus des barres non nulles (peu de semaines → lisible). */}
              {w.created > 0 && (
                <text x={createdX + BAR / 2} y={yOf(w.created) - 4} textAnchor="middle" className="fill-neutral-500 text-[10px] font-mono">
                  {w.created}
                </text>
              )}
              {w.closed > 0 && (
                <text x={closedX + BAR / 2} y={yOf(w.closed) - 4} textAnchor="middle" className="fill-accent text-[10px] font-mono">
                  {w.closed}
                </text>
              )}
              {/* Étiquette de semaine (lundi ISO, format court DD/MM). */}
              <text x={centerX} y={baseline + 16} textAnchor="middle" className="fill-neutral-500 text-[10px] font-mono">
                {shortLabel(w.weekStart)}
              </text>
            </g>
          )
        })}

        {/* Ligne de base (axe X). */}
        <line
          x1={M.left}
          y1={baseline}
          x2={width - M.right}
          y2={baseline}
          stroke="var(--color-neutral-300)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
