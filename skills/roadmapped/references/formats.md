# Roadmapped — canonical formats

Any deviation from these formats is rejected by validation (`task.mjs validate`, run automatically after every CLI/API write, with rollback).

## Directory tree

`docs/tasks/` contains **exactly the 9 canonical types** below — the fixed
NATURE of a task (fusion of the old "stage" and "team" axes into one). No
other section folder is allowed: `validate` rejects a 10th folder, a
non-canonical slug, or a missing type.

| Folder | Canonical title | Spirit (default note at init) |
|---|---|---|
| `01-bug` | Bugs | Something is broken or doesn't behave as promised — product, site, tool, any surface. |
| `02-feature` | Features | Code/product that adds a user-visible capability. |
| `03-chore` | Chores | Code/infra that adds nothing visible: refactor, debt, deps, CI, tooling, migrations, monitoring. |
| `04-brainstorm` | Brainstorms | Thinking before doing: specs, research, benchmarks, decisions, plans. |
| `05-design` | Design | Visual and UX artefacts: logo, mockups, design system, illustrations, UX. |
| `06-marketing` | Marketing | Acquiring: site, copy, SEO, campaigns, positioning, growth. |
| `07-communication` | Communication | Talking to the world: posts, announcements, newsletter, public changelog, community, user support. |
| `08-legal` | Legal | Compliance and legal: ToS, privacy, licences, contracts, structure, filings. |
| `09-business` | Business | Money and direct clients: pricing, billing, accounting, prospecting, deals, partnerships. |

The `01`→`09` order is a **display order only** — it encodes no priority (priority is the computed temperature, see § Temperature below). No 10th folder, no renaming, no reordering by convention: it's fixed the same way the old 8 stages were.

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — global monotonic counter, NEVER hand-edited
├── _epics.yaml                 # optional — epic declarations (readable title; NOT an order — see § Epics)
├── 01-bug/                     # canonical type, created at setup — never hand-created/renamed
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # one task = one file
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # TWIN folder, same name = subtasks of 02-<slug>.yaml
│       └── 01-<slug>.yaml
├── 02-feature/
├── 03-chore/
├── 04-brainstorm/
├── 05-design/
├── 06-marketing/
├── 07-communication/
├── 08-legal/
└── 09-business/
```

An empty type (no tasks) stays present — it shows dimmed in the dashboard,
it never disappears.

## Which type? — first match wins (classify the DELIVERABLE, not the purpose or the doer)

A task's type is the nature of what it produces, never the goal it serves nor who does it: a logo serves marketing, but it's a visual artefact → `design`. Walk the tree top to bottom, first match wins (a task that could match two rules takes the higher one):

1. Something is **broken** (regression, doesn't behave as promised), any surface — product, marketing site, CLI, docs → **bug**.
2. The deliverable is a **reflection/decision document** (spec, brainstorm, research, benchmark, strategic plan) → **brainstorm**.
3. The deliverable is a **visual/UX artefact** (logo, mockup, design system, illustration, pixel-art, art direction) → **design**.
4. The deliverable is **legal** (ToS, privacy, licence, contract, trademark filing, company structure) → **legal**.
5. The deliverable touches **money or a direct client relationship** (pricing, billing on the offer side, accounting, prospecting, a deal, a partnership) → **business**.
6. The deliverable is **outward-facing content**: durable acquisition (site page, copy, SEO, campaign, growth asset) → **marketing**; informs or animates (post, announcement, newsletter, public changelog, a reply to a user, community animation) → **communication**.
7. Otherwise it's code/product: adds a **user-visible capability** (embedded product docs count) → **feature**; doesn't (refactor, debt, deps, CI, tooling, migration, monitoring) → **chore**.

Worked edge cases:

| Task | Type | Why |
|---|---|---|
| A bug on the marketing site | **bug** | Rule 1 first: broken is broken, the surface doesn't matter. |
| "Write the docs" (product guide, README) | **feature** | Embedded docs = a visible product capability (rule 7a). |
| A technical blog post | **marketing** or **communication** | Rule 6: built for SEO/acquisition → marketing; a mood post/announcement → communication. |
| Design a logo | **design** | Canonical example of rule 3. |
| The pricing page copy | **marketing** | Copy/acquisition (6a). But "wire up Stripe" → feature (7a), and "set the price grid" → business (5). |
| Set up the legal entity | **legal** | Rule 4 (compliance paperwork), even though the goal is business. |
| Set up the support inbox | **feature** | Building a capability (7a). Answering it every week → communication (6b). |
| Migrate CI to GitHub Actions | **chore** | Nothing visible (7b). |
| A `kind: milestone` that aggregates several types | the type of its **own final gesture** | A milestone lives in one column like everyone else; "announce the launch" → communication, "v1 on the stores" → feature. Cross-cutting is the job of the `epic`, never of the milestone. |

## Task — full schema, CANONICAL field order

```yaml
id: 42                    # allocated by the CLI from _meta.yaml — never chosen by hand
kind: milestone           # ADDITIVE — absent = task (default). milestone = MILESTONE (see § Milestones). ('quick' removed #250.)
code: B3                  # optional, short human code (null otherwise)
title: "Task title"
status: todo              # todo | in_progress | done — NOTHING else
tags: [bug, perf]         # free-form, [] if none
size: M                   # S | M | L | null
heat: null                # OPTIONAL priority seed, 0-100 (2 decimals max) — null/absent = cold. See § Temperature.
detail: |
  The WHAT and the WHY, known pitfalls, the definition of done.
refs:                     # relevant files: code (path:line) AND documentation
  - src/lib/foo.ts:120
  - docs/specs/2026-07-07-my-feature.md
  - docs/ARCHITECTURE.md
links: []                 # ids of other related tasks (context, not order)
dependsOn: [12, 45]       # PREREQUISITE ids — the task is locked until they're done
epic: null                # cross-type GROUPING: slug shared by tasks of the same project (e.g. graph-revamp) — see § Epics. UNORDERED.
source: ai                # user | ai — who created the task
createdAt: "2026-07-07"
completedAt: null         # set automatically on transition to done
commit: null              # sha of the delivery commit (logged by done --commit)
outcome: null              # WHAT WAS DELIVERED, a user-facing sentence (done --outcome) — changelog material
verification: null        # HOW the artefact was verified (done --verification)
release: null              # release version if applicable
```

Enforced invariants: ids unique globally; every `dependsOn` id exists; no self-dependency; acyclic `dependsOn` graph; `epic` is a slug (lowercase/digits/hyphens) or null — NO declaration required; `heat` absent/null (cold) or a number `0 ≤ heat ≤ 100` with at most 2 decimals; **`team` is FORBIDDEN** on any active task (#230 — removed from the model; `_archive/` is never re-validated and keeps its old `team:`).

**`milestone` backward compat (#133)**: a YAML's old `milestone:` field is READ as `epic` and migrates automatically on the next dump; the CLI flag `--milestone` remains a deprecated alias for `--epic` (prints a deprecation warning, still applies the write). Never write `milestone:` in a YAML again.

## Type — `_section.yaml`

```yaml
title: "Bugs"
status: open              # open | done | dormant | abandoned
baseHeat: 30               # OPTIONAL, 0-33.33 — the type's starting heat (the `base` tier of temperature). Absent = code default (DEFAULT_BASE_HEAT) for this slug.
note: "Something is broken or doesn't behave as promised — product, site, tool, any surface."   # or null — pre-filled at init with the type's spirit
```

`title` is **locked** by validation: it must be exactly the type's canonical title (table above). `status` and `note` stay free-form. `baseHeat` is tunable per project (edit the folder's `_section.yaml`, not the code) but stays inside `[0, 33.33]` — it's the canonical source of the temperature's `base` tier; the code-level `DEFAULT_BASE_HEAT` table is only the fallback when a `_section.yaml` predates the field.

**There is no "create a section" command**: not CLI, not API, not manual edit. The 9 types are created once and for all at setup init (`references/setup.md`) and are immutable — they are never renamed, added to, or removed. The `NN` prefix is a display-order convenience only.

## Roadmap, progress, epics, milestones, temperature

**The dashboard's Roadmap view = the backlog's 9 types** (one column per type, canonical order, empty type dimmed). A task's state (done / available / locked) is **computed** from `status` + `dependsOn` — never stored. There's nothing to create: sorting each task into the right type AND setting its `dependsOn` IS building the roadmap.

**Progress**: `sitrep` displays a `progress: x/y (pct%)` line (abandoned/dormant types excluded); `task.mjs roadmap` details overall + per-epic progress. Simple task count, no weighting by size.

### Temperature — the priority signal (replaces the old stage order)

`next` serves available todos sorted by a **computed** temperature (never stored, never in the YAML), highest first, id ascending as the tie-break:

```
temperature = auto + base + seed          each term <= 33.33, total <= 100, rounded to 0.01

auto = min(33.33 ; 20*B + 13.33*A)        the MACHINE tier (downstream blockers + age)
base = section.baseHeat (or the type's code default)   the NATURE tier — fixed per type
seed = heat / 3                            the HUMAN tier — heat is the stored 0-100 field

A = age / (age + 90)     age = whole days since createdAt
B = b / (b + 4)          b = count of ACTIVE, NON-done tasks that transitively depend on this one
```

Three **equal** tiers — none dominates. A naturally hot ticket (e.g. a `bug`: high base + it blocks a lot + it's old) can and should outrank a task someone maxed `--heat` on — the seed adds weight, it never overrides the real signal. To prioritize a task: set `--heat` (`add`/`update`) OR make another task `dependsOn` it (declaring a dependency heats up the blocker). Reordering `_epics.yaml` changes NOTHING here — epics never enter the calculation.

Degenerate cases, both sane: an empty graph + no seeds still stratifies by `base(type)` then age (bugs first, chores last, never flat FIFO); two tasks tied to the hundredth fall back to id ascending (oldest first).

### Epics — cross-type grouping (`epic` field), UNORDERED

An **epic** groups the tasks of a single large project ACROSS types (e.g. "graph revamp" = its spec + its tasks + its later fixes). It's a simple shared slug (`epic: graph-revamp`) — no declaration required (auto-discovery). **An epic groups, it never orders or prioritizes** — there is no "epic priority"; `_epics.yaml`'s file order is cosmetic only. The dashboard offers a "group by epic" mode in the Backlog, and the task panel edits the field (combobox + create-on-the-fly).

`_epics.yaml` (optional) declares readable titles:

```yaml
epics:
  - { slug: graph-revamp, title: "Graph revamp" }
  - { slug: foundation,   title: "Foundation" }
```

Unique slugs. **Backward compat**: an old `_roadmaps.yaml` is still READ (its flattened milestones become epics) but is no longer written — the API exposes `PUT /api/epics`.

### Milestones — `kind: milestone`

A **milestone** is a target task other tasks depend on: `add --kind milestone --blocks 1,2` creates the milestone AND adds it to the `dependsOn` of the cited tasks (`--blocks` = the ergonomic inverse of `--depends-on`). The lock is the STANDARD `dependsOn` mechanic (no new semantics): as long as the milestone isn't done, its dependents are locked. Distinct rendering: **diamond** glyph + "blocks N" badge (dashboard, N = computed reverse dependents). Don't confuse: `epic` groups (unordered), `kind: milestone` locks (via `dependsOn`), `heat`/temperature prioritizes.

## Spec — `docs/specs/YYYY-MM-DD-<subject>.md`

Free-form markdown but always: context/objective, decisions made (and discarded alternatives), explicit scope AND out-of-scope, done criteria. A spec is validated by the user BEFORE the tasks that reference it are created.

## Subtasks

A twin folder with the same name as the task file (see directory tree). The CLI doesn't create them directly: create the task via `add` in the type folder (the id is allocated cleanly), then **`mv`** (not `git mv` — the file was just created, it's untracked and `git mv` fails) the file into the twin folder, then `validate`. NEVER consume `nextId` by hand. The parent's status is never recomputed from its subtasks (deliberate decision).

## Delivered tasks

A `done` task stays in its type (Backlog's Done column) — there is no archiving (#154): the done backlog, with `commit`/`outcome`/`verification` logged, IS the changelog. ALWAYS log them at `done`.
