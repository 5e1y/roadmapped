import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, Cross, Plus } from 'trinil-react'
import { ViewHeader } from './ViewHeader'
import { Chip } from './Chip'
import { StatusGlyph, MilestoneGlyph, EpicGlyph, KindGlyph } from './glyphs'
import { ThemePicker } from './ThemePicker'
import { ThemeToggle } from './ThemeToggle'
import { useTheme, useThemeName } from '../state/theme'
import {
  TogglePill,
  Button,
  ghostCls,
  GhostInput,
  ErrorBanner,
  CURRENT_ROW,
  rowStateClass,
} from './ui'

/**
 * Page « Design System » (#388, chantier C9 ; resynchronisée #397 avec le contrat
 * multi-thèmes #394–#396 ; #406 : les VARIABLES — couleurs, rayons, espacements —
 * sont réunies dans un unique « Theming playground » piloté par les vrais
 * contrôles de thème) — living styleguide RENDUE DEPUIS LES VRAIS composants
 * et tokens : elle n'affiche aucune capture, elle monte les primitives réelles
 * (ui.tsx / Chip.tsx / glyphs.tsx / ThemePicker.tsx) et lit les vraies valeurs
 * CSS. Elle EST donc son propre garde-fou : toute dérive future du système s'y
 * voit immédiatement (une couleur hors token, un rayon hors doctrine, un registre
 * de sélection ré-inventé sautent aux yeux ici avant le reste de l'app).
 *
 * Hors NavRail (décision Rémi) : on y arrive par un raccourci clavier global
 * (« g » puis « d », câblé dans Shell/App.tsx) et on en sort par ce Back ou Échap.
 * Elle reflète docs/design.md (la source de vérité) — chaque section renvoie au §.
 */

// ── Tokens couleur — UNE seule couche (#405, design.md §1) ───────────────────
// Les 10 rôles SÉMANTIQUES = LE contrat de theming, ce que les composants
// appellent ET ce que les thèmes redéfinissent (en valeurs littérales — la
// couche de primitives nommées par position a été supprimée).
const SEMANTIC_TOKENS = [
  '--color-active',
  '--color-rollover',
  '--color-action',
  '--color-accent',
  '--color-foreground',
  '--color-background',
  '--color-texthard',
  '--color-textsoft',
  '--color-border',
  '--color-highlight',
] as const

/**
 * Lit la VRAIE valeur calculée de chaque token sur `:root` et la re-lit quand le
 * thème bascule — les DEUX axes (#394) : `data-theme` (clair/sombre) ET
 * `data-theme-name` (famille de palette). Les valeurs imprimées flippent donc
 * avec le sélecteur de thème monté plus bas, exactement comme les échantillons
 * (qui, eux, passent par `var()`).
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
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-theme-name'],
    })
    return () => obs.disconnect()
  }, [names])
  return vals
}

/** Carte tri-couche (Foreground, filet Border, rayon Surface — design.md §1). */
function Section({ title, source, children }: { title: string; source: string; children: ReactNode }) {
  return (
    <section className="rounded-surface ring-1 ring-inset ring-border bg-foreground p-xl">
      <div className="mb-l flex items-baseline justify-between gap-m">
        <h2 className="text-sm font-semibold tracking-tight text-texthard">{title}</h2>
        <span className="shrink-0 font-mono text-[11px] text-textsoft">{source}</span>
      </div>
      {children}
    </section>
  )
}

/** La règle en une phrase, sous les éléments vivants (le « pourquoi » du bloc). */
function Legend({ children }: { children: ReactNode }) {
  return <p className="mt-l text-xs leading-relaxed text-textsoft">{children}</p>
}

// ── Playground de theming — TOUTES les variables, un seul bloc (#406) ────────
// Rémi : au lieu de trois sections (couleurs / theming / rayons-spacing), UN
// bloc qui monte les vrais contrôles de thème et, juste dessous, les 10 rôles
// couleur + 4 rayons + 6 espacements. Changer de thème fait bouger les TROIS
// catégories sous les yeux — la preuve vivante que le contrat de tokens est
// complet : si une variable ne flippe pas ici, c'est qu'un thème l'a oubliée.
const COLOR_ROLES: Record<string, string> = {
  // Sémantiques — les rôles du contrat (design.md §1)
  '--color-active': 'selected / current fill (bg-active) — fill ONLY, no left rule (#395)',
  '--color-rollover': 'row / surface hover — TRANSLUCENT overlay, never selection',
  '--color-action': 'primary button fill — decouplable from accent (#396, GitHub: green)',
  '--color-accent': 'THE attention mark: in_progress, focus ring, gauge fill',
  '--color-foreground': 'surface (card, panel, popup) — and text on Action',
  '--color-background': 'page under surfaces — and recessed field fill',
  '--color-texthard': 'primary ink — text only (no button fill anymore)',
  '--color-textsoft': 'muted / meta text — the contrast floor',
  '--color-border': 'rules, separators, control borders (inset box-shadow)',
  '--color-highlight': 'active-nav mark (#396) — aliases accent (GitHub: coral)',
}

function TokenGrid({ tokens, values }: { tokens: readonly string[]; values: Record<string, string> }) {
  return (
    <div className="grid grid-cols-2 gap-x-xl gap-y-m sm:grid-cols-3">
      {tokens.map((token) => (
        <div key={token} className="flex items-center gap-m">
          <span
            className="shrink-0 p-l ring-1 ring-inset ring-border"
            style={{ backgroundColor: `var(${token})` }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="truncate font-mono text-[11px] text-texthard">{token.replace('--color-', '')}</div>
            <div className="truncate font-mono text-[11px] text-textsoft">{values[token] || '—'}</div>
            <div className="truncate text-[11px] text-textsoft" title={COLOR_ROLES[token]}>{COLOR_ROLES[token]}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Typographie ──────────────────────────────────────────────────────────────
const TYPE_LEVELS: { name: string; cls: string; role: string; sample: ReactNode }[] = [
  { name: 'title', cls: 'text-sm font-semibold tracking-tight', role: 'view / panel / section titles', sample: 'Section title' },
  { name: 'body', cls: 'text-sm', role: 'task titles, doc prose, primary content', sample: 'Ship the design system page' },
  { name: 'label', cls: 'text-xs font-medium', role: 'list headers, buttons, controls', sample: 'In progress' },
  { name: 'field-label', cls: 'text-[11px] font-medium', role: 'panel field labels', sample: 'Depends on' },
  { name: 'meta', cls: 'text-[11px]', role: 'dates / tags / paths — 11px, never 12', sample: '2026-07-23 · epic: theming' },
  { name: 'meta (mono)', cls: 'font-mono text-xs', role: 'ids & inline counts', sample: '#397 · 3/9' },
  { name: 'micro', cls: 'text-[11px]', role: '11px floor — nothing renders smaller', sample: 'smallest text' },
]

function TypographySection() {
  return (
    <Section title="Typography scale" source="design.md §1">
      {/* grid-cols-[max-content_1fr_…] : la colonne des noms prend la largeur du
          plus long libellé (plus de w-24 figé) ; chaque rangée rejoue les colonnes
          du parent via subgrid pour garder l'alignement inter-rangées. */}
      <div className="grid grid-cols-[max-content_1fr_max-content]">
        {TYPE_LEVELS.map((lvl) => (
          <div key={lvl.name} className="col-span-3 grid grid-cols-subgrid items-baseline gap-l py-s shadow-[inset_0_-1px_0_var(--color-border)] last:shadow-none">
            <span className="font-mono text-[11px] text-textsoft">{lvl.name}</span>
            <span className={`min-w-0 truncate text-texthard ${lvl.cls}`}>{lvl.sample}</span>
            <span className="hidden text-[11px] text-textsoft sm:block">{lvl.role}</span>
          </div>
        ))}
      </div>
      <Legend>
        One scale for the whole app: a role picks a named level, never an arbitrary px.
        Two meta registers: non-mono meta (dates, tags, paths) is pinned at{' '}
        <span className="font-mono">text-[11px]</span>; the mono id/count register is{' '}
        <span className="font-mono">text-xs</span>. Nothing smaller than 11px renders.
      </Legend>
    </Section>
  )
}

// ── Rayons & espacements (les tokens de FORME, réglés par thème) ─────────────
const RADIUS_TOKENS = ['--radius-interactive', '--radius-listitem', '--radius-surface', '--radius-round'] as const
const SPACING_TOKENS = ['--spacing-xs', '--spacing-s', '--spacing-m', '--spacing-l', '--spacing-xl', '--spacing-listgap'] as const
// Le contrat COMPLET (#405) : 10 couleurs + 4 rayons + 6 espacements — la liste
// unique que le playground lit d'un seul useTokenValues (une seule relecture
// par bascule de thème, pas trois observers).
const CONTRACT_TOKENS = [...SEMANTIC_TOKENS, ...RADIUS_TOKENS, ...SPACING_TOKENS] as const

const RADIUS_SAMPLES: { token: (typeof RADIUS_TOKENS)[number]; cls: string; label: string; role: string }[] = [
  { token: '--radius-interactive', cls: 'rounded-interactive', label: 'control', role: 'buttons, inputs, toggles, floating menus' },
  { token: '--radius-listitem', cls: 'rounded-listitem', label: 'list row', role: '0 = glued list; a theme raises it' },
  { token: '--radius-surface', cls: 'rounded-surface', label: 'surface', role: 'cards, panels, popups, banners' },
]

/**
 * LA section de tête (#406) : les vrais contrôles de thème pilotent, dans le
 * même bloc visuel, les TROIS catégories de variables du contrat — couleurs,
 * rayons, espacements. Toutes les valeurs affichées sont lues live
 * (useTokenValues), tous les rendus passent par var() : rien en dur.
 */
function ThemingPlaygroundSection() {
  const [theme] = useTheme()
  const [name] = useThemeName()
  const values = useTokenValues(CONTRACT_TOKENS)
  return (
    <Section title="Theming playground — the whole contract, live" source="index.css · ThemePicker.tsx · design.md §1">
      {/* Les VRAIS contrôles (Settings les héberge dans l'app) : les manipuler
          ici re-teinte la page entière — la démo EST le mécanisme. Ils trônent
          en tête pour que tout ce qui suit bouge sous les yeux. */}
      <div className="flex flex-wrap items-center gap-l">
        <div className="flex items-center gap-s">
          <ThemeToggle />
          <ThemePicker />
        </div>
        <span className="font-mono text-[11px] text-textsoft">
          data-theme-name=&quot;{name}&quot; · data-theme=&quot;{theme}&quot;
        </span>
      </div>

      <div className="mt-xl mb-s text-[11px] font-medium text-textsoft">
        Colors (10) — semantic roles: what components call, what themes redefine
      </div>
      <TokenGrid tokens={SEMANTIC_TOKENS} values={values} />

      <div className="mt-xl mb-s text-[11px] font-medium text-textsoft">
        Corner radii (4) — theme-dialled shape
      </div>
      <div className="flex flex-wrap items-stretch gap-xl">
        {RADIUS_SAMPLES.map((s) => (
          <div key={s.token} className="flex flex-col items-center gap-s">
            {/* Plus de h-9 figé : le sample suit son contenu, py-s donne l'air. */}
            <span className={`flex items-center ${s.cls} ring-1 ring-inset ring-border bg-foreground px-m py-s text-xs text-textsoft`}>
              {s.label}
            </span>
            <span className="font-mono text-[11px] text-textsoft">
              {s.token.replace('--radius-', '')} · {values[s.token] || '—'}
            </span>
            <span className="max-w-40 text-center text-[11px] text-textsoft">{s.role}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-s">
          {/* Plus de h-9 w-24 : la jauge remplit la largeur de sa colonne (donnée
              par les libellés) et se centre dans la hauteur alignée (items-stretch). */}
          <span className="flex w-full flex-1 items-center">
            <span className="h-1.5 w-full overflow-hidden rounded-round bg-border">
              <span className="block h-full w-2/3 rounded-round bg-accent" />
            </span>
          </span>
          <span className="font-mono text-[11px] text-textsoft">round · {values['--radius-round'] || '—'}</span>
          <span className="text-[11px] text-textsoft">gauges, status dots, avatars</span>
        </div>
      </div>

      <div className="mt-xl mb-s text-[11px] font-medium text-textsoft">
        Spacing (6) — bars at the token&apos;s real width
      </div>
      {/* Colonne des noms en max-content (largeur du plus long libellé, plus de w-28 figé). */}
      <div className="grid grid-cols-[max-content_max-content_1fr] items-center gap-x-m gap-y-s">
        {SPACING_TOKENS.map((token) => (
          <div key={token} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className="font-mono text-[11px] text-textsoft">{token.replace('--spacing-', '')}</span>
            {/* Barre à la LARGEUR RÉELLE du token (listgap 0 → barre nulle : honnête). */}
            <span className="h-2.5 shrink-0 bg-textsoft" style={{ width: `var(${token})` }} aria-hidden="true" />
            <span className="font-mono text-[11px] text-textsoft">{values[token] || '—'}</span>
          </div>
        ))}
      </div>

      <Legend>
        A theme = these 20 values, nothing else — 10 colors + 4 radii + 6 spacings, set as
        literal values per block (#405), on two ORTHOGONAL{' '}
        <span className="font-mono">&lt;html&gt;</span> axes:{' '}
        <span className="font-mono">data-theme</span> = mode (light/dark),{' '}
        <span className="font-mono">data-theme-name</span> = palette family — 5 built-ins
        (Roadmapped · GitHub · Cursor · Claude · Codex), each with a light AND a dark block.
        Components call SEMANTIC roles, never shades; a hardcoded hex or px is a theming bug.
        Monochrome + ONE accent (its rarity makes it spottable);{' '}
        <span className="font-mono">Rollover</span> is a TRANSLUCENT overlay, never selection;{' '}
        <span className="font-mono">highlight</span> is the 10th key (#396) — the active-nav
        mark, aliased to accent unless a theme splits it (GitHub: coral) — and{' '}
        <span className="font-mono">Action</span> can decouple from accent (GitHub&apos;s
        primary button is green). Text on Action stays Foreground (no on-accent token), so
        every accent must hold ≥4.5:1 in both modes.{' '}
        <span className="font-mono">ListItem</span> + <span className="font-mono">ListGap</span>{' '}
        = the paired list-density tokens (0/0 = glued rows; GitHub or Claude raise both →
        separated cards). Switch themes above — all three categories re-read live.
      </Legend>
    </Section>
  )
}

// ── Liste tokenisée — bordures en box-shadow ─────────────────────────────────
const LIST_TOKENS = ['--spacing-listgap', '--radius-listitem'] as const

function TokenisedListSection() {
  const values = useTokenValues(LIST_TOKENS)
  return (
    <Section title="Tokenised list — borders in box-shadow" source="index.css @layer components · design.md §3.3">
      <div className="rm-list">
        <div className="rm-list-item"><FakeRow id="394" label="First-level row" /></div>
        <div className="rm-list-item"><FakeRow id="397" current label="Selected row — the ring stays visible over bg-active" /></div>
        <div className="rm-list-item">
          <FakeRow id="395" label="Row with a nested group (epic members, release panel)" />
          {/* Même idiome que TaskRow : le groupe imbriqué rejoue rm-list + rm-nest. */}
          <div className="rm-list rm-nest ml-[calc(var(--spacing-xl)_+_var(--spacing-m))]">
            <div className="rm-list-item"><FakeRow id="395.1" label="Nested card" /></div>
            <div className="rm-list-item"><FakeRow id="395.2" label="Cards within cards at ListGap > 0" /></div>
          </div>
        </div>
      </div>
      <p className="mt-s font-mono text-[11px] text-textsoft">
        --spacing-listgap: {values['--spacing-listgap'] || '—'} · --radius-listitem: {values['--radius-listitem'] || '—'}
      </p>
      <Legend>
        Rows are cards (<span className="font-mono">.rm-list-item</span>) whose ring is an
        INSET <span className="font-mono">box-shadow</span> — never the{' '}
        <span className="font-mono">border</span> utility (a 1px border occupies layout width
        and shifts nested content). The ring is painted by an{' '}
        <span className="font-mono">::after</span> ABOVE the content, so it survives an opaque
        selected fill. The <span className="font-mono">calc(ListGap − 1px)</span> collapse
        fuses neighbouring rings into one 1px seam at gap 0 (the glued list); a theme raising{' '}
        <span className="font-mono">ListGap</span>/<span className="font-mono">ListItem</span>{' '}
        separates the SAME DOM into rounded cards, and{' '}
        <span className="font-mono">.rm-nest</span> pads by the same token → cards within
        cards. Try GitHub or Claude in the theming section above.
      </Legend>
    </Section>
  )
}

// ── Primitives ───────────────────────────────────────────────────────────────
function PrimitivesSection() {
  const [on, setOn] = useState(true)
  return (
    <Section title="Primitives" source="ui.tsx · Chip.tsx · design.md §2">
      {/* grid + subgrid : la colonne des libellés prend la largeur du plus long
          (plus de w-28 figé dans Row) ; chaque Row rejoue les colonnes du parent. */}
      <div className="grid grid-cols-[max-content_1fr] gap-x-l gap-y-xl">
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
          {/* UN composant, 3 variants (#419/#420) : padding UNIFORME p-s, texte
              text-xs leading-none (12px), icône TOUJOURS 12 (= cette line-height,
              partagée par les 3) — aucune variation de gabarit selon
              variant/icône/texte ; icône seule = carré 28×28. */}
          <Button variant="primary" icon={Plus}>Primary + icon</Button>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost" icon={Cross} aria-label="Ghost demo" onClick={() => {}} />
        </Row>
        <Row label="Ghost field">
          <div className="flex-1 max-w-64">
            <GhostInput defaultValue="Camouflaged input — hover / focus me" aria-label="Ghost field demo" />
          </div>
          <span className="font-mono text-[11px] text-textsoft">{ghostCls.includes('bg-transparent') ? 'transparent at rest' : ''}</span>
        </Row>
        <Row label="Error banner">
          <div className="w-full max-w-md">
            <ErrorBanner errors={['A meaning-bearing error — accent left rule (inset box-shadow), monochrome body.']} />
          </div>
        </Row>
      </div>
      <Legend>
        Base UI everywhere, zero handmade element. These are the real exports — the page
        renders them, it doesn&apos;t reproduce them. Primary ={' '}
        <span className="font-mono">bg-action text-foreground</span> (blue by default; a
        theme may decouple it, #396). Both button rings are box-shadow, no{' '}
        <span className="font-mono">border</span> utility. In-line variants inside views are a bug.
      </Legend>
    </Section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col-span-2 grid gap-s sm:grid-cols-subgrid sm:items-center">
      <span className="text-[11px] font-medium text-textsoft">{label}</span>
      <div className="flex flex-wrap items-center gap-m">{children}</div>
    </div>
  )
}

// ── Langage de sélection (2 registres) ────────────────────────────────────────
function SelectionSection() {
  const [pressed, setPressed] = useState(true)
  return (
    <Section title="Selection language — two registers" source="design.md §3.2">
      <div className="grid gap-xl sm:grid-cols-2">
        <div>
          <div className="mb-s text-[11px] font-medium text-textsoft">Current row (rowStateClass / CURRENT_ROW)</div>
          <div className="rm-list">
            <div className="rm-list-item"><FakeRow id="397" current label="This row is current" /></div>
            <div className="rm-list-item"><FakeRow id="398" label="This row is idle (hover me)" /></div>
          </div>
          <p className="mt-s text-[11px] text-textsoft">
            <span className="font-mono">bg-active</span> fill ONLY — the left accent rule was
            removed (#395): too Roadmapped-specific, it clashed with the other themes.
          </p>
        </div>
        <div>
          <div className="mb-s text-[11px] font-medium text-textsoft">Enclenched control (TogglePill)</div>
          <div className="flex items-center gap-m">
            <TogglePill active={pressed} onClick={() => setPressed((v) => !v)}>On</TogglePill>
            <TogglePill active={false}>Off</TogglePill>
          </div>
          <p className="mt-s text-[11px] text-textsoft">
            <span className="font-mono">ring-accent</span> + <span className="font-mono">bg-active</span> +
            font-medium — a toggle / filter that is pressed ON (#311).
          </p>
        </div>
      </div>
      <Legend>
        Two registers, each a single primitive: a decorated ROW vs. a pressed CONTROL.{' '}
        <span className="font-mono">Rollover</span> (the translucent overlay) is hover ONLY,
        never selection — and hover NEVER animates a border (#395), only the fill. An inert
        badge must wear neither accent register.
      </Legend>
    </Section>
  )
}

/** Rangée façon TaskRow, décorée par la source UNIQUE rowStateClass (design.md §3.2). */
function FakeRow({ current = false, id = '397', label }: { current?: boolean; id?: string; label?: string }) {
  return (
    <div className={`flex items-center gap-s px-l py-s ${current ? CURRENT_ROW : rowStateClass(false)}`}>
      <StatusGlyph status={current ? 'in_progress' : 'todo'} />
      <span className="font-mono text-[11px] text-textsoft">#{id}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-texthard">
        {label ?? (current ? 'This row is current' : 'This row is idle (hover me)')}
      </span>
    </div>
  )
}

// ── Glyphes ───────────────────────────────────────────────────────────────────
function GlyphsSection() {
  return (
    <Section title="Glyph family" source="design.md §5 · glyphs.tsx">
      <div className="flex flex-wrap gap-x-[calc(var(--spacing-xl)_+_var(--spacing-s))] gap-y-l">
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
      <div className="mb-s text-[11px] font-medium text-textsoft">{title}</div>
      <div className="flex gap-l">
        {items.map(([label, glyph]) => (
          <div key={label} className="flex flex-col items-center gap-xs">
            {glyph}
            <span className="font-mono text-[11px] text-textsoft">{label}</span>
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
      <div className="flex flex-wrap items-center gap-[calc(var(--spacing-xl)_+_var(--spacing-s))]">
        <svg width="220" height="90" viewBox="0 0 220 90" role="img" aria-label="Edge grammar example">
          <title>Solid = explicit relationship, dashed = inferred</title>
          {/* grille décorative — token Border (design.md §5 : zéro neutral-* brut dans un SVG) */}
          <line x1="0" y1="45" x2="220" y2="45" stroke="var(--color-border)" strokeWidth="1" />
          {/* arête PLEINE = relation explicite/connue */}
          <line x1="40" y1="30" x2="110" y2="30" stroke="var(--color-textsoft)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {/* arête POINTILLÉE (3 3) = inférée/faible */}
          <line x1="40" y1="60" x2="110" y2="60" stroke="var(--color-textsoft)" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          {/* nœuds : neutres au repos, accent = LE seul sélectionné */}
          <circle cx="40" cy="30" r="5" fill="var(--color-foreground)" stroke="var(--color-textsoft)" strokeWidth="1.5" />
          <circle cx="110" cy="30" r="5" fill="var(--color-accent)" stroke="var(--color-accent)" strokeWidth="1.5" />
          <circle cx="40" cy="60" r="5" fill="var(--color-foreground)" stroke="var(--color-textsoft)" strokeWidth="1.5" />
          <circle cx="110" cy="60" r="5" fill="var(--color-foreground)" stroke="var(--color-textsoft)" strokeWidth="1.5" />
          <text x="122" y="34" className="fill-textsoft" fontSize="11">explicit — solid</text>
          <text x="122" y="64" className="fill-textsoft" fontSize="11">inferred — dashed</text>
        </svg>
        <ul className="flex flex-col gap-s text-[11px] text-textsoft">
          <li>· solid stroke = explicit / known · dashed <span className="font-mono">3 3</span> = inferred / weak (never the reverse)</li>
          <li>· emphasis is color/ink, not a thicker line — stroke <span className="font-mono">1.5</span> everywhere</li>
          <li>· <span className="font-mono">vector-effect: non-scaling-stroke</span> on every zoomable/responsive stroke</li>
          <li>· accent is rare here too: neutral at rest, accent marks the ONE selected node/series</li>
          <li>· tokenised: grid = <span className="font-mono">Border</span>, edges = <span className="font-mono">TextSoft</span>/<span className="font-mono">TextHard</span> — no raw <span className="font-mono">neutral-*</span> in the SVG</li>
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
      <ViewHeader meta="Design System" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-xl py-[calc(var(--spacing-xl)_+_var(--spacing-s))]">
          <button
            type="button"
            onClick={onBack}
            className="mb-l flex items-center gap-xs rounded-interactive ring-1 ring-inset ring-border bg-foreground px-s py-xs text-xs text-textsoft transition-colors hover:bg-rollover"
          >
            <ChevronLeft size={11} aria-hidden="true" />
            Back
          </button>
          <div className="mb-xl">
            <h1 className="text-sm font-semibold tracking-tight text-texthard">Design System</h1>
            <p className="mt-xs text-xs text-textsoft">
              Living styleguide — rendered from the real components and tokens (not screenshots).
              It mirrors <span className="font-mono">docs/design.md</span>; any future drift shows up
              here first. Reached with <span className="font-mono">g</span> then{' '}
              <span className="font-mono">d</span>; leave with Back or Esc.
            </p>
          </div>
          <div className="flex flex-col gap-xl">
            {/* Le playground d'abord (#406) : tout le contrat de variables sous
                les contrôles de thème ; les sections suivantes montrent des
                COMPOSANTS/patterns, pas des valeurs. */}
            <ThemingPlaygroundSection />
            <TypographySection />
            <TokenisedListSection />
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
