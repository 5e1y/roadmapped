# design.md — Roadmapped's visual source of truth

**Status**: active (#111) · **Fed by**: docs/audit-a11y-2026-07.md (#107-109)
**Enforced by**: #113 (BaseUI), #114 (uniformity), #115 (a11y), #116 (Tailwind)

A Design.md, not a design system: this document settles every token, every canonical
component, and every rule. Any deviation found in the code is a bug, not a variant.
(It will become a system if the app grows — YAGNI today.)

## 1. Tokens

### Semantic tokens — THE theming contract (Rémi)

Components call SEMANTIC tokens (roles), never numeric shades. A **theme = these
values** (color + form). Light/dark are two themes; N more are cheap. Défini dans
`src/index.css` (@theme) ; les tokens couleur aliasent les primitives → ils suivent
le swap clair/sombre sans redéfinition.

**Colors (9)** — `bg-active`, `bg-action`, `text-textsoft`, `border-border`, … (utilitaires Tailwind) :

| Token | Role | Maps from (numeric) |
|---|---|---|
| `Active` | fill of active/selected elements (current row bg, toggle on) | `accent-tint` (bleu clair) |
| `Rollover` | row/surface hover | `neutral-50` |
| `Action` | **primary-button fill (blue)** — replaces the old black button | `accent` |
| `accent` | THE attention mark: left rule on rows, in_progress glyph, active icon/text. Same blue as `Action` but a distinct ROLE (Action = clickable *fill*, accent = a *mark*) | `accent` |
| `Foreground` | surface (card, panel, popup, side) — **and text on `Action`** (flip symmetry: white/#2563eb light ≈ ink/#3b82f6 dark, ~5.8:1 both sides, no `on-accent` token) | `white`/card |
| `Background` | page (under surfaces) | `page` |
| `TextHard` | primary ink — **text only** (no longer any button fill) | `neutral-900` |
| `TextSoft` | muted/meta text (contrast floor #108) ; disabled & decorative fold here | `neutral-500` |
| `Border` | rules, separators, control borders | `neutral-200` |

The intermediate greys (300/400/600/700) collapse into these — that IS the
"alléger". Nothing carries meaning below `TextSoft`'s contrast. **Decision (Rémi):
buttons go black → blue.** The old inverted black button (`bg-neutral-900 text-white`)
becomes `bg-action text-foreground`; the flip symmetry keeps the label readable in
both themes without a dedicated on-accent token. `Active` (light-blue fill) and
`accent` (the blue mark) are the classic selected-row pair: `bg-active` + a left
`accent` rule.

**Radii (4)** — `rounded-interactive`, `rounded-listitem`, `rounded-surface`, `rounded-round` :

| Token | Default | Role |
|---|---|---|
| `Interactive` | 6px | controls: buttons, inputs, toggles, filter menus, zoom bar (merges old 4/6) |
| `ListItem` | 0 | list rows — **0 = glued list by default**; a theme raises it for separated-card lists |
| `Surface` | 8px | cards, panels, popups, banners |
| `Round` | 9999px | gauges, status dots, avatars |

**Spacing (6)** — `p-xs … p-xl`, `gap-listgap`, … : `XS`4 · `S`8 · `M`12 · `L`16 ·
`XL`24 · `ListGap`0. **ListGap = 0 (glued rows) by default**; a theme raises it to
separate list items (paired with `ListItem` radius) — hence the two dedicated tokens.

### Colors — the underlying primitives (mapped above)

The doctrine (Rémi's decision #36, index.css): **the only color is the accent blue**,
reserved for active elements and points of attention. Its rarity makes it spottable.
Everything else is neutral. **No semantic colors** (no amber, no red) — error and
destructive states are expressed through an emphatic monochrome register (see §3).

| Token | Light | Dark (#269) | Role |
|---|---|---|---|
| `--color-accent` | #2563eb | #3b82f6 | Active, selection, in_progress (5.17:1 on white ; #2563eb only 3.5:1 on the dark card → lightened) |
| `--color-accent-tint` | #eef3fd | #1c2636 | Opaque selection background (+ left accent rule) |
| `--color-page` | #fafafa | ≈#0f0f0f | THE body background — its OWN token (split from neutral-50: in dark the page sits *under* the card, while `hover:bg-neutral-50` must stay *above* it) |
| card (`--color-white`) | #ffffff | #171717 | "Card" surfaces: list sides, cards, panels, popups. In dark the light ink becomes the surface |
| rule (`neutral-200`) | #e5e5e5 | ≈#303030 | NON-interactive separator borders |
| ink (`neutral-900`) | #171717 | #f5f5f5 | Primary text (never #fff in dark — no halo) |

**Dark mode is a set of values, not a parallel theme (#269).** The whole neutral scale + `--color-white`/`--color-page`/accent are redefined under `:root[data-theme="dark"]` (index.css) — Tailwind v4 utilities read `var(--color-*)`, so every component flips with zero `dark:` variant and zero conditional class. **Corollary: a hardcoded hex is a dark-mode bug** — all colors live in tokens (SVG glyphs/graph/radar included). The core scale mirrors the canonical oklch values (900 ↔ old 50…), so light rendering is unchanged. Toggle in the header, default = `prefers-color-scheme`, anti-flash script in `index.html`. Full spec: `docs/specs/2026-07-10-dark-mode.md`.

### Gray scale — the contrast rule (audit #108)

A systemic decision, not case by case:

- **`neutral-500` (#737373) is the FLOOR** for all text and all meaning-bearing controls
  on a white/page background (4.74:1 / 4.54:1). `text-neutral-400` and `text-neutral-300`
  on informative content = non-compliant (2.58:1 / 1.48:1), to be promoted.
- On a gray background (`neutral-100`/`200`): floor **`neutral-600`** (#525252).
- `neutral-300`/`400` stay allowed ONLY for the purely decorative (radar grid, rules) —
  never for text, a meaning-bearing icon, or a control.
- `disabled` states: exempt from WCAG, keep the current rendering.
- Micro-text: nothing below 10px; existing 10px to be bumped to 11px (audit §3).

### Corner radii — two radii, one rule

- **`rounded` (4px)**: any control within the body of views and panels (inputs,
  buttons, icon buttons).
- **`rounded-md` (6px)**: reserved for the h-12 header controls (search, "+ task",
  tabs, filters) and floating cards (graph zoom, radar).
- **Square (no radius)**: surfaces (cards, accordions, banners, toasts), chips, and
  list rows (the "backlog row" template). A floating MENU anchored to a header
  control (FilterMenu/KbDisplayMenu popover) follows its trigger's `rounded-md`;
  a standalone popup/banner/toast stays square. No `rounded-lg` anywhere (#380).
- `rounded-full`: progress bars and status dots only.

### Spacing — canonical templates

- Centered content area: `mx-auto max-w-3xl px-6 py-8` (loading/error states included —
  same template as their view's content).
- Fixed left side: `w-[420px]` + `py-2`, inner rows `px-4`.
- Micro-labels: **two levels only** — `text-xs font-medium` for view list headers,
  `text-[11px] font-medium` for panel field labels. Ink:
  `text-neutral-500` (post-promotion). No third register (no `uppercase tracking-wide`).

### Typography scale — named levels (audit §2, #383)

One scale for the whole app; a role picks a level, never an arbitrary px:

| Level | Class | Role |
|---|---|---|
| title | `text-sm font-semibold` (`tracking-tight`) | view/panel/section titles, epic titles |
| body | `text-sm` | task titles, doc prose, primary content |
| label | `text-xs font-medium` | list headers, buttons, controls |
| field-label | `text-[11px] font-medium` | panel field labels |
| meta | dates/tags/paths/ages `text-[11px]` · monospace ids & inline counts `text-xs` | Metadata. The 11/12 drift to fix is the NON-mono meta (dates/tags/paths) that wandered to 12px → pin at 11px; the mono `#id`/count register is already consistent at `text-xs` — leave it |
| micro | 10px floor → 11px | nothing smaller than 11px renders |

### Vertical rhythm — one row height

List rows share ONE height (`px-4 py-2`); no ad-hoc `py-[5px]`/`py-2.5` variants.
A task card is identical in Roadmap columns and the Dependencies graph.

## 2. Canonical components — Base UI everywhere, zero handmade element

Most live in `src/components/ui.tsx` (the exceptions, still canonical: `Chip` in
`src/components/Chip.tsx`, re-exported through `ui.tsx`; `FilterMenu` in
`src/components/ViewHeader.tsx`). In-line variants inside views are forbidden.

| Need | Canonical component | Notes |
|---|---|---|
| Dropdown/select | `Select` (Base UI) — skins `fieldCls` / `ghost` / `compact` | The native `<select>` is forbidden (last holdout: MiniZone → #113) |
| Adding a relation | `AddCombobox` (Base UI) | Post-add focus fix: #115 |
| Multi tags + cross | `TagsCombobox` / `MultiCombobox` (Base UI Creatable) | ChipRemove cross: compliant Base UI pattern (tabIndex=-1 + ←/→ Backspace) — do not "fix" it |
| Visible text field | `fieldCls` | Border: keep neutral-300 + differentiate via `bg-neutral-50` (audit's option B, less brutal than border-500) |
| Camouflaged text field | `ghostCls` / `GhostInput` | THE ghost pattern (§3) — every field "invisible at rest" uses it, including the inline-editable epic title and the `heat` boost input in the panel |
| Error | `ErrorBanner` (+ `Toast` for the ephemeral) | role=alert, left border neutral-900 — DocsView and MiniZone fall in line (#113) |
| Popover/filters | `FilterMenu` (Base UI Popover) | Never use `Popover.Close disabled` (it makes the option inert) |
| Metadata chip | `Chip` | The `code`/`size` chips on task rows and cards (same rendering in Backlog and Roadmap). Temperature is NOT a chip — it's the `TempBadge` thermometer (§ Temperature exception) |
| Buttons | Panel primary: `rounded border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700` · Secondary: `actionBtn` (hover `bg-neutral-100`) · Header: same colors in `rounded-md` | The "inverted" hover (light→solid black) is forbidden; "Delete" = secondary (global destructive register: no — YAGNI, monochrome by design) |

## 3. Rules

1. **Strict three-layer**: page #fafafa (body, never redeclared by a view) / card
   #ffffff / rules #e5e5e5. A view NEVER sets `bg-white` on its root — the
   ViewHeader must be identical across all 4 tabs. No hardcoded background hex in the
   className (RoadmapColumns' sticky `bg-[#fafafa]` → utility/var).
2. **"Active/selected" language — TWO registers, each a primitive (#380/#381)**:
   - **Current row** (an item open in the panel, a selected list entry): `bg-active`
     FILL ONLY. The left accent rule (`shadow-[inset_2px_0_0_…]`) was **removed**
     (#395, Rémi): too much of a Roadmapped-specific marker, it clashed with the
     other themes. Source: `rowStateClass(isCurrent)` in `ui.tsx` — used by TaskRow,
     the Roadmap cards, the Overview preview, the Activity feed, Docs tree, etc.
     NEVER re-inline it per view.
   - **Enclenched control** (a toggle/filter that is ON — #311): ring-accent +
     `bg-active` + `font-medium`. Source: `TogglePill` in `ui.tsx`.
   Gray Rollover is hover ONLY, never selection. An INERT element (a static warning
   badge) must NOT wear either register.
   **Hover NEVER animates a border** (#395, Rémi): a row/card hover changes the FILL
   to `Rollover` only. Animating a border colour (the old `hover:border-neutral-400`)
   is banned.
3. **Borders are `box-shadow`, never the `border` utility** (#395, Rémi): a rule must
   NOT occupy width in the DOM (a 1px `border` shifts nested layouts by 1px per level).
   Cards/rows use the inset-ring utilities `.rm-list` / `.rm-list-item` / `.rm-list-row`
   / `.rm-nest` (index.css, `@layer components`): `box-shadow: inset 0 0 0 1px Border`,
   radius = `--radius-listitem`, gap = `--spacing-listgap`. Standalone cards (graph
   nodes) use Tailwind `ring-1 ring-inset ring-border`. Border colour is `Border`, or
   `accent` when active/focused — never a raw neutral shade. **Lists are token-driven**:
   at `ListGap` 0 rows are glued (rings collapse to one 1px seam); at `ListGap` > 0 they
   separate into `ListItem`-rounded cards, and nested groups (epic members, release
   panels, the epic band) inset into "cards within cards". Same tokens everywhere → one
   theme dials the density of the whole app.
4. **Ghost input pattern** (Rémi's decision, settled): editable fields are PERMANENT
   camouflaged inputs (`ghostCls`) — invisible at rest, hover `bg-rollover`, focus
   ring + surface background. **Never** a read→input swap, never a pencil step.
5. **Focus**: visible everywhere (the global `:focus-visible` is authoritative;
   neutralizing it via `focus:outline-none`/inline without a replacement is forbidden). A
   control revealed on hover ALSO reveals on focus (`focus-visible:opacity-100`). After an
   action that unmounts the focused element (delete, add, exit edit), focus is explicitly
   REPLACED (next row, combobox input, panel container) — never abandoned on body.
6. **Keyboard**: everything interactive is a `<button>` (or handled by Base UI). A
   `role="button"` responds to Enter AND Space. No mouse-only clickable zone carrying a
   non-redundant action.
7. **Monochrome**: any color outside accent/neutrals is a bug (the Notepad's amber and red
   → removed in #113).

## 4. States — empty / loading / error (#384)

- **The header never disappears.** Loading and error render INSIDE the view shell
  (`<ViewShell>`): the `ViewHeader` (theme toggle, report-a-bug) stays reachable.
- **Loading**: `Loading…` in the centered template (`mx-auto max-w-3xl px-6 py-8`).
- **Empty**: ONE `<EmptyState>` — centered, optional glyph + a title
  (`text-sm font-medium text-neutral-700`) + an optional one-line hint
  (`text-xs text-neutral-500`). Same register on every view.
- **Error**: `ErrorBanner` (role=alert, left rule neutral-900) or the shared
  `TreeStateGuard` for tree-load failures — one pattern, never ad hoc. A view must
  never be a silent blank when the server is unreachable (Overview honors loadError).
- **Language**: the UI is English (Rémi's decision). Ticket/doc CONTENT is verbatim.

## 5. Data-viz & iconography (#386)

The radar, the created-vs-closed area chart, the KB graph and the Dependencies
graph are ONE visual family:

- **Edge semantics — universal**: a SOLID stroke = an explicit/known relationship;
  a DASHED stroke (`3 3`) = inferred/weak. (KB: EXTRACTED solid, INFERRED dashed;
  Dependencies: explicit `dependsOn` are SOLID.) Never the reverse.
- **Emphasis stroke**: `1.5` everywhere; emphasis is carried by color/ink, not by a
  thicker or dashed line.
- **`vector-effect="non-scaling-stroke"`** on every stroke inside a zoomable or
  responsive SVG (graphs, chart) — line weight is constant regardless of zoom/size.
- **Accent is rare here too**: a viz is neutral at rest; accent marks the ONE
  highlighted/selected series or node only (radar polygon is neutral unless selected).
- **Grid/axes**: `neutral-200`, decorative only.
- **Glyph family**: status = circle (todo hollow / in_progress half / done full),
  milestone = diamond, epic = square — `currentColor`, stroke via tokens, one trait
  weight. Icons come from `trinil-react`; no bespoke one-off icon set.
</content>
</invoke>
