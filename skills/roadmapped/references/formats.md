# Roadmapped — canonical formats

Any deviation from these formats is rejected by validation (`task.mjs validate`, run automatically after every CLI/API write, with rollback).

## Directory tree

`docs/tasks/` contains **exactly the 8 canonical stages** below — the
universal sequence of a product launch. No other section folder is allowed:
`validate` rejects a 9th folder, a non-canonical slug, or a missing stage.

| Folder | Canonical title | Spirit (default note at init) |
|---|---|---|
| `01-idea` | Idea Stage | The initial idea, its validation, the problem/target. |
| `02-initial` | Initial Stage | Name, repo, legal structure — the project's existence. |
| `03-identity` | Identity Stage | Brand, domain, social presence, positioning. |
| `04-build` | Build Stage | Building the product AND its business foundations (site, emails, accounting). |
| `05-gtm` | GTM Stage | Go-to-market: content, outbound, paid acquisition. |
| `06-launch` | Launch Stage | Launching: product, site, content engine, qualification. |
| `07-scale` | Scale Stage | Monitoring, SEO, community, deals, billing, support. |
| `08-mature` | Mature Stage | Referral, legal & compliance, advanced integrations. |

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — global monotonic counter, NEVER hand-edited
├── _epics.yaml                 # optional — epic declarations (readable title, order)
├── 01-idea/                    # canonical stage, created at setup — never hand-created/renamed
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # one task = one file
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # TWIN folder, same name = subtasks of 02-<slug>.yaml
│       └── 01-<slug>.yaml
├── 02-initial/
├── 03-identity/
├── 04-build/
├── 05-gtm/
├── 06-launch/
├── 07-scale/
└── 08-mature/
```

An empty stage (no tasks) stays present — it shows dimmed in the dashboard,
it never disappears.

## Task — full schema, CANONICAL field order

```yaml
id: 42                    # allocated by the CLI from _meta.yaml — never chosen by hand
kind: quick               # ADDITIVE — absent = task (default). quick = mini-ticket; milestone = MILESTONE (see § Milestones)
code: B3                  # optional, short human code (null otherwise)
title: "Task title"
status: todo              # todo | in_progress | done — NOTHING else
tags: [bug, perf]         # free-form, [] if none
size: M                   # S | M | L | null
team: engineering         # marketing | sales | support | operations | finance | legal | engineering | design — REQUIRED, strict enum
detail: |
  The WHAT and the WHY, known pitfalls, the definition of done.
refs:                     # relevant files: code (path:line) AND documentation
  - src/lib/foo.ts:120
  - docs/specs/2026-07-07-my-feature.md
  - docs/ARCHITECTURE.md
links: []                 # ids of other related tasks (context, not order)
dependsOn: [12, 45]       # PREREQUISITE ids — the task is locked until they're done
epic: null                # cross-stage GROUPING: slug shared by tasks of the same project (e.g. graph-revamp) — see § Epics
source: ai                # user | ai — who created the task
createdAt: "2026-07-07"
completedAt: null         # set automatically on transition to done
commit: null              # sha of the delivery commit (logged by done --commit)
outcome: null             # WHAT WAS DELIVERED, a user-facing sentence (done --outcome) — changelog material
verification: null        # HOW the artefact was verified (done --verification)
release: null             # release version if applicable
```

Enforced invariants: ids unique globally; every `dependsOn` id exists; no self-dependency; acyclic `dependsOn` graph; `epic` is a slug (lowercase/digits/hyphens) or null — NO declaration required; `team` present and ∈ the enum on every task, subtasks included.

**`milestone` backward compat (#133)**: a YAML's old `milestone:` field is READ as `epic` and migrates automatically on the next dump; the CLI flag `--milestone` remains a deprecated alias for `--epic`. Never write `milestone:` in a YAML again.

## Stage — `_section.yaml`

```yaml
title: "Idea Stage"
status: open              # open | done | dormant | abandoned
note: "The initial idea, its validation, the problem/target."   # or null — pre-filled at init with the stage's spirit
```

`title` is **locked** by validation: it must be exactly the stage's canonical title (table above). `status` and `note` stay free-form — a stage that's been traversed gets marked `done`, `note` grows richer over time (best practices, project-specific context).

**There is no "create a section" command**: not CLI, not API, not manual edit. The 8 stages are created once and for all at setup init (`references/setup.md`) and are immutable — they are never renamed, added to, or removed. The `NN` prefix gives the display order (already fixed by the idea→mature sequence).

## Roadmap, progress, epics, milestones

**The dashboard's Roadmap view = the backlog's 8 stages** (one column per stage, in idea→mature order, empty stage dimmed). A task's state (done / available / locked) is **computed** from `status` + `dependsOn` — never stored. There's nothing to create: sorting each task into the right stage AND setting its `dependsOn` IS building the roadmap.

**Progress**: `sitrep` displays a `progress: x/y (pct%)` line (abandoned/dormant stages excluded); `task.mjs roadmap` details overall + per-epic progress. Simple task count, no weighting by size.

### Epics — cross-stage grouping (`epic` field)

An **epic** groups the tasks of a single large project ACROSS stages (e.g. "graph revamp" = its spec + its tasks + its later fixes). It's a simple shared slug (`epic: graph-revamp`) — no declaration required (auto-discovery). The dashboard offers a "group by epic" mode in the Backlog, and the task panel edits the field (combobox + create-on-the-fly).

`_epics.yaml` (optional) declares readable title and order:

```yaml
epics:
  - { slug: graph-revamp, title: "Graph revamp" }
  - { slug: foundation,   title: "Foundation" }
```

Unique slugs. **Backward compat**: an old `_roadmaps.yaml` is still READ (its flattened milestones become epics) but is no longer written — the API exposes `PUT /api/epics`.

### Milestones — `kind: milestone`

A **milestone** is a target task other tasks depend on: `add --kind milestone --blocks 1,2` creates the milestone AND adds it to the `dependsOn` of the cited tasks (`--blocks` = the ergonomic inverse of `--depends-on`). The lock is the STANDARD `dependsOn` mechanic (no new semantics): as long as the milestone isn't done, its dependents are locked. Distinct rendering: **diamond** glyph + "blocks N" badge (dashboard, N = computed reverse dependents). Don't confuse: `epic` groups, `kind: milestone` locks.

## Spec — `docs/specs/YYYY-MM-DD-<subject>.md`

Free-form markdown but always: context/objective, decisions made (and discarded alternatives), explicit scope AND out-of-scope, done criteria. A spec is validated by the user BEFORE the tasks that reference it are created.

## Subtasks

A twin folder with the same name as the task file (see directory tree). The CLI doesn't create them directly: create the task via `add` in the section (the id is allocated cleanly), then **`mv`** (not `git mv` — the file was just created, it's untracked and `git mv` fails) the file into the twin folder, then `validate`. NEVER consume `nextId` by hand. The parent's status is never recomputed from its subtasks (deliberate decision).

## Delivered tasks

A `done` task stays in its stage (Backlog's Done column) — there is no archiving (#154): the done backlog, with `commit`/`outcome`/`verification` logged, IS the changelog. ALWAYS log them at `done`.
