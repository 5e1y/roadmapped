# Roadmaped — User Guide

Roadmaped is local project management for founders who drive their work with an AI
agent — think Obsidian × Linear, with **no database**. Flat YAML and markdown files
inside your repo are the single source of truth. A local dashboard renders them for
humans; a CLI (`scripts/task.mjs`) and a Claude skill let your agent create specs,
tasks and dependencies in the right format — and record what it ships.

This guide is the reference for two readers: a human discovering the tool, and a
developer steering a project through a Claude agent. Every CLI example below was
executed for real; read-only examples come from this repository's live backlog,
write examples from an isolated sandbox (see [CLI reference](#4-cli-reference)).

---

## 1. What is Roadmaped

Roadmaped has one hard rule: **the files are the truth**. There is no server-side
state, no SaaS, no hidden index. Everything lives in your repository as plain text
you can read, diff, edit by hand and commit alongside your code.

| Piece | Where | What it is |
|---|---|---|
| Task | `docs/tasks/<NN-stage>/<NN-slug>.yaml` | The unit of work: status, dependencies, and the record of what shipped. Carries a `stage` (its folder — *when* in the launch sequence) and a `team` (*who* owns it). |
| Stage | `docs/tasks/<NN-stage>/_section.yaml` | One of **8 fixed product-launch stages** — Idea, Initial, Identity, Build, GTM, Launch, Scale, Mature, always in that order. **Stages are the milestones**: the Roadmap view shows one column per stage, dimmed when empty. |
| Spec | `docs/specs/YYYY-MM-DD-<topic>.md` | The approved design of a feature, written *before* its tasks exist. |
| Doc | `docs/**/*.md` | Project knowledge. Tasks link to it through `refs`. |
| Archive | `docs/tasks/_archive/<stage>/` | The journal of delivered tasks. Never edited by hand. |

The 8 stages, in order: `01-idea` (Idea Stage) · `02-initial` (Initial Stage) ·
`03-identity` (Identity Stage) · `04-build` (Build Stage) · `05-gtm` (GTM Stage) ·
`06-launch` (Launch Stage) · `07-scale` (Scale Stage) · `08-mature` (Mature Stage).
They are created once at setup and are **immutable** — no 9th stage, no renaming, no
"create a section" command anywhere (CLI, API, or dashboard). Every active task also
carries a **team** — the business function that owns it — from a fixed enum:
`marketing | sales | support | operations | finance | legal | engineering | design`.
Stage says *when* in the launch; team says *who*.

Three properties follow from this design and are enforced everywhere:

- **Every write is validated, then rolled back if invalid.** The CLI and the
  dashboard share the exact same validator (`src/lib/validate.ts`). A mutation that
  would break the schema, duplicate an id or create a dependency cycle leaves the
  files untouched.
- **Ids are never reused.** A monotonic counter in `_meta.yaml` (`nextId`) hands out
  every id. Deleting or archiving a task never frees its number.
- **Dependency state is computed, never stored.** Whether a task is *done*,
  *available* or *locked* is derived on the fly from its `status` and its
  `dependsOn` list. You place tasks in their stage and set the dependencies; the
  roadmap draws itself.

There is no separate "plan" file. An implementation plan *is* a set of tasks chained
by `dependsOn` (the order) and placed into the stage they belong to (the destination)
with the team that owns them. Progress tracking *is* the task statuses. If you find
yourself keeping a parallel checklist, you are fighting the tool.

---

## 2. Installation in a host repo

Roadmaped lives as a folder in (or next to) your project. Install its dependencies
and start the dashboard:

```bash
npm install
npm run dev            # dashboard on http://localhost:5173
node scripts/task.mjs --help
```

Node **≥ 22.18** is required — it runs the TypeScript imports natively. On older
Node, use `npm run task -- <command>` instead of `node scripts/task.mjs <command>`.

### `roadmaped.config.json`

The CLI and the dashboard resolve two directories from a `roadmaped.config.json` at
the Roadmaped root:

```json
{
  "tasksDir": "docs/tasks",
  "docsDir": "docs"
}
```

| Key | Meaning | Default |
|---|---|---|
| `tasksDir` | Where the backlog lives (stages, tasks, `_meta.yaml`, archive). | `../docs/tasks` |
| `docsDir` | Where the Docs view reads markdown from. | `../docs` |

Relative paths are resolved against the Roadmaped root (the folder that contains
`roadmaped.config.json`), **not** your shell's working directory — so the CLI always
targets the same backlog no matter where you run it from. The defaults
(`../docs/tasks`, `../docs`) assume Roadmaped sits *beside* your `docs/`. If it sits
*inside* the repo it manages (as in this repository), point both keys at the repo's
own `docs`, as shown above. Adjust this file **before** the first run — otherwise the
tool works in the wrong place. A missing or unreadable config silently falls back to
the defaults.

---

## 3. Dashboard tour

`npm run dev` serves a three-view app. The left sidebar switches between **Backlog**,
**Roadmap** and **Docs**; the last view is remembered across reloads. Clicking any
task anywhere opens a **side panel** on the right.

### Backlog

The working list. The 8 stages in order (empty ones dimmed and collapsed by default),
each with a `done/total` count and its tasks below. A task row shows a status glyph
(`[ ]` todo, `[~]` in progress, `[x]` done), the `#id`, the title, and chips for its
`code`, `size`, `team` and `tags`. Sub-tasks are indented under their parent. This is
where you do full CRUD on tasks — add a task to any stage, edit fields, change status.
There is no "add stage" button: the 8 stages are fixed.

### Roadmap — Columns and Graph

The Roadmap view treats **the 8 fixed stages as milestones**: always 8 columns, in
idea→mature order. An empty stage renders dimmed and narrow (grey header, "0" count,
no body) so the full path stays visible without competing for attention with the
populated stages. It has two modes, toggled in the header (*Colonnes* / *Graphe*).

- **Columns** — each stage is a column with a progress bar and its task cards.
- **Graph** — an "achievement tree". Cards are laid out in dependency layers so a
  dependent card always sits below its prerequisite, and arrows draw the `dependsOn`
  edges. Zoom controls in the corner: `−` / `Ajuster` (fit to width) / `+`.

Both modes render the same three **computed** states, and they are never written to
disk:

| State | Meaning | How it looks |
|---|---|---|
| **done** | `status: done`. | Check glyph, struck-through title. |
| **available** | Todo/in-progress with every prerequisite done. | Solid emphasised border, "Disponible". |
| **locked** | A prerequisite is not yet done. | Dimmed card, "Prérequis manquants (#…)". |

A dependency on an *archived* task counts as satisfied (it shipped). The set of
available cards is your "work front" — what can legitimately be started right now.

### Docs

Renders `docsDir` (`docs/`) as a browsable markdown tree. The sidebar lists the
files; the pane renders the selected one with clickable heading anchors and working
relative `.md` links. This guide itself renders here.

### Side panel

Clicking a task opens it on the right for inline editing: title, status, size, team
(a ghost Select over the 8 fixed values), code, tags, `dependsOn` (chosen from
existing tasks, archived ones included), `refs`, `links`, and the delivery fields
`commit`, `outcome`, `verification`, `release`. Every edit goes through the same
validate-then-rollback path as the CLI, so the panel can never save an invalid state.

---

## 4. CLI reference

`scripts/task.mjs` is the agent's entry point and the only *write* interface you
should use for anything the CLI covers. Run everything from the Roadmaped root:

```bash
node scripts/task.mjs <command> [arguments]
```

> The CLI's own messages are currently in French; the outputs below are shown
> verbatim. **Read** commands below were run against this repository's live backlog
> (already migrated to stages+teams). **Write** commands were run in an isolated
> sandbox (a copy of `src/` + `scripts/` with a throwaway `tasksDir`, seeded with the
> 8 canonical stages — `add` refuses to write into anything else), because writing to
> the real backlog is out of scope for a doc task. The displayed file paths are always
> shown rooted at `docs/tasks/`.

### `list` — browse the backlog

```
list [--section <key>] [--status todo|in_progress|done] [--team <t>] [--archive] [--json]
```

```console
$ node scripts/task.mjs list --section 05-gtm
05-gtm — GTM Stage (open) 0/2
  [ ] #19  Stratégie de communication  (M marketing marketing)
  [ ] #20  Préparer les contenus d'annonce  (M marketing marketing)
```

`--section` takes one of the 8 stage slugs (`01-idea` … `08-mature`) — there is no
other value to give it. `--team` filters across all stages:

```console
$ node scripts/task.mjs list --team engineering
01-idea — Idea Stage (done) 1/1
  [x] #45  Idée initiale — Roadmaped, gestion de projet locale agent-first  (engineering)
02-initial — Initial Stage (done) 2/2
  [x] #46  Choisir le nom Roadmaped  (engineering)
  [x] #47  Préparer le repo standalone  (engineering)
04-build — Build Stage (open) 20/30
  [x] #1   Audit UX/UI complet du dashboard  (S engineering ux audit)
  [x] #2   Spec — panneau de détail de tâche clarifié  (S engineering ux spec)
  [ ] #3   Spec — création de tâche fluide  (S engineering ux spec)
  ...
```

`--archive` folds the delivered stages in; `--status` filters; `--json` prints the
full tree object for machine consumption. There is no `--zone` any more — it is an
unknown flag (see [`add`](#add--create-a-task) below).

### `show <id>` — full detail of one task

Takes a **global** id (not a per-stage number).

```console
$ node scripts/task.mjs show 47
[x] #47  Préparer le repo standalone  (engineering)
  section: 02-initial
  fichier: docs/tasks/02-initial/02-preparer-le-repo-standalone.yaml
  detail: Extraire Roadmaped de son incubation dans ZineKit vers un repo autonome : code, dépendances (@types/node explicite), config, backlog.
  outcome: Repo standalone Roadmaped 0.1.0 initialisé — extraction depuis ZineKit, arbre propre.
  vérification: Commit d'extraction 388fbb2 ; npm run build et npm run test verts sur le repo autonome.
  commit: 388fbb2
  dates: créée 2026-07-07 · terminée 2026-07-07 · source user
```

The `(engineering)` next to the title is the task's **team**. Add `--json` to get the
raw task object (ideal as a subagent brief) — it includes the `team` field like any
other.

### `next` — the one task to do now

Returns the **first available todo** (all dependencies done) of the highest-priority
`open` stage. It never proposes a locked task — that is the whole point of "let's
continue on the roadmap".

```console
$ node scripts/task.mjs next
[ ] #16  Positionnement et copy du site  (M marketing marketing)
  section: 03-identity
  fichier: docs/tasks/03-identity/01-positionnement-et-copy-du-site.yaml
  detail: Définir avec Rémi : audience (founders solo pilotés par agent IA, utilisateurs Claude Code), promesse centrale (« votre repo est votre outil de gestion de projet »), différenciateurs (fichiers plats sans SaaS ni base de données, agent-first, local, open source), structure de la landing (hero, démo animée, features, quickstart, lien GitHub/skill), langue (EN, FR, ou les deux), ton. Livrable : docs/site-copy.md avec la copy complète et approuvée, section par section. C'est un livrable éditorial — pas de spec technique requise.
  refs: README.md · docs/specs/2026-07-07-roadmaped-v2-design.md
  dates: créée 2026-07-07 · source user
```

`next` walked past the fully-`done` `01-idea` and `02-initial` stages and the
partially-done `04-build` stage to reach `03-identity`, the earliest stage that still
has available work — exactly the "which stage am I at" question stages exist to
answer. If every remaining todo is locked, `next` exits 1 with an explanation. Note
that in-progress tasks are skipped — `next` only surfaces *todo* work.

### `roadmap` — milestone rollup

```console
$ node scripts/task.mjs roadmap
Aucune roadmap (docs/tasks/_roadmaps.yaml absent).
```

**Important nuance.** The `roadmap` *command* reads the optional
`docs/tasks/_roadmaps.yaml` file — the named milestone groupings, an advanced feature
the dashboard does not display. This repository has no such file, so the command
reports none. The **dashboard's** Roadmap view is the everyday roadmap and is driven
by the *8 fixed stages*, not by `_roadmaps.yaml`. When `_roadmaps.yaml` does exist,
the command prints progress and per-task state:

```console
$ node scripts/task.mjs roadmap      # sandbox, with a _roadmaps.yaml present
launch — Product launch
  core — Core  0/1
    [~] (disponible) #2 Wire the login endpoint
  beta — Beta  0/1
    [~] (disponible) #3 Third task
```

### `validate` — check everything

Validates the whole `docs/tasks/` tree: schema, global id uniqueness, `nextId`,
dependency graph, archive included — plus the two invariants stages+teams added: the
set of active section folders must be *exactly* the 8 canonical slugs (title included),
and every active task must carry a `team` from the fixed enum. Exit 1 on any error.
**Run it after every manual edit.**

```console
$ node scripts/task.mjs validate
OK — 8 sections actives (45 tâches), 0 sections archivées (0 tâches), nextId=52.
```

### `add` — create a task

```
add --section <stage> --title <t> --team <team> [--detail <d>] [--tags a,b]
    [--size S|M|L] [--code <c>] [--refs a,b] [--links 1,2]
    [--depends-on 1,2] [--milestone <slug>] [--source ai|user] [--json]
```

`--section` must be one of the 8 stage slugs and `--team` is **required**, one of
`marketing | sales | support | operations | finance | legal | engineering | design`.
The id is allocated from `_meta.yaml`; the file is created in the stage folder.

```console
$ node scripts/task.mjs add --section 04-build --title "Set up the database schema" \
    --team engineering --detail "Create the users and sessions tables." \
    --tags backend,db --size M
#1 créée → docs/tasks/04-build/01-set-up-the-database-schema.yaml

$ node scripts/task.mjs add --section 04-build --title "Wire the login endpoint" \
    --team engineering --depends-on 1 --size S \
    --refs "src/api/auth.ts,docs/specs/2026-07-07-auth.md"
#2 créée → docs/tasks/04-build/02-wire-the-login-endpoint.yaml
```

Omitting `--team` refuses the write outright, and `--zone` is gone — both fail loud
rather than silently falling back:

```console
$ node scripts/task.mjs add --section 04-build --title "Missing team" --size S
Flag requis manquant : --team

$ node scripts/task.mjs add --section 04-build --title "Zone flag" --team engineering --zone store
Flag inconnu : --zone (autorisés : --section, --title, --team, --detail, --tags, --size, --code, --refs, --links, --depends-on, --milestone, --source, --json)
```

`--source` defaults to `ai`; use `--source user` for work that comes from the user's
own notes. `--json` prints the created task object. The CLI only creates top-level
tasks (see [sub-tasks](#5-yaml-formats)).

### `start <id>` — begin work

```console
$ node scripts/task.mjs start 2
#2 démarrée (in_progress).
```

Sets `status: in_progress`. Nothing stops you from starting a *locked* task — the
lock is your discipline, not a technical guard.

### `done <id>` — deliver and record

```
done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>]
```

Sets `status: done`, stamps `completedAt` with today's date, and records the delivery
fields onto the task's YAML (there is no separate delivery document — the "record" is
these fields inside the task file).

```console
$ node scripts/task.mjs done 1 --commit a1b2c3d \
    --outcome "Users and sessions tables ship in the initial migration" \
    --verification "Ran the migration on a scratch DB; \dt lists both tables"
#1 terminée (done).
```

- `--outcome` — **what shipped**, one user-facing sentence. This is changelog
  material (archive + outcome + release = tomorrow's changelog).
- `--verification` — **what was observed** to prove it works, not "it works".
- `--commit` — the delivery sha. `--release` — a version tag if applicable.

The CLI accepts `done` with no flags (only `completedAt` is automatic), but recording
an honest `--outcome` and `--verification` is a usage rule, not an option.

### `update <id>` — generic patch

```
update <id> [--title] [--detail] [--status] [--tags] [--refs] [--links]
    [--size] [--team] [--code] [--source] [--commit] [--outcome] [--verification]
    [--release] [--depends-on 1,2] [--milestone <slug>]
```

```console
$ node scripts/task.mjs update 2 --status in_progress --code C1
#2 mise à jour.

$ node scripts/task.mjs update 2 --team design
#2 mise à jour.
```

**Clearing a field — two different conventions:**

| Field kind | Fields | How to clear |
|---|---|---|
| Scalar / string | `title`, `detail`, `status`, `size`, `code`, `source`, `commit`, `outcome`, `verification`, `release` | pass the literal `null` |
| Relations | `depends-on`, `milestone` | pass `null` |
| Lists | `tags`, `refs`, `links` | pass `null` (or `""`) |

`team` is **not** in that scalar list: it is required on every active task, so
`--team null` is rejected by validation instead of clearing the field —

```console
$ node scripts/task.mjs update 2 --team null
Échec :
  - 04-build/2: team absente ou invalide (null) — attendu l'une de : marketing, sales, support, operations, finance, legal, engineering, design
```

— the write rolls back and the task keeps its previous team. For every other field,
passing the literal `null` clears it — scalar, relation, or list. For a list,
`--tags null` writes `tags: []` (verified), on a par with `--depends-on null`. The
empty-string form `--tags ""` still works and stays valid, but is no longer required.

> Historical note: before this was fixed, `--tags null` created a tag literally named
> `null` and `--tags ""` was the only way to empty a list. That gotcha is gone.

### `archive <id>` — move a delivered task out

```console
$ node scripts/task.mjs archive 2      # not done yet
Échec :
  - #2 doit être done avant d'être archivée.

$ node scripts/task.mjs archive 1
#1 archivée → docs/tasks/_archive/…
```

Requires `status: done`. Moves the task file (and its twin sub-task folder, if any)
to `_archive/<stage>/`. Record `commit`/`outcome`/`verification` **before**
archiving — the archive is your changelog and is never edited afterwards.

---

## 5. YAML formats

Anything that deviates from these formats is rejected by validation (rolled back on
CLI/API writes). `docs/tasks/` holds **exactly the 8 canonical stages** below — no
other section folder is admitted, and `validate` rejects a 9th one, a non-canonical
slug, or a missing stage:

| Folder | Canonical title | Spirit (default note at setup) |
|---|---|---|
| `01-idea` | Idea Stage | The initial idea, its validation, the problem/target. |
| `02-initial` | Initial Stage | Name, repo, legal structure — the project's existence. |
| `03-identity` | Identity Stage | Brand, domain, social presence, positioning. |
| `04-build` | Build Stage | Build the product AND its business foundations (site, email, accounting). |
| `05-gtm` | GTM Stage | Go-to-market: content, outbound, paid acquisition. |
| `06-launch` | Launch Stage | Launch: product, site, content engine, qualification. |
| `07-scale` | Scale Stage | Monitoring, SEO, community, deals, billing, support. |
| `08-mature` | Mature Stage | Referral, legal & compliance, advanced integrations. |

File tree:

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — global counter, monotonic, never hand-edited
├── _roadmaps.yaml              # optional — named roadmaps + ordered milestones
├── 01-idea/                    # canonical stage, created once at setup — never created/renamed by hand
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # a task = a file
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # twin folder = sub-tasks of 02-<slug>.yaml
│       └── 01-<slug>.yaml
├── 02-initial/
├── 03-identity/
├── 04-build/
├── 05-gtm/
├── 06-launch/
├── 07-scale/
├── 08-mature/
└── _archive/
    └── 01-idea/                # mirror of the origin stage, delivered tasks
```

An empty stage (no tasks) still exists as a folder — the dashboard dims it, it is
never removed.

### Task schema — field by field

The field order below is canonical (the CLI writes it this way).

| Field | Type | Meaning |
|---|---|---|
| `id` | int | Allocated by the CLI from `_meta.yaml`. Never chosen by hand, never reused. |
| `code` | string \| null | Optional short human code (e.g. `B3`). |
| `title` | string | The task title. |
| `status` | `todo` \| `in_progress` \| `done` | Nothing else is valid. |
| `tags` | string[] | Free labels; `[]` if none. |
| `size` | `S` \| `M` \| `L` \| null | Rough effort. |
| `team` | `marketing`\|`sales`\|`support`\|`operations`\|`finance`\|`legal`\|`engineering`\|`design` | **Required** on every active task (sub-tasks included). Says *who* owns the work; the stage folder already says *when*. Validation rejects a missing or unknown value. |
| `detail` | string \| null | The *what* and *why*, known traps, definition of done. |
| `refs` | string[] | Relevant files: code (`path:line`) **and** documentation. |
| `links` | int[] | Ids of related tasks (context, not order). |
| `dependsOn` | int[] | Prerequisite ids. The task is *locked* until they are all done. |
| `milestone` | string \| null | Advanced; a slug declared in `_roadmaps.yaml`. Leave `null` normally. |
| `source` | `user` \| `ai` | Who created the task. |
| `createdAt` | date string | Set at creation. |
| `completedAt` | date string \| null | Set automatically on `done`. |
| `commit` | string \| null | Delivery sha (`done --commit`). |
| `outcome` | string \| null | What shipped, one user-facing sentence (`done --outcome`). Changelog material. |
| `verification` | string \| null | How the artifact was verified (`done --verification`). |
| `release` | string \| null | Release version, if applicable. |

Enforced invariants: ids unique globally (archive included); every `dependsOn` id
exists; no self-dependency; the `dependsOn` graph is acyclic; any `milestone` is
declared in `_roadmaps.yaml`; a dependency on an archived task counts as satisfied;
`team` present and in the enum on every active task (the archive is not re-validated —
tasks archived before the stages+teams refactor keep their pre-refactor schema as-is).

```yaml
id: 42
code: null
title: "Wire the login endpoint"
status: todo
tags: [backend, db]
size: S
team: engineering
detail: |
  Create the POST /login handler against the sessions table.
refs:
  - src/api/auth.ts:120
  - docs/specs/2026-07-07-auth.md
links: []
dependsOn: [41]
milestone: null
source: ai
createdAt: "2026-07-07"
completedAt: null
commit: null
outcome: null
verification: null
release: null
```

### Stage — `_section.yaml`

```yaml
title: "Build Stage"
status: open              # open | done | dormant | abandoned
note: "Construire le produit ET ses fondations business (site, emails, comptabilité)."   # or null
```

`title` is **locked** by validation: it must be exactly the canonical title of the
stage (table above). `status` and `note` stay free — a stage the project has fully
moved past can be marked `done`; `note` is pre-filled with the stage's spirit at setup
and can grow over time.

**There is no "create a section" command** — not in the CLI, not in the API, not by
hand. All 8 stages are created once at setup (see [§6](#6-working-with-a-claude-agent))
and are immutable: never renamed, never added to, never removed. `next` serves the
first available todo of the highest-priority `open` stage, in the fixed idea→mature
order.

### Sub-tasks — twin folder

The CLI creates only top-level tasks. A sub-task lives in a **twin folder** named
exactly like its parent file (`04-x/` next to `04-x.yaml`). The clean way to make
one: `add` the task in the stage (so the id is allocated properly), then `mv` its
file into the twin folder (use `mv`, not `git mv` — the file is untracked), then
`validate`. Never consume `nextId` by hand. A parent's status is never recomputed
from its sub-tasks (a deliberate decision).

### `_roadmaps.yaml` (advanced, optional)

Named milestone groupings, supported by validation and the `roadmap` command but
**not** shown by the dashboard. Skip it unless explicitly asked for.

```yaml
roadmaps:
  - slug: launch
    title: "Product launch"
    milestones:
      - { slug: core, title: "Core" }
      - { slug: beta, title: "Beta" }
```

Milestone slugs are globally unique; a task's `milestone` must reference a declared
slug.

### Archive

`task.mjs archive <id>` moves the file (and twin folder) to `_archive/<stage>/`. It
requires `status: done`. `completedAt` is guaranteed (set automatically on `done`),
but `commit`/`outcome`/`verification` exist only if `done` supplied them — so record
them before archiving. The archive is never modified by hand.

---

## 6. Working with a Claude agent

Roadmaped ships a Claude skill (`skills/roadmaped/`) so an agent drives the backlog in
the correct format. The CLI is the agent's **only write interface**.

### First use in a repo — mandatory setup

If `docs/tasks/_meta.yaml` does **not** exist, the repo is not initialised and the
skill runs a setup phase first (see `references/setup.md`). It:

1. **Inventories** what already exists, read-only: README, ROADMAP, TODO, BACKLOG,
   checkbox plans, `docs/specs/`, existing docs, and the code/team structure (which
   suggests a natural `team` for each item).
2. **Maps everything onto the 8 fixed stages** and waits for the user's approval —
   there is nothing to propose about the stages themselves (idea→mature, always the
   same 8); the work is mapping. Every open item becomes a task in the stage it
   belongs to (finished/checked items are *not* imported, except a couple of
   retroactive `done` tasks in `01-idea`/`02-initial` to tell the project's real
   history); every task gets a `team`; ordered plan steps become `dependsOn` chains;
   existing docs are wired into `refs`. Phases/versions ("v1", "beta", "phase 2") map
   onto the stage of the launch sequence they resemble — not a new section.
3. **Initialises**: create `_meta.yaml` (`nextId: 1`), create the 8 canonical stage
   folders with their locked titles, `validate`, then create tasks **via the CLI
   only** (`add --team` required on each), in dependency order.

If `_meta.yaml` already exists, the repo is initialised — the agent never re-runs
setup (it would overwrite real state) and never creates a stray task in an
uninitialised repo.

### The work cycle: `next → start → work → done`

1. **Take** — `next` (or the id the user asked for). If a task is locked, do its
   prerequisites first; never route around a dependency.
2. **Start** — `start <id>` before the first line of code.
3. **Work** — follow `detail` and the documents in `refs`; read the referenced spec
   *before* coding.
4. **Verify the real artifact** — the file produced, the pixel rendered, the command
   run. Not just a typecheck.
5. **Record** — `done <id> --commit <sha> --outcome "…" --verification "…"`. The
   outcome says what shipped in one user-facing sentence; the verification says what
   was *observed*, never "it works".
6. **Archive** — when the user closes a piece of work: `archive <id>`.

For anything beyond a single task, the skill's `references/workflows.md` is the
operating manual: ① Idea → Spec (hard gate: no code before an approved spec),
② Spec → Tasks (`detail` carries the plan, `dependsOn` is the real order),
③ execution solo or delegated to fresh subagents (review before `done`), ④ transverse
guardrails (TDD, root cause before fix, proof before claiming success).

### Key prohibitions

- Do **not** hand-edit a task YAML when the CLI covers the operation.
- Do **not** start a locked task, or delete a dependency to unblock yourself, without
  the user's agreement.
- Do **not** touch `_meta.yaml`, reuse an id, or edit the archive.
- Do **not** write a status outside `todo|in_progress|done`, or a size outside
  `S|M|L`.
- Do **not** `done` without an honest `--verification` that you actually ran.
- Do **not** create markdown checklist plans or a parallel progress ledger — plans
  are `dependsOn` tasks, tracking is their status.
- Do **not** code before the spec is approved, fix a bug without understanding the
  root cause, or stack a fourth patch on an approach that failed three times.

Manual editing is allowed **only** for what the CLI does not cover — creating a
sub-task twin folder — and is **always** followed by `validate`. There is no "create
a stage" edit to make: the 8 stages are fixed and created once at setup.

---

## 7. FAQ

**Do ids ever get reused?**
No. `nextId` in `_meta.yaml` is monotonic. Archiving or deleting a task never frees
its number. This keeps `dependsOn`, `links` and the archive referentially stable
forever. Never edit `nextId` by hand.

**What happens if a write would be invalid?**
Every CLI and dashboard write re-validates the *entire* `docs/tasks/` tree after
writing and **rolls back** on any error — schema violation, duplicate id, dependency
cycle, unknown milestone. You cannot end up in a half-written state.

**Can I edit the files by hand?**
Yes, for what the CLI does not do (creating a sub-task twin folder) — and then run
`node scripts/task.mjs validate`. There is no hand-edit for stages: the 8 are created
once at setup and are immutable. For everything the CLI covers (add, status changes,
field edits, archiving), use the CLI: it allocates ids correctly and validates for
you. If you do hand-edit a task, keep the field order canonical and run `validate`
immediately.

**Where is the roadmap? The `roadmap` command says there is none.**
The everyday roadmap is the **dashboard's Roadmap view**, built from the *8 fixed
stages* (one column per stage, idea→mature order, dependency state computed). The
`roadmap` *command* reports the optional `_roadmaps.yaml` named milestones, which
most projects (including this one) don't use — hence "Aucune roadmap". Stages *are*
your milestones: to build a roadmap, put each task in the right stage and set your
`dependsOn` edges — there is no section to create or order.

**How do I clear a field with `update`?**
Pass the literal `null` — it works for every field kind now: scalars,
`--depends-on` / `--milestone`, and lists (`tags`, `refs`, `links`). For example
`--tags null` writes `tags: []`. The old workaround `--tags ""` still works but is
no longer necessary.

**Does `done` create a delivery document?**
No. The delivery record *is* the `outcome`, `verification`, `commit` and `release`
fields written onto the task's own YAML. Archived, those fields become your
changelog.

**What stops me starting a locked task?**
Nothing technical — `start` and `done` accept a locked task without error. Respecting
locks is the agent's discipline; the dashboard and `next` simply never *offer* locked
work.
