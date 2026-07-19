import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'trinil-react'
import { ViewHeader } from './ViewHeader'
import { Chip } from './Chip'
import { StatusGlyph, MilestoneGlyph, EpicGlyph, KindGlyph } from './glyphs'
import {
  TogglePill,
  primaryBtn,
  actionBtn,
  ghostCls,
  GhostInput,
  ErrorBanner,
  CURRENT_ROW,
  rowStateClass,
} from './ui'

/**
 * Page « Design System » (#388, chantier C9) — living styleguide RENDUE DEPUIS
 * LES VRAIS composants et tokens : elle n'affiche aucune capture, elle monte les
 * primitives réelles (ui.tsx / Chip.tsx / glyphs.tsx) et lit les vraies valeurs
 * CSS. Elle EST donc son propre garde-fou : toute dérive future du système s'y
 * voit immédiatement (une couleur hors token, un rayon hors doctrine, un registre
 * de sélection ré-inventé sautent aux yeux ici avant le reste de l'app).
 *
 * Hors NavRail (décision Rémi) : on y arrive par un raccourci clavier global
 * (« g » puis « d », câblé dans Shell/App.tsx) et on en sort par ce Back ou Échap.
 * Elle reflète docs/design.md (la source de vérité) — chaque section renvoie au §.
 */

const COLOR_TOKENS = [
  '--color-accent',
  '--color-accent-tint',
  '--color-page',
  '--color-white',
  '--color-neutral-50',
  '--color-neutral-100',
  '--color-neutral-200',
  '--color-neutral-300',
  '--color-neutral-400',
  '--color-neutral-500',
  '--color-neutral-600',
  '--color-neutral-700',
  '--color-neutral-800',
  '--color-neutral-900',
] as const

/**
 * Lit la VRAIE valeur calculée de chaque token sur `:root` et la re-lit quand le
 * thème bascule (attribut `data-theme`) : la valeur imprimée flippe avec le mode
 * sombre, exactement comme les échantillons (qui, eux, passent par `var()`).
 */
function useTokenValues(names: readonly string[]): Record<string, string> {
  const [vals, setVals] = useState<Record<string, string>>({})
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement)
      const next: Record<string, string> = {}
      for (const n of names) next[n] = cs.getPropertyValue(n).trim()
      setVals(next)
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [names])
  return vals
}

/** Carte tri-couche (surface #ffffff, filet neutral-200, carrée = surface, design.md §1). */
function Section({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className="border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900">{title}</h2>
        <span className="shrink-0 font-mono text-[11px] text-neutral-500">{source}</span>
      </div>
      {children}
    </section>
  )
}

/** La règle en une phrase, sous les éléments vivants (le « pourquoi » du bloc). */
function Legend({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-xs leading-relaxed text-neutral-500">{children}</p>
}

// ── Couleurs / tokens ────────────────────────────────────────────────────────
const COLOR_ROLES: Record<string, string> = {
  '--color-accent': 'active · selection · in_progress',
  '--color-accent-tint': 'selection background',
  '--color-page': 'body background',
  '--color-white': 'card surface',
  '--color-neutral-50': 'row hover',
  '--color-neutral-100': 'hover fill',
  '--color-neutral-200': 'rules / separators',
  '--color-neutral-300': 'field border · decorative',
  '--color-neutral-400': 'decorative / disabled',
  '--color-neutral-500': 'text floor (on white)',
  '--color-neutral-600': 'text floor (on gray)',
  '--color-neutral-700': 'strong meta',
  '--color-neutral-800': 'emphatic ink',
  '--color-neutral-900': 'primary ink',
}

function ColorsSection() {
  const values = useTokenValues(COLOR_TOKENS)
  return (
    <Section title="Colors & tokens" source="design.md §1">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {COLOR_TOKENS.map((token) => (
          <div key={token} className="flex items-center gap-3">
            <span
              className="size-9 shrink-0 border border-neutral-200"
              style={{ backgroundColor: `var(${token})` }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <div className="truncate font-mono text-[11px] text-neutral-900">{token.replace('--color-', '')}</div>
              <div className="truncate font-mono text-[11px] text-neutral-500">{values[token] || '—'}</div>
              <div className="truncate text-[11px] text-neutral-500">{COLOR_ROLES[token]}</div>
            </div>
          </div>
        ))}
      </div>
      <Legend>
        Monochrome + ONE accent (blue): the accent is reserved for active elements and
        points of attention — its rarity makes it spottable. No semantic colors. Every
        value is a token, so the whole page flips to dark automatically (redefined under{' '}
        <span className="font-mono">:root[data-theme="dark"]</span>) — a hardcoded hex would
        be a dark-mode bug.
      </Legend>
    </Section>
  )
}

// ── Typographie ──────────────────────────────────────────────────────────────
const TYPE_LEVELS: { name: string; cls: string; role: string; sample: ReactNode }[] = [
  { name: 'title', cls: 'text-sm font-semibold tracking-tight', role: 'view / panel / section titles', sample: 'Section title' },
  { name: 'body', cls: 'text-sm', role: 'task titles, doc prose, primary content', sample: 'Ship the design system page' },
  { name: 'label', cls: 'text-xs font-medium', role: 'list headers, buttons, controls', sample: 'In progress' },
  { name: 'field-label', cls: 'text-[11px] font-medium', role: 'panel field labels', sample: 'Depends on' },
  { name: 'meta', cls: 'text-[11px] font-mono', role: 'all metadata — dates, counters, ids, paths', sample: '#388 · 2026-07-19' },
  { name: 'micro', cls: 'text-[11px]', role: '11px floor — nothing renders smaller', sample: 'smallest text' },
]

function TypographySection() {
  return (
    <Section title="Typography scale" source="design.md §1">
      <div className="flex flex-col divide-y divide-neutral-200">
        {TYPE_LEVELS.map((lvl) => (
          <div key={lvl.name} className="flex items-baseline gap-4 py-2">
            <span className="w-24 shrink-0 font-mono text-[11px] text-neutral-500">{lvl.name}</span>
            <span className={`min-w-0 flex-1 truncate text-neutral-900 ${lvl.cls}`}>{lvl.sample}</span>
            <span className="hidden shrink-0 text-[11px] text-neutral-500 sm:block">{lvl.role}</span>
          </div>
        ))}
      </div>
      <Legend>
        One scale for the whole app: a role picks a named level, never an arbitrary px.
        Metadata is always <span className="font-mono">text-[11px]</span> (mono for
        ids/dates/counts) — never 12px. Nothing smaller than 11px renders.
      </Legend>
    </Section>
  )
}

// ── Rayons / strate ──────────────────────────────────────────────────────────
function RadiiSection() {
  return (
    <Section title="Corner radii & layer" source="design.md §1">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-9 items-center rounded border border-neutral-300 bg-white px-2.5 text-xs text-neutral-600">
            control
          </span>
          <span className="font-mono text-[11px] text-neutral-500">rounded · 4px</span>
          <span className="text-[11px] text-neutral-500">body control</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-9 items-center rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-600">
            header / floating
          </span>
          <span className="font-mono text-[11px] text-neutral-500">rounded-md · 6px</span>
          <span className="text-[11px] text-neutral-500">header + floating card</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-9 items-center border border-neutral-300 bg-white px-2.5 text-xs text-neutral-600">
            surface
          </span>
          <span className="font-mono text-[11px] text-neutral-500">square · 0</span>
          <span className="text-[11px] text-neutral-500">cards, chips, rows, banners</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="flex h-9 w-24 items-center">
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full w-2/3 rounded-full bg-accent" />
            </span>
          </span>
          <span className="font-mono text-[11px] text-neutral-500">rounded-full</span>
          <span className="text-[11px] text-neutral-500">progress bars, status dots</span>
        </div>
      </div>
      <Legend>
        The radius encodes the LAYER, not interactivity: 0 = sewn to a surface, 4px = a
        control in the body of a view, 6px = the h-12 header chrome and floating cards,
        full = gauges and dots. No <span className="font-mono">rounded-lg</span> anywhere.
      </Legend>
    </Section>
  )
}

// ── Primitives ───────────────────────────────────────────────────────────────
function PrimitivesSection() {
  const [on, setOn] = useState(true)
  return (
    <Section title="Primitives" source="ui.tsx · Chip.tsx · design.md §2">
      <div className="flex flex-col gap-5">
        <Row label="Toggle pill">
          <TogglePill active={on} onClick={() => setOn((v) => !v)}>Toggle (click me)</TogglePill>
          <TogglePill active={false}>Inactive</TogglePill>
        </Row>
        <Row label="Chips">
          <Chip label="status" />
          <Chip label="epic: ds-consistency" strong />
          <Chip label="#388" mono />
        </Row>
        <Row label="Buttons">
          <button type="button" className={primaryBtn}>Primary</button>
          <button type="button" className={actionBtn}>Secondary</button>
        </Row>
        <Row label="Ghost field">
          <div className="w-64">
            <GhostInput defaultValue="Camouflaged input — hover / focus me" aria-label="Ghost field demo" />
          </div>
          <span className="font-mono text-[11px] text-neutral-500">{ghostCls.includes('bg-transparent') ? 'transparent at rest' : ''}</span>
        </Row>
        <Row label="Error banner">
          <div className="w-full max-w-md">
            <ErrorBanner errors={['A meaning-bearing error, monochrome register (left rule neutral-900).']} />
          </div>
        </Row>
      </div>
      <Legend>
        Base UI everywhere, zero handmade element. These are the real exports — the page
        renders them, it doesn&apos;t reproduce them. In-line variants inside views are a bug.
      </Legend>
    </Section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-28 shrink-0 text-[11px] font-medium text-neutral-500">{label}</span>
      <div className="flex flex-1 flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

// ── Langage de sélection (2 registres) ────────────────────────────────────────
function SelectionSection() {
  const [pressed, setPressed] = useState(true)
  return (
    <Section title="Selection language — two registers" source="design.md §3.2">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-medium text-neutral-500">Current row (rowStateClass / CURRENT_ROW)</div>
          <div className="border border-neutral-200">
            <FakeRow current />
            <FakeRow />
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            <span className="font-mono">bg-accent-tint</span> + 2px inset accent left rule —
            an item open in the panel / a selected list entry.
          </p>
        </div>
        <div>
          <div className="mb-2 text-[11px] font-medium text-neutral-500">Enclenched control (TogglePill)</div>
          <div className="flex items-center gap-3">
            <TogglePill active={pressed} onClick={() => setPressed((v) => !v)}>On</TogglePill>
            <TogglePill active={false}>Off</TogglePill>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            <span className="font-mono">border-accent</span> + tint + font-medium — a toggle /
            filter that is pressed ON (#311).
          </p>
        </div>
      </div>
      <Legend>
        Two registers, each a single primitive: a decorated ROW vs. a pressed CONTROL. Gray{' '}
        <span className="font-mono">bg-neutral-100</span> is hover ONLY, never selection. An
        inert badge must wear neither accent register.
      </Legend>
    </Section>
  )
}

/** Rangée façon TaskRow, décorée par la source UNIQUE rowStateClass (design.md §3.2). */
function FakeRow({ current = false }: { current?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-4 py-2 ${current ? CURRENT_ROW : rowStateClass(false)}`}>
      <StatusGlyph status={current ? 'in_progress' : 'todo'} />
      <span className="font-mono text-[11px] text-neutral-500">#{current ? '388' : '389'}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-900">
        {current ? 'This row is current' : 'This row is idle (hover me)'}
      </span>
    </div>
  )
}

// ── Glyphes ───────────────────────────────────────────────────────────────────
function GlyphsSection() {
  return (
    <Section title="Glyph family" source="design.md §5 · glyphs.tsx">
      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <GlyphSet
          title="Status (circle)"
          items={[
            ['todo', <StatusGlyph key="t" status="todo" />],
            ['in_progress', <StatusGlyph key="p" status="in_progress" />],
            ['done', <StatusGlyph key="d" status="done" />],
          ]}
        />
        <GlyphSet
          title="Milestone (diamond)"
          items={[
            ['todo', <MilestoneGlyph key="t" status="todo" />],
            ['in_progress', <MilestoneGlyph key="p" status="in_progress" />],
            ['done', <MilestoneGlyph key="d" status="done" />],
          ]}
        />
        <GlyphSet
          title="Epic (square)"
          items={[
            ['todo', <EpicGlyph key="t" status="todo" />],
            ['in_progress', <EpicGlyph key="p" status="in_progress" />],
            ['done', <EpicGlyph key="d" status="done" />],
          ]}
        />
        <GlyphSet
          title="KindGlyph (by kind)"
          items={[
            ['task', <KindGlyph key="t" task={{ kind: 'task', status: 'in_progress' }} />],
            ['milestone', <KindGlyph key="m" task={{ kind: 'milestone', status: 'in_progress' }} />],
          ]}
        />
      </div>
      <Legend>
        One family, shape carries the type: circle = task, diamond = milestone (locks other
        tasks), square = epic (a group). One ink language across all three: hollow = to do,
        half + accent = in progress, full = done. <span className="font-mono">currentColor</span>,
        one trait weight, icons from trinil-react.
      </Legend>
    </Section>
  )
}

function GlyphSet({ title, items }: { title: string; items: [string, ReactNode][] }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-medium text-neutral-500">{title}</div>
      <div className="flex gap-4">
        {items.map(([label, glyph]) => (
          <div key={label} className="flex flex-col items-center gap-1">
            {glyph}
            <span className="font-mono text-[11px] text-neutral-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Data-viz ──────────────────────────────────────────────────────────────────
function DataVizSection() {
  return (
    <Section title="Data-viz grammar" source="design.md §5">
      <div className="flex flex-wrap items-center gap-8">
        <svg width="220" height="90" viewBox="0 0 220 90" role="img" aria-label="Edge grammar example">
          <title>Solid = explicit relationship, dashed = inferred</title>
          {/* grille décorative neutral-200 */}
          <line x1="0" y1="45" x2="220" y2="45" stroke="var(--color-neutral-200)" strokeWidth="1" />
          {/* arête PLEINE = relation explicite/connue */}
          <line x1="40" y1="30" x2="110" y2="30" stroke="var(--color-neutral-500)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {/* arête POINTILLÉE (3 3) = inférée/faible */}
          <line x1="40" y1="60" x2="110" y2="60" stroke="var(--color-neutral-500)" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          {/* nœuds : neutres au repos, accent = LE seul sélectionné */}
          <circle cx="40" cy="30" r="5" fill="var(--color-white)" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
          <circle cx="110" cy="30" r="5" fill="var(--color-accent)" stroke="var(--color-accent)" strokeWidth="1.5" />
          <circle cx="40" cy="60" r="5" fill="var(--color-white)" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
          <circle cx="110" cy="60" r="5" fill="var(--color-white)" stroke="var(--color-neutral-500)" strokeWidth="1.5" />
          <text x="122" y="34" className="fill-neutral-500" fontSize="11">explicit — solid</text>
          <text x="122" y="64" className="fill-neutral-500" fontSize="11">inferred — dashed</text>
        </svg>
        <ul className="flex flex-col gap-1.5 text-[11px] text-neutral-500">
          <li>· solid stroke = explicit / known · dashed <span className="font-mono">3 3</span> = inferred / weak (never the reverse)</li>
          <li>· emphasis is color/ink, not a thicker line — stroke <span className="font-mono">1.5</span> everywhere</li>
          <li>· <span className="font-mono">vector-effect: non-scaling-stroke</span> on every zoomable/responsive stroke</li>
          <li>· accent is rare here too: neutral at rest, accent marks the ONE selected node/series</li>
          <li>· grid/axes: <span className="font-mono">neutral-200</span>, decorative only</li>
        </ul>
      </div>
      <Legend>
        The radar, the created-vs-closed chart, the KB graph and the Dependencies graph are
        ONE visual family — same edge semantics, same emphasis rule, same rare accent.
      </Legend>
    </Section>
  )
}

/**
 * La vue. `onBack` remonte à la vue précédente (câblée dans Shell). Échap fait de
 * même — écouté ici (donc actif uniquement quand la page est montée, pas de
 * listener global concurrent), ignoré si le focus est dans un champ éditable.
 */
export function DesignSystemView({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta="Design System">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          <ChevronLeft size={11} aria-hidden="true" />
          Back
        </button>
      </ViewHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-6">
            <h1 className="text-sm font-semibold tracking-tight text-neutral-900">Design System</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Living styleguide — rendered from the real components and tokens (not screenshots).
              It mirrors <span className="font-mono">docs/design.md</span>; any future drift shows up
              here first. Reached with <span className="font-mono">g</span> then{' '}
              <span className="font-mono">d</span>; leave with Back or Esc.
            </p>
          </div>
          <div className="flex flex-col gap-6">
            <ColorsSection />
            <TypographySection />
            <RadiiSection />
            <PrimitivesSection />
            <SelectionSection />
            <GlyphsSection />
            <DataVizSection />
          </div>
        </div>
      </div>
    </div>
  )
}
