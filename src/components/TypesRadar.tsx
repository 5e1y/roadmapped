import { Bank, Brain, Bug, ColorPalette, Comment, Megaphone, Scale, Sparkle, Wrench } from 'trinil-react'
import type { ComponentType } from 'react'

/*
 * Radar de CHARGE par TYPE (jalons v2). Neuf axes = les 9 types. SVG géométrie
 * (anneaux/axes/polygone/points, traits non-scalants) + labels HTML à taille fixe
 * superposés (icône + type + compte de tickets ouverts).
 *
 * PUREMENT VISUEL (#395, décision Rémi) : la sélection de label ne filtrait RIEN
 * sur la page Overview (le filtrage type→backlog vit dans le Backlog) — retirée.
 * Les labels sont de simples étiquettes de lecture, plus des contrôles.
 */

/** Les 9 types, en ordre d'affichage, avec leur clé de section, label court et icône. */
const TYPE_META: { key: string; label: string; Icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { key: '01-bug', label: 'bug', Icon: Bug },
  { key: '02-feature', label: 'feature', Icon: Sparkle },
  { key: '03-chore', label: 'chore', Icon: Wrench },
  { key: '04-brainstorm', label: 'brainstorm', Icon: Brain },
  { key: '05-design', label: 'design', Icon: ColorPalette },
  { key: '06-marketing', label: 'marketing', Icon: Megaphone },
  { key: '07-communication', label: 'comm', Icon: Comment },
  { key: '08-legal', label: 'legal', Icon: Scale },
  { key: '09-business', label: 'business', Icon: Bank },
]
const N = TYPE_META.length

const SIZE = 520
const CX = SIZE / 2
const CY = SIZE / 2
const R = 185
const RINGS = 4

/** Coordonnées du sommet i (N axes, départ en haut, sens horaire). */
function vertex(i: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / N - Math.PI / 2
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
const ringPath = (r: number) =>
  Array.from({ length: N }, (_, i) => vertex(i, r).join(',')).join(' ')

export function TypesRadar({ counts }: {
  counts: Map<string, number>
}) {
  const max = Math.max(1, ...counts.values())
  const rOf = (key: string) => ((counts.get(key) ?? 0) / max) * R
  const poly = TYPE_META.map((t, i) => vertex(i, rOf(t.key)).join(',')).join(' ')
  return (
    // role="img" : radar de lecture, plus de contrôles (la sélection ne filtrait rien).
    <div className="relative aspect-square w-full" role="img" aria-label="Open tickets by type">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-[15%] h-[70%] w-[70%] overflow-visible" aria-hidden="true">
        {Array.from({ length: RINGS }, (_, k) => (
          <polygon key={k} points={ringPath(((k + 1) / RINGS) * R)} fill="none" stroke="var(--color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {TYPE_META.map((_, i) => {
          const [x, y] = vertex(i, R)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--color-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        })}
        {/* Le polygone de charge = LA donnée, en ACCENT (#395, Rémi) : le radar
            n'a plus de sélection à réserver l'accent (labels en lecture), autant
            colorer la donnée. Aire accent 10 % + trait accent 1.5. */}
        <polygon points={poly} fill="var(--color-accent)" fillOpacity={0.12} stroke="var(--color-accent)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {TYPE_META.map((t, i) => {
          const [x, y] = vertex(i, rOf(t.key))
          return <circle key={t.key} cx={x} cy={y} r={4} fill="var(--color-accent)" />
        })}
      </svg>
      {/* Étiquettes HTML à taille FIXE (LECTURE — plus des contrôles), ancrées vers
          l'extérieur (jamais sur la grille). */}
      {TYPE_META.map((t, i) => {
        const a = (Math.PI * 2 * i) / N - Math.PI / 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const Icon = t.Icon
        return (
          <span
            key={t.key}
            style={{
              left: `${50 + cos * 36}%`,
              top: `${50 + sin * 38}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute flex items-center gap-xs whitespace-nowrap rounded-interactive bg-foreground px-s py-xs text-[11px] text-texthard ring-1 ring-inset ring-border"
          >
            <Icon size={11} className="text-textsoft" />
            {t.label}
            <span className="font-mono text-[11px] text-textsoft">
              {counts.get(t.key) ?? 0}
            </span>
          </span>
        )
      })}
    </div>
  )
}
