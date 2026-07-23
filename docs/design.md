# design.md — Roadmapped's visual source of truth

**Status**: active (#111) · **Fed by**: docs/audit-a11y-2026-07.md (#107-109)
**Enforced by**: #113 (BaseUI), #114 (uniformity), #115 (a11y), #116 (Tailwind)
**Refonte #395** (theming multi-thème + repasse DS « alléger ») : tokens sémantiques,
thèmes intégrés (4 today — Codex removed), bordures en box-shadow, focus accent unique,
header global + Settings + feed Activity. Deux audits adversariaux (tokens statiques +
états d'interaction). **#396** : 10e couleur `Highlight`, Action découplable de l'accent.
**#405** : plus de primitives — chaque thème pose ses 10 rôles en littéral.

A Design.md, not a design system: this document settles every token, every canonical
component, and every rule. Any deviation found in the code is a bug, not a variant.
(It will become a system if the app grows — YAGNI today.)

## 1. Tokens

### Semantic tokens — THE theming contract (Rémi)

Components call SEMANTIC tokens (roles), never raw values. A **theme = these
values** (color + form). Light/dark are two themes; N more are cheap. Defined in
`src/index.css` (`@theme`). **There is no primitive layer (#405)**: the old
position-named primitives (`neutral-50…900`, `--color-page`, `--color-white`,
`accent-tint`) were deleted — every theme block, the base `@theme` included, poses
its roles as LITERAL values. **A theme = these 10 values, literally.** The only
indirection left is role→role: `Action` and `Highlight` alias the `accent` ROLE by
default (resolved against the element's cascaded tokens, so they follow dark mode
and themes without redeclaration) until a theme decouples them.

**Colors (10)** — `bg-active`, `bg-action`, `text-textsoft`, `border-border`, … (Tailwind utilities):

| Token | Role | Base value (light · dark) |
|---|---|---|
| `Active` | fill of active/selected elements (current row bg, toggle on) — FILL only, no left rule (#395) | `#eef3fd` · `#1c2636` |
| `Rollover` | row/surface hover — a translucent overlay, never selection | `rgb(0 0 0 / .045)` · `rgb(255 255 255 / .06)` |
| `Action` | **primary-button fill** — aliases `accent` by default; a theme may DECOUPLE it (#396, GitHub: green) | `var(--color-accent)` |
| `accent` | THE attention mark: in_progress glyph, active icon/text, focus ring, gauge fill. Same value as `Action` by default but a distinct ROLE (Action = clickable *fill*, accent = a *mark*) | `#2563eb` · `#3b82f6` |
| `Foreground` | surface (card, panel, popup, side) — **and text on `Action`** (flip symmetry: white/#2563eb light ≈ ink/#3b82f6 dark, ~5.8:1 both sides, no `on-accent` token) | `#ffffff` · `oklch(0.205 0 0)` ≈ #171717 |
| `Background` | page (under surfaces) — **and recessed field fill** | `#fafafa` · `oklch(0.168 0 0)` ≈ #0f0f0f |
| `TextHard` | primary ink — **text only** (no longer any button fill) | `oklch(0.205 0 0)` · `oklch(0.97 0 0)` ≈ #f5f5f5 |
| `TextSoft` | muted/meta text (contrast floor #108) ; disabled & decorative fold here | `oklch(0.556 0 0)` · `oklch(0.708 0 0)` |
| `Border` | rules, separators, control borders | `oklch(0.922 0 0)` · `oklch(0.31 0 0)` |
| `Highlight` | active-nav mark (#396) — aliases `accent` by default; a theme whose real DS separates the nav mark from the accent redefines it alone (GitHub: coral) | `var(--color-accent)` |

The old intermediate greys (300/400/600/700) collapsed into these roles — that IS
the "alléger"; #405 then deleted the numeric scale itself. Nothing carries meaning
below `TextSoft`'s contrast. **Decision (Rémi): buttons go black → blue.** The old
inverted black button becomes `bg-action text-foreground`; the flip symmetry keeps
the label readable in both themes without a dedicated on-accent token. **Selected/
current = `bg-active` FILL ONLY** — the old left accent rule was removed (#395):
too Roadmapped-specific, it clashed with the other themes. `Rollover` is a
**translucent overlay** (a light black veil in light mode, a white veil in dark),
not an opaque grey: it must show on the grey `Background` page as well as on a
white card.

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

### Theming — multi-theme, one contract

The token layer above is the theming contract. A **theme = a set of these token
values** (colour + shape/density), posed as literals in its own CSS block. It lives
on TWO orthogonal `<html>` axes: `data-theme` = **mode** (light/dark),
`data-theme-name` = **palette family**. They compose. Both are set before first
paint by the anti-flash script (`index.html`) and persisted (`ui:theme`,
`ui:theme-name`).

- **4 built-in themes** (`src/index.css`; the list is `THEME_NAMES` in
  `src/state/theme.ts`): **Roadmapped** (base) · **GitHub** · **Cursor** ·
  **Claude**. Roadmapped = no block (the base `@theme` + the base dark block ARE
  the theme). Each other theme re-poses only the keys of its *identity kit* —
  accent, Active, surfaces, Border, radii/spacing, plus Action/Highlight/inks when
  its real DS calls for it (GitHub re-pins Primer's cold inks; Claude keeps the
  base inks) — anything not re-posed falls through to the base values. Each theme
  ships a light block AND a dark block (`[data-theme-name][data-theme="dark"]`,
  2 attributes so it beats the base dark block) re-posing the SAME colour keys;
  radii/spacing, mode-independent, are posed once in the light block.
- **Action may be DECOUPLED from accent** (#396): a theme whose real DS separates
  the primary button from the attention mark re-poses `--color-action` alone.
  GitHub is the living example — blue accent (`#0969da`, marks/links) but a GREEN
  `Action` (`#1a7f37` light / `#3fb950` dark, Primer's btn-primary). Same
  mechanism for `Highlight`: GitHub's active-nav mark is coral (`#fd8c73` /
  `#f78166`), like its tab underline.
- **Constraint on any new accent/Action**: text on `Action` stays `Foreground` (no
  on-accent token), so each value must hold ≥4.5:1 — the LIGHT one against the
  light card, the DARK one against the dark card.
- **Dark mode is a value swap, not a parallel theme (#269)** — zero `dark:` variant, a
  hardcoded hex is a dark-mode bug (SVG glyphs/graph/radar included).
- Switched from the **Settings** view (rail, bottom), NOT the header.

### Color doctrine — one accent, monochrome elsewhere

The doctrine (Rémi's decision #36, index.css): **the only color is the accent**,
reserved for active elements and points of attention. Its rarity makes it spottable.
Everything else is neutral. **No semantic colors** (no amber, no red) — error and
destructive states are expressed through an emphatic monochrome register (see §3).

**Dark mode is a set of values, not a parallel theme (#269).** The semantic roles
are re-posed under `:root[data-theme="dark"]` (index.css) — Tailwind v4 utilities
read `var(--color-*)`, so every component flips with zero `dark:` variant and zero
conditional class (`Action`/`Highlight`, role→role aliases, follow for free).
**Corollary: a hardcoded hex is a dark-mode bug** — all colors live in tokens (SVG
glyphs/graph/radar included). The dark tri-layer is INVERTED, not naïve: page
≈#0f0f0f *under* the card #171717 (the light ink becomes the surface), ink #f5f5f5
— never #fff (no halo) — and the accent is lightened (#2563eb holds only 3.5:1 on
the dark card → #3b82f6). Default = `prefers-color-scheme`, anti-flash script in
`index.html`, mode toggle in Settings. Full spec: `docs/specs/2026-07-10-dark-mode.md`.

> Historical note: before #405 these roles aliased a layer of position-named
> primitives (`neutral-50…900`, `--color-page`, `--color-white`, `accent-tint`).
> That layer is gone — any `neutral-*` reference in code or docs is stale.

### Muted ink — the contrast rule (audit #108)

A systemic decision, not case by case:

- **`TextSoft` is the FLOOR** for all text and all meaning-bearing controls. The
  base values hold it (light `oklch(0.556 0 0)` ≈ #737373: 4.74:1 on the white
  card / 4.54:1 on the page; dark `oklch(0.708 0 0)`: ~7.1:1 on the card), and a
  theme that greys its card re-pins the value to keep the floor (GitHub `#59636e`,
  Cursor `#5f5f5f`). Nothing meaning-bearing renders below it — the old
  sub-threshold greys were promoted, then deleted with the scale (#405).
- Purely decorative strokes (radar grid, rules) use `Border` — never text, a
  meaning-bearing icon, or a control.
- `disabled` states: exempt from WCAG; they fold into `TextSoft` (see the table).
- Micro-text: nothing below 11px renders (audit §3).

### Corner radii — the 4 semantic radii (supersedes the old 4/6px rule)

Radii are now the 4 tokens above (`Interactive` / `ListItem` / `Surface` / `Round`),
theme-dialled — NOT the old hardcoded `rounded`/`rounded-md`. Mapping: any control
(button, input, toggle, **floating menu** — Select/Combobox/Popover popups) →
`rounded-interactive`; card/panel/banner/toast → `rounded-surface`; list row →
`rounded-listitem`; gauge/dot/avatar → `rounded-round`. No `rounded-lg` anywhere (#380).

### Spacing — canonical templates

- Centered content area: `mx-auto max-w-3xl px-6 py-8` (loading/error states included —
  same template as their view's content).
- Fixed left side: `w-[420px]` + `py-2`, inner rows `px-4`.
- Micro-labels: **two levels only** — `text-xs font-medium` for view list headers,
  `text-[11px] font-medium` for panel field labels. Ink:
  `text-textsoft`. No third register (no `uppercase tracking-wide`).

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
| Visible text field | `fieldCls` | Recessed well: `bg-background` + `ring-1 ring-inset ring-border`; focus lifts to `bg-foreground` (the single accent `:focus-visible` outline is the focus mark — no per-field ring) |
| Camouflaged text field | `ghostCls` / `GhostInput` | THE ghost pattern (§3) — every field "invisible at rest" uses it, including the inline-editable epic title and the `heat` boost input in the panel |
| Error | `ErrorBanner` (+ `Toast` for the ephemeral) | role=alert; left rule via `shadow-[inset_3px_0_0_var(--color-accent)]` (box-shadow, not `border`) on a `rounded-surface` card |
| Popover/filters | `FilterMenu` (Base UI Popover) | Never use `Popover.Close disabled` (it makes the option inert) |
| Metadata chip | `Chip` | The `code`/`size` chips on task rows and cards (same rendering in Backlog and Roadmap). Temperature is NOT a chip — it's the `TempBadge` thermometer (§ Temperature exception) |
| Buttons | `Button` (#419/#420) — ONE component, 3 variants: `primary` (`bg-action text-foreground hover:brightness-95`, `Action` fill) · `secondary` (`ring-1 ring-inset ring-border` + `hover:bg-rollover`) · `ghost` (no fill, `hover:bg-rollover`). Single template: uniform `p-s` padding, `text-xs leading-none` (12px), icon ALWAYS 12px = the text line-height (`BUTTON_ICON_SIZE`); `icon` and `children` each optional and combinable (icon-only = 28×28 square) | "Delete" = secondary (global destructive register: no — YAGNI, monochrome by design). No `border` utility (box-shadow ring). Never a per-callsite icon size or padding override; composes into Base UI via `render={<Button …/>}` (Toast.Close) |

## 3. Rules

1. **Strict three-layer** (via tokens): `Background` (page, body — never redeclared by
   a view) / `Foreground` (card) / `Border` (rules). A view NEVER sets a surface colour
   on its root; the header is identical on every view. No hardcoded background hex.
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
   theme dials the density of the whole app. The ring is painted by a `::after`
   pseudo-element (`.rm-list-item` / `.rm-node`), ABOVE the content — a plain inset
   box-shadow on a container is covered by an opaque child (a selected row's `bg-active`)
   and the border vanishes on the active item. `.rm-node` = the same ring for a
   container whose children are opaque (the Deps epic node), without `overflow-hidden`
   (which would clip the children's focus outline).
4. **Ghost input pattern** (Rémi's decision, settled): editable fields are PERMANENT
   camouflaged inputs (`ghostCls`) — invisible at rest, hover `bg-rollover`, focus
   ring + surface background. **Never** a read→input swap, never a pencil step.
5. **Focus — ONE indicator** (#395): the global `:focus-visible` outline, in **accent**
   (`@layer base`, index.css). A focusable element must NOT add its own `focus:ring`/
   `focus:border` — that doubles the indicator. `outline-color` is pinned to accent on
   `*` so a `transition`/`transition-colors` never animates it (no black→blue flash);
   for the same reason a focusable element uses a TARGETED transition (`transition-[…]`),
   never bare `transition`. Composite widgets (chips-combobox) may carry a
   `focus-within` ring on the box and silence the inner input's outline (`focus:outline-none`).
   A control revealed on hover ALSO reveals on focus. After an action that unmounts the
   focused element (delete, add, exit edit), focus is explicitly REPLACED — never on body.
6. **Keyboard**: everything interactive is a `<button>` (or handled by Base UI). A
   `role="button"` responds to Enter AND Space. No mouse-only clickable zone carrying a
   non-redundant action.
7. **Monochrome**: any color outside accent/neutrals is a bug (the Notepad's amber and red
   → removed in #113).

## 4. Shell — header, navigation, settings, activity (#395)

- **Header (global, identical on every view)** — 3-column grid `[1fr auto 1fr]`:
  title `Roadmapped × repo` (left), the **search bar CENTERED**, `+ task` immediately
  to its right (never far-right). Search + `+ task` are GLOBAL (present on all views,
  `ViewHeader` + `search.tsx`): focusing search navigates to Backlog (the only view
  that filters) and re-focuses the new input after the view switch. Nothing else in the
  header — theme, report-a-bug and the update banner moved OUT.
- **NavRail** (left): the views, then **Settings** pinned at the bottom (gear).
- **Settings view** = the home of the cross-cutting controls that used to clutter the
  header: theme **mode** (light/dark/system) + **theme** (4 built-in), report-a-bug,
  update banner.
- **Activity** = a **feed**, NOT full-width rows: a 400px centred column of event CARDS
  (icon + verb + `#id` + time; the ticket title; then a preview — the status transition
  `from → to`, or the created ticket's type/tags/temperature). Session only; the durable
  history is `git log` over `docs/tasks/`.

### States — empty / loading / error (#384)

- **The header never disappears** during loading/error (rendered inside `<ViewShell>`).
- **Loading**: `Loading…` in the centered template (`mx-auto max-w-3xl px-6 py-8`).
- **Empty**: ONE `<EmptyState>` — centered, optional glyph + a title
  (`text-sm font-medium text-texthard`) + an optional one-line hint (`text-xs text-textsoft`).
- **Error**: `ErrorBanner` (role=alert, inset-accent left rule) or the shared
  `TreeStateGuard` for tree-load failures — one pattern. A view is never a silent blank
  when the server is unreachable (Overview honors loadError).
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
  highlighted/selected series or node only (radar polygon is neutral; its labels are
  read-only — the selection filtered nothing, removed #395). The Created line is
  `TextSoft`, the Closed line `accent`.
- **Grid/axes/strokes**: tokenised — `Border` for the grid, `TextSoft`/`TextHard` for
  edge strokes; no raw `neutral-*` in the SVG. Chart axis labels are HTML overlays
  (fixed px), not SVG `<text>` (which the viewBox scales — the huge "116" bug, #395).
- **Glyph family**: status = circle (todo hollow / in_progress half / done full),
  milestone = diamond, epic = square — `currentColor`, stroke via tokens, one trait
  weight. Icons come from `trinil-react`; no bespoke one-off icon set.
</content>
</invoke>
