import { Popover } from '@base-ui/react/popover'
import { SlidersHorizontal } from 'trinil-react'
import { KB_SIM, type KbSimParams } from '../lib/kbSim'
import { setKbSimOverrides, useKbSimOverrides } from '../state/kbSimParams'
import { TogglePill } from './ui'

/**
 * Panneau « Display » de la Knowledge base (#318) : les paramètres de la sim
 * de forces (kbSim) exposés en sliders LIVE — bouger un curseur écrit le store
 * persisté (state/kbSimParams), KbGraph l'écoute et pousse au driver qui
 * réchauffe la sim : le graphe se réorganise sous le doigt. Persisté dans
 * localStorage (ui:kb-graph-params) : survit au reload et à la fermeture du
 * dashboard. « Reset defaults » efface la clé → retour à KB_SIM.
 *
 * Même idiome que FilterMenu (Popover Base UI, pill de trigger, tint accent
 * quand des réglages custom sont actifs) — monochrome + accent, tokens only.
 * Le popup est porté par un Portal : il ne couvre pas le canvas du graphe.
 */

interface SliderSpec {
  key: keyof KbSimParams
  label: string
  min: number
  max: number
  step: number
  /** Unité UI ↔ param quand elles diffèrent (ex. ticks ↔ ALPHA_DECAY). Identité sinon. */
  toParam?: (ui: number) => number
  fromParam?: (v: number) => number
  fmt: (ui: number) => string
}

const int = (v: number): string => String(Math.round(v))
const dec2 = (v: number): string => v.toFixed(2)

/** Plages alignées sur KB_SIM_LIMITS là où les défauts #321 (Spring 160,
 *  Repulsion −200, θ 0.5, R max 40) touchaient l'ancienne butée de slider —
 *  un défaut ne doit pas être coincé au bord de sa course. */
const SLIDERS: SliderSpec[] = [
  { key: 'LINK_DIST', label: 'Spring length', min: 20, max: 200, step: 1, fmt: (v) => `${int(v)} px` },
  { key: 'CHARGE_BASE', label: 'Repulsion', min: -300, max: -5, step: 1, fmt: int },
  { key: 'CENTER_K', label: 'Centering', min: 0, max: 0.3, step: 0.005, fmt: (v) => v.toFixed(3) },
  {
    // Le param est la part de vélocité CONSERVÉE ; l'UI parle en friction
    // (= velocityDecay de d3) — plus haut = plus amorti. Défaut #321 : 0.50.
    key: 'VELOCITY_KEEP', label: 'Friction', min: 0.05, max: 0.9, step: 0.01,
    toParam: (ui) => 1 - ui, fromParam: (v) => 1 - v, fmt: dec2,
  },
  {
    // ALPHA_DECAY exprimé en « ticks avant stabilisation » (~60/s) — parlant,
    // et l'expression inverse retombe EXACTEMENT sur le défaut à 240.
    key: 'ALPHA_DECAY', label: 'Settle time', min: 30, max: 600, step: 10,
    toParam: (t) => 1 - Math.pow(KB_SIM.ALPHA_MIN, 1 / t),
    fromParam: (d) => Math.round(Math.log(KB_SIM.ALPHA_MIN) / Math.log(1 - d)),
    fmt: (v) => `${int(v)} ticks`,
  },
  { key: 'THETA', label: 'Theta (accuracy)', min: 0.3, max: 1.5, step: 0.05, fmt: dec2 },
  { key: 'R_MIN', label: 'Node radius min', min: 2, max: 12, step: 1, fmt: (v) => `${int(v)} px` },
  { key: 'R_MAX', label: 'Node radius max', min: 10, max: 48, step: 1, fmt: (v) => `${int(v)} px` },
]

export function KbDisplayMenu() {
  const overrides = useKbSimOverrides()
  const dirty = Object.keys(overrides).length > 0

  const setParam = (spec: SliderSpec, ui: number): void => {
    if (!Number.isFinite(ui)) return
    setKbSimOverrides({ ...overrides, [spec.key]: spec.toParam ? spec.toParam(ui) : ui })
  }

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="Display settings"
        title="Display settings — force simulation parameters (live)"
        render={<TogglePill active={dirty} />}
      >
        <SlidersHorizontal size={12} />
        Display
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} align="end" className="z-50">
          <Popover.Popup className="w-64 overflow-hidden rounded-surface border border-border bg-foreground shadow-sm">
            <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
              {SLIDERS.map((s) => {
                const cur = overrides[s.key] ?? KB_SIM[s.key]
                const ui = s.fromParam ? s.fromParam(cur) : cur
                return (
                  <label key={s.key} className="block py-1.5">
                    <span className="flex items-baseline justify-between gap-2 text-xs text-textsoft">
                      <span>{s.label}</span>
                      <span className="font-mono text-[11px] text-textsoft">{s.fmt(ui)}</span>
                    </span>
                    <input
                      type="range"
                      min={s.min}
                      max={s.max}
                      step={s.step}
                      value={ui}
                      onChange={(e) => setParam(s, Number(e.target.value))}
                      aria-label={s.label}
                      className="mt-1 block w-full accent-accent"
                    />
                  </label>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setKbSimOverrides({})}
              disabled={!dirty}
              className="flex w-full border-t border-neutral-100 px-3 py-1.5 text-left text-xs text-textsoft transition-colors enabled:hover:bg-rollover enabled:hover:text-neutral-700 disabled:text-neutral-400"
            >
              Reset defaults
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
