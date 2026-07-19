import { Bank, Brain, Bug, ColorPalette, Comment, Megaphone, Scale, Sparkle, Wrench } from 'trinil-react'
import type { ComponentType } from 'react'

/*
 * Radar de CHARGE par TYPE (jalons v2) — successeur direct du radar de teams
 * (décision Rémi : « garder le graph de zone, juste teams → jalons »). Neuf axes
 * = les 9 types. Même langage : SVG géométrie (anneaux/axes/polygone/points,
 * traits non-scalants), boutons HTML à taille fixe superposés qui portent la
 * sélection (= le filtre type solo) et le compte de tickets ouverts. Recliquer
 * le type actif le désélectionne.
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

export function TypesRadar({ counts, selected, onSelect }: {
  counts: Map<string, number>
  selected: string
  onSelect: (typeKey: string) => void
}) {
  const max = Math.max(1, ...counts.values())
  const rOf = (key: string) => ((counts.get(key) ?? 0) / max) * R
  const poly = TYPE_META.map((t, i) => vertex(i, rOf(t.key)).join(',')).join(' ')
  return (
    // role="group" (pas "img") : les N boutons aria-pressed restent des contrôles.
    <div className="relative aspect-square w-full" role="group" aria-label="Load by type">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-[15%] h-[70%] w-[70%] overflow-visible" aria-hidden="true">
        {Array.from({ length: RINGS }, (_, k) => (
          <polygon key={k} points={ringPath(((k + 1) / RINGS) * R)} fill="none" stroke="var(--color-neutral-200)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {TYPE_META.map((_, i) => {
          const [x, y] = vertex(i, R)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--color-neutral-200)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        })}
        {/* Le polygone de charge est la DONNÉE, pas une sélection : NEUTRE au repos
            (doctrine accent = rare/sélection). L'accent est réservé au sommet du
            type sélectionné + aux cartes actives. Trait d'emphase unifié à 1.5. */}
        <polygon points={poly} fill="var(--color-neutral-400)" fillOpacity={0.1} stroke="var(--color-neutral-400)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {TYPE_META.map((t, i) => {
          const [x, y] = vertex(i, rOf(t.key))
          const active = selected === t.key
          return <circle key={t.key} cx={x} cy={y} r={active ? 5 : 4} fill={active ? 'var(--color-accent)' : 'var(--color-neutral-400)'} />
        })}
      </svg>
      {/* Cartes HTML à taille FIXE, ancrées vers l'extérieur (jamais sur la grille). */}
      {TYPE_META.map((t, i) => {
        const a = (Math.PI * 2 * i) / N - Math.PI / 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const active = selected === t.key
        const Icon = t.Icon
        return (
          <button
            key={t.key}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(active ? '' : t.key) }}
            aria-pressed={active}
            title={active ? 'Click again to clear this type filter' : `Filter by ${t.label}`}
            style={{
              left: `${50 + cos * 36}%`,
              top: `${50 + sin * 38}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`absolute flex items-center gap-1 whitespace-nowrap rounded-interactive px-1.5 py-0.5 text-[11px] ring-1 ring-inset transition-colors ${
              active
                ? 'bg-active font-medium text-texthard ring-accent'
                : 'bg-foreground text-texthard ring-border hover:bg-rollover'
            }`}
          >
            <Icon size={11} className={active ? 'text-accent' : 'text-textsoft'} />
            {t.label}
            <span className={`font-mono text-[11px] ${active ? 'text-accent' : 'text-textsoft'}`}>
              {counts.get(t.key) ?? 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}
