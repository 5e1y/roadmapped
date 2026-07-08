# design.md — Roadmapped's visual source of truth

**Status**: active (#111) · **Fed by**: docs/audit-a11y-2026-07.md (#107-109)
**Enforced by**: #113 (BaseUI), #114 (uniformity), #115 (a11y), #116 (Tailwind)

A Design.md, not a design system: this document settles every token, every canonical
component, and every rule. Any deviation found in the code is a bug, not a variant.
(It will become a system if the app grows — YAGNI today.)

## 1. Tokens

### Colors — monochrome + ONE accent

The doctrine (Rémi's decision #36, index.css): **the only color is the accent blue**,
reserved for active elements and points of attention. Its rarity makes it spottable.
Everything else is neutral. **No semantic colors** (no amber, no red) — error and
destructive states are expressed through an emphatic monochrome register (see §3).

| Token | Value | Role |
|---|---|---|
| `--color-accent` | #2563eb | Active, selection, in_progress (5.17:1 on white — compliant) |
| `--color-accent-tint` | #eef3fd | Opaque selection background (+ left accent rule) |
| page | #fafafa (neutral-50) | THE page background, inherited from the body, **never redeclared** |
| card | #ffffff | "Card" surfaces: list sides, cards, panels, popups |
| rule | #e5e5e5 (neutral-200) | NON-interactive separator borders |
| ink | #171717 (neutral-900) | Primary text |

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
- **Square (no radius)**: surfaces (cards, accordions, popups, banners, toasts),
  chips, and list rows (the "backlog row" template).
- `rounded-full`: progress bars only.

### Spacing — canonical templates

- Centered content area: `mx-auto max-w-3xl px-6 py-8` (loading/error states included —
  same template as their view's content).
- Fixed left side: `w-[420px]` + `py-2`, inner rows `px-4`.
- Micro-labels: **two levels only** — `text-xs font-medium` for view list headers,
  `text-[11px] font-medium` for panel field labels. Ink:
  `text-neutral-500` (post-promotion).

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
| Camouflaged text field | `ghostCls` / `GhostInput` | THE ghost pattern (§3) — every field "invisible at rest" uses it, including the mini quick-add title |
| Error | `ErrorBanner` (+ `Toast` for the ephemeral) | role=alert, left border neutral-900 — DocsView and MiniZone fall in line (#113) |
| Popover/filters | `FilterMenu` (Base UI Popover) | Never use `Popover.Close disabled` (it makes the option inert) |
| Metadata chip | `Chip` | Including the team badge on Roadmap cards (same data = same rendering as the Backlog) |
| Buttons | Panel primary: `rounded border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700` · Secondary: `actionBtn` (hover `bg-neutral-100`) · Header: same colors in `rounded-md` | The "inverted" hover (light→solid black) is forbidden; "Delete" = secondary (global destructive register: no — YAGNI, monochrome by design) |

## 3. Rules

1. **Strict three-layer**: page #fafafa (body, never redeclared by a view) / card
   #ffffff / rules #e5e5e5. A view NEVER sets `bg-white` on its root — the
   ViewHeader must be identical across all 4 tabs. No hardcoded background hex in the
   className (RoadmapColumns' sticky `bg-[#fafafa]` → utility/var).
2. **Universal "active/selected" language**: `bg-accent-tint` + left rule
   `shadow-[inset_2px_0_0_var(--color-accent)]`. Gray `bg-neutral-100` is reserved for
   hover — never for selection (single deviant: DocsTree → #113).
3. **Ghost input pattern** (Rémi's decision, settled): editable fields are PERMANENT
   camouflaged inputs (`ghostCls`) — invisible at rest, hover `bg-neutral-100`, focus
   border + white background. **Never** a read→input swap, never a pencil step.
4. **Focus**: visible everywhere (the global `:focus-visible` is authoritative;
   neutralizing it via `focus:outline-none`/inline without a replacement is forbidden). A
   control revealed on hover ALSO reveals on focus (`focus-visible:opacity-100`). After an
   action that unmounts the focused element (delete, add, exit edit), focus is explicitly
   REPLACED (next row, combobox input, panel container) — never abandoned on body.
5. **Keyboard**: everything interactive is a `<button>` (or handled by Base UI). A
   `role="button"` responds to Enter AND Space. No mouse-only clickable zone carrying a
   non-redundant action.
6. **Monochrome**: any color outside accent/neutrals is a bug (the Notepad's amber and red
   → removed in #113).
</content>
</invoke>
