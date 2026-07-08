# Roadmapped — User Guide

Roadmapped is local project management for founders who drive their work with an AI
agent — think Obsidian × Linear, with **no database**. Flat YAML and markdown files
inside your repo are the single source of truth. A local dashboard renders them for
humans; a CLI (`scripts/task.mjs`) and a Claude skill let your agent create specs,
tasks and dependencies in the right format — and record what it ships.

This guide is the reference for two readers: a human discovering the tool, and a
developer steering a project through a Claude agent. Every CLI example below was
executed for real; read-only examples come from this repository's live backlog,
write examples from an isolated sandbox (see [CLI reference](#4-cli-reference)).

---

## 1. What is Roadmapped

Roadmapped has one hard rule: **the files are the truth**. There is no server-side
state, no SaaS, no hidden index. Everything lives in your repository as plain text
you can read, diff, edit by hand and commit alongside your code.

| Piece | Where | What it is |
|---|---|---|
| Task | `docs/tasks/<NN-stage>/<NN-slug>.yaml` | The unit of work: status, dependencies, and the record of what shipped. Carries a `stage` (its folder — *when* in the launch sequence) and a `team` (*who* owns it). |
| Stage | `docs/tasks/<NN-stage>/_section.yaml` | One of **8 fixed product-launch stages** — Idea, Initial, Identity, Build, GTM, Launch, Scale, Mature, always in that order. **Stages are the milestones**: the Roadmap view shows one column per stage, dimmed when empty. |
| Spec | `docs/specs/YYYY-MM-DD-<topic>.md` | The approved design of a feature, written *before* its tasks exist. |
| Doc | `docs/**/*.md` | Project knowledge. Tasks link to it through `refs`. |

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
  every id. Deleting a task never frees its number.
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

Roadmapped is an npm package: the tool lives in `node_modules/roadmapped/`, the
*data* (backlog, config) lives at the root of **your** repo. Install and scaffold:

```bash
npm install --save-dev roadmapped
npx roadmapped init          # config + 8-stage skeleton + skill + MCP entry + guard hook
npx roadmapped dashboard     # dashboard on http://localhost:5173
npx roadmapped --help
```

`init` is idempotent and never overwrites existing data: an existing
`roadmapped.config.json` is respected, a populated `docs/tasks/` is never touched,
and an existing `pre-commit` hook (husky, lefthook, custom) is **chained** — your
hook keeps running, the guard is appended after it; `core.hooksPath` is never
modified. `npx roadmapped upgrade` refreshes the tool-owned files (skill, MCP
entry, hook) and never touches `docs/tasks/` or your config.

Node **≥ 22.18** is required — it runs the TypeScript imports natively (the package
ships raw `.ts`, no build step; inside `node_modules` a small loader based on
`amaro`, Node's own type-stripping engine, fills the gap).

Inside the Roadmapped repository itself (self-hosting), `npm install` + `npm run dev`
and `node scripts/task.mjs <command>` keep working unchanged.

### `roadmapped.config.json`

The CLI and the dashboard resolve two directories from a `roadmapped.config.json` at
the **host repo root**:

```json
{
  "tasksDir": "docs/tasks",
  "docsDir": "docs"
}
```

| Key | Meaning | Default |
|---|---|---|
| `tasksDir` | Where the backlog lives (stages, tasks, `_meta.yaml`). | `docs/tasks` |
| `docsDir` | Where the Docs view reads markdown from. | `docs` |

The host root is found by walking up from your shell's working directory to the
first folder containing `roadmapped.config.json` (or, failing that, `.git`).
Relative paths are resolved against that root — so the CLI always targets the same
backlog no matter where inside the repo you run it from, and **never** the tool's
own install location (`node_modules`). Set `ROADMAPPED_ROOT` to override the
detection explicitly. A missing or unreadable config silently falls back to the
defaults.

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
populated stages. It has two modes, toggled in the header (*Columns* / *Graph*).

- **Columns** — each stage is a column with a progress bar and its task cards.
- **Graph** — an "achievement tree". Cards are laid out in dependency layers so a
  dependent card always sits below its prerequisite, and arrows draw the `dependsOn`
  edges. Zoom controls in the corner: `−` / `Fit` (fit to width) / `+`.

Both modes render the same three **computed** states, and they are never written to
disk:

| State | Meaning | How it looks |
|---|---|---|
| **done** | `status: done`. | Check glyph, struck-through title. |
| **available** | Todo/in-progress with every prerequisite done. | Solid emphasised border, "Available". |
| **locked** | A prerequisite is not yet done. | Dimmed card, "Missing prerequisites (#…)". |

The set of available cards is your "work front" — what can legitimately be started
right now.

### Docs

Renders `docsDir` (`docs/`) as a browsable markdown tree. The sidebar lists the
files; the pane renders the selected one with clickable heading anchors and working
relative `.md` links. This guide itself renders here.

### Side panel

Clicking a task opens it on the right for inline editing: title, status, size, team
(a ghost Select over the 8 fixed values), code, tags, `dependsOn` (chosen from
existing tasks), `refs`, `links`, and the delivery fields
`commit`, `outcome`, `verification`, `release`. Every edit goes through the same
validate-then-rollback path as the CLI, so the panel can never save an invalid state.

---

## 4. CLI reference

The CLI is the agent's entry point and the only *write* interface you should use
for anything it covers. In a host repo the portable form is:

```bash
npx roadmapped <command> [arguments]
```

Every unknown verb is proxied to the task CLI (`init`, `upgrade` and `dashboard`
are handled by the dispatcher itself), and the data root is resolved from your
repo, wherever you run it from. The examples below use the self-hosting form —
inside the Roadmapped repository, `node scripts/task.mjs <command>` is exactly
equivalent:

```bash
node scripts/task.mjs <command> [arguments]
```

> **Read** commands below were run against this repository's live backlog
> (already migrated to stages+teams). **Write** commands were run in an isolated
> sandbox (a copy of `src/` + `scripts/` with a throwaway `tasksDir`, seeded with the
> 8 canonical stages — `add` refuses to write into anything else), because writing to
> the real backlog is out of scope for a doc task. The displayed file paths are always
> shown rooted at `docs/tasks/`. `take` and `quick "<title>"` are **not** demonstrated
> live in this section (both start a real task) — their success output is documented
> from source instead and flagged as such; only their read-only paths (`brief`, and
> `quick`'s own flag-validation error) are shown running for real.

### `sitrep` — the state of the world in one call

The **first** gesture of a session: overall progress, what closed today, what is in
progress (with an age in days), the next three available tasks, a one-word `validate`,
and alerts (stale in-progress ≥ 7 days, open `#debt`, red validate). Capped at ≤ 30
lines — it replaces re-reading the whole backlog at session start (~1 200 tokens →
~150). Titles only; the count stays exact even when the display is truncated with
`(+K more)`.

```console
$ node scripts/task.mjs sitrep
sitrep — 2026-07-08
progress: 25/45 (56%)
done today (2): #64 Token economy 1 · #65 Token economy 2
in_progress (1): #28 Panneau v2 — SectionPanel aligné (3d)
next: #16 Positionnement et copy du site · #3 Spec — création de tâche fluide · #4 Spec — vue Graphe v2
validate: OK
⚠ 1 open debt item(s) (#debt): #72
```

The in-progress age is measured from `createdAt` (there is no `startedAt` field yet);
treat it as a staleness proxy, not a precise start clock.

### `take [--team <t>]` — open a session in one call

The session-opening command: `next` + `start` + `brief`, in **one** call — the
"let's continue on the roadmap" command. It picks the next available task (optionally
filtered by `--team`), starts it, and prints the full execution brief, so no separate
`show` is ever needed to get moving.

```console
$ node scripts/task.mjs take
#16 started (in_progress).
#16 Positionnement et copy du site
stage: 03-identity · team: marketing · size: M
detail: Définir avec Rémi : audience (…) …
refs:
  README.md
  docs/specs/2026-07-07-roadmapped-v2-design.md
done 16 --commit <sha> --outcome "…" --verification "…"
```

> Not run live (it would start a real task on this backlog and cannot be undone from
> the CLI). The `#16 started (in_progress).` line and the `done …` reminder are the exact strings
> `task.mjs` prints (source: `cmdTake`/`briefText`); the brief body below it is
> identical in shape to the real `brief <id>` output shown next — `take` is
> `next` + `start` + that same `briefText()` call, concatenated.

### `brief <id>` — the dense execution context

The CLI equivalent of "copy the agent brief": title, stage, team, size, `detail`,
`refs`, **`dependsOn`/`links` with their title and status inline** (no bare ids), and
a ready-to-paste `done` reminder. This is what `take` prints after starting the task,
and what a delegated subagent should be handed instead of `show --json`.

```console
$ node scripts/task.mjs brief 28
#28 Panneau v2 — SectionPanel aligné + passe finale des critères
stage: 04-build · team: engineering · size: M · tags: panel, ux
detail: Aligner SectionPanel sur le paradigme lecture d'abord (…) Fini quand : les 6 critères sont observés et consignés dans la vérification du done.
refs:
  docs/specs/2026-07-07-task-panel.md
  src/components/SectionPanel.tsx
  src/components/SidePanel.tsx
depends on:
  #27 Panneau v2 — done guidé (mini-formulaire outcome) (done)
done 28 --commit <sha> --outcome "…" --verification "…"
```

Note the last line: for a `quick` task, `brief` prints `done <id> --commit <sha>
--outcome "…"` (no `--verification` slot) since a quick only requires `--outcome` at
`done`. `dependsOn`/`links` lines are only present when the task has any — this one has
no `links`.

**Anchored refs and freshness (opt-in).** A ref written as `file#symbol` (robust —
resolved by grep at serve time, so the snippet is always the *current* code) or
`file:line` (fragile — documented as such) makes `brief` inline the ~10 lines around
that anchor, turning a full-file read (~2 500 tokens) into a snippet (~100). A bare
`file` ref stays a single line. Independently, **any** ref whose file was committed
*after* the ticket's `createdAt` is flagged `⚠ modified since the ticket was created`
(git, day granularity) — trust verified, never blind. A symbol that no longer resolves
prints `⚠ anchor not found (…)` instead of a fabricated snippet.

### `list` — browse the backlog

```
list [--section <key>] [--status todo|in_progress|done] [--team <t>] [--tag <tag>] [--json] [--json-full]
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
  [x] #45  Idée initiale — Roadmapped, gestion de projet locale agent-first  (engineering)
02-initial — Initial Stage (done) 2/2
  [x] #46  Choisir le nom Roadmapped  (engineering)
  [x] #47  Préparer le repo standalone  (engineering)
04-build — Build Stage (open) 20/30
  [x] #1   Audit UX/UI complet du dashboard  (S engineering ux audit)
  [x] #2   Spec — panneau de détail de tâche clarifié  (S engineering ux spec)
  [ ] #3   Spec — création de tâche fluide  (S engineering ux spec)
  ...
```

`--status` filters. `--tag <tag>` keeps
only tasks carrying that tag — this is how the **debt ledger** is queried:
`list --tag debt` surfaces every deliberate shortcut (a `quick` tagged `debt` whose
title names the ceiling), the requestable equivalent of a `ponytail:` code comment.
There is no `--zone` any more — it is an unknown flag (see [`add`](#add--create-a-task) below).

**`--json` is LIGHT by default now**: `{ id, title, status, team, stage, size, kind }`
per task (sub-tasks flattened in), not the full tree — this is the format meant for
scripts/UI consumption and it is what actually gets read (no programmatic call-site
was found reading the old full shape). Need the complete task object (detail, refs,
dates, everything) for every task in one call — `--json-full`, which prints
`{ nextId, sections }` exactly as `--json` used to before this change.

### `show <id>` — full detail of one task

Takes a **global** id (not a per-stage number).

```console
$ node scripts/task.mjs show 47
[x] #47  Préparer le repo standalone  (engineering)
  section: 02-initial
  file: docs/tasks/02-initial/02-preparer-le-repo-standalone.yaml
  detail: Extraire Roadmapped de son incubation dans ZineKit vers un repo autonome : code, dépendances (@types/node explicite), config, backlog.
  outcome: Repo standalone Roadmapped 0.1.0 initialisé — extraction depuis ZineKit, arbre propre.
  verification: Commit d'extraction 388fbb2 ; npm run build et npm run test verts sur le repo autonome.
  commit: 388fbb2
  dates: created 2026-07-07 · completed 2026-07-07 · source user
```

The `(engineering)` next to the title is the task's **team**. Add `--json` to get the
raw task object; for handing context to a subagent, prefer [`brief <id>`](#brief-id--the-dense-execution-context)
instead — it is the official execution entry point now.

**`depends on`/`linked` print the linked task's title and status inline** — no more
bare ids to chase with a follow-up `show`:

```console
$ node scripts/task.mjs show 68
[~] #68  Token economy 5 — mesure avant/après et alignement doc  (S engineering token-economy docs)
  section: 04-build
  file: docs/tasks/04-build/51-token-economy-5-mesure-avant-apres-et-al.yaml
  detail: ⛔ N'exécuter qu'après approbation de la spec par Rémi, et en DERNIER du chantier (dépend de 64-67). (…)
  refs: docs/specs/2026-07-07-token-economy.md · docs/guide.md
  depends on: #64 Token economy 1 — skill scindé en noyau minimal + références routées (done) · #67 Token economy 4 — zone Mini dans le Backlog (création inline, done rapide) (done)
  dates: created 2026-07-07 · source user
```

`#64 … (done)` tells you the dependency is done without a second `show 64` — the old
bare-id format (`linked: #6`) used to force exactly that extra round trip.

### `next` — the one task to do now

Returns the **first available todo** (all dependencies done) of the highest-priority
`open` stage. It never proposes a locked task — that is the whole point of "let's
continue on the roadmap".

```console
$ node scripts/task.mjs next
[ ] #16  Positionnement et copy du site  (M marketing marketing)
  section: 03-identity
  file: docs/tasks/03-identity/01-positionnement-et-copy-du-site.yaml
  detail: Définir avec Rémi : audience (founders solo pilotés par agent IA, utilisateurs Claude Code), promesse centrale (« votre repo est votre outil de gestion de projet »), différenciateurs (fichiers plats sans SaaS ni base de données, agent-first, local, open source), structure de la landing (hero, démo animée, features, quickstart, lien GitHub/skill), langue (EN, FR, ou les deux), ton. Livrable : docs/site-copy.md avec la copy complète et approuvée, section par section. C'est un livrable éditorial — pas de spec technique requise.
  refs: README.md · docs/specs/2026-07-07-roadmapped-v2-design.md
  dates: created 2026-07-07 · source user
```

`next` walked past the fully-`done` `01-idea` and `02-initial` stages and the
partially-done `04-build` stage to reach `03-identity`, the earliest stage that still
has available work — exactly the "which stage am I at" question stages exist to
answer. If every remaining todo is locked, `next` exits 1 with an explanation. Note
that in-progress tasks are skipped — `next` only surfaces *todo* work.

**`--count N`** returns the next *N* available todos as a compact queue instead of one
full detail block — the priority order (stage, then age) is **computed by the app**;
consume it as given, never recompute it by re-reading the backlog:

```console
$ node scripts/task.mjs next --count 3
[ ] #16  Positionnement et copy du site  (M marketing marketing)
[ ] #3   Spec — création de tâche fluide  (S engineering ux spec)
[ ] #4   Spec — vue Graphe v2 (lisibilité et navigation)  (S engineering ux spec)
```

`--team` filters the queue to one team; `--json` prints the same N task objects as an
array (or a single object, unwrapped, when `--count` is 1 or omitted).

### `roadmap` — milestone rollup

```console
$ node scripts/task.mjs roadmap
No roadmap (docs/tasks/_roadmaps.yaml missing).
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
    [~] (available) #2 Wire the login endpoint
  beta — Beta  0/1
    [~] (available) #3 Third task
```

### `validate` — check everything

Validates the whole `docs/tasks/` tree: schema, global id uniqueness, `nextId`,
dependency graph — plus the two invariants stages+teams added: the set of section
folders must be *exactly* the 8 canonical slugs (title included), and every task
must carry a `team` from the fixed enum. Exit 1 on any error.
**Run it after every manual edit.**

```console
$ node scripts/task.mjs validate
OK — 8 sections (45 tasks), nextId=52.
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
#1 created → docs/tasks/04-build/01-set-up-the-database-schema.yaml

$ node scripts/task.mjs add --section 04-build --title "Wire the login endpoint" \
    --team engineering --depends-on 1 --size S \
    --refs "src/api/auth.ts,docs/specs/2026-07-07-auth.md"
#2 created → docs/tasks/04-build/02-wire-the-login-endpoint.yaml
```

Omitting `--team` refuses the write outright, and `--zone` is gone — both fail loud
rather than silently falling back:

```console
$ node scripts/task.mjs add --section 04-build --title "Missing team" --size S
Missing required flag: --team

$ node scripts/task.mjs add --section 04-build --title "Zone flag" --team engineering --zone store
Unknown flag: --zone (allowed: --section, --title, --team, --detail, --tags, --size, --code, --refs, --links, --depends-on, --milestone, --source, --json)
```

`--source` defaults to `ai`; use `--source user` for work that comes from the user's
own notes. `--json` prints the created task object. The CLI only creates top-level
tasks (see [sub-tasks](#5-yaml-formats)).

### `quick "<title>"` — a mini-ticket, half the ceremony

```
quick "<title>" --team <t> [--stage <s>] [--tags a,b] [--start] [--json]
```

For work too small to deserve a full task: a one-line fix, a copy tweak. Only
`--title` (positional) and `--team` are required — no `detail`, no `refs`, no `size`
gate to think about (`--stage` defaults to the first `open` stage). It writes `kind:
quick` onto the task (see [§5](#5-yaml-formats)); `--start` chains a `start` in the
same call. At `done`, a quick only requires `--outcome` — `--verification` is
optional, because for a one-line fix the outcome *is* the verification.

```console
$ node scripts/task.mjs quick
quick: title required (1st positional argument, quoted).
Usage: quick "<title>" --team <t> [--stage <s>] [--tags a,b] [--start] [--json]
```

> The success path (`quick "Fix chevron alignment" --team design --start`) is not run
> live in this doc — it would create and start a real task on this backlog. Per
> source (`cmdQuick`): it prints `#<id> created (quick).`, then `#<id> started (in_progress).` if
> `--start` was passed. Two commands close the loop: `quick "…" --team <t> --start`
> then `done <id> --outcome "…"`.

### `start <id>` — begin work

```console
$ node scripts/task.mjs start 2
#2 started (in_progress).
```

Sets `status: in_progress`. Nothing stops you from starting a *locked* task — the
lock is your discipline, not a technical guard.

### `done <id>` — deliver and record

```
done <id> [--commit <sha>] [--outcome <o>] [--verification <v>] [--release <r>] [--suggest-refs]
```

Sets `status: done`, stamps `completedAt` with today's date, and records the delivery
fields onto the task's YAML (there is no separate delivery document — the "record" is
these fields inside the task file).

```console
$ node scripts/task.mjs done 1 --commit a1b2c3d \
    --outcome "Users and sessions tables ship in the initial migration" \
    --verification "Ran the migration on a scratch DB; \dt lists both tables"
#1 done.
```

- `--outcome` — **what shipped**, one user-facing sentence. This is changelog
  material (done tasks + outcome + release = tomorrow's changelog).
- `--verification` — **what was observed** to prove it works, not "it works".
- `--commit` — the delivery sha. When omitted, the CLI **auto-fills `HEAD`** (`git
  rev-parse --short HEAD`) so the agent never reads git; outside a repo it stays empty.
- `--release` — a version tag if applicable.
- `--suggest-refs` — prints the files in the recorded commit plus the uncommitted diff
  (minus `docs/tasks/` churn) as a **suggestion to confirm**, never written. Apply the
  ones that matter with `update <id> --refs a,b`. Keeps refs honest without a git read.

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
#2 updated.

$ node scripts/task.mjs update 2 --team design
#2 updated.
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
Failed:
  - 04-build/2: team missing or invalid (null) — expected one of: marketing, sales, support, operations, finance, legal, engineering, design
```

— the write rolls back and the task keeps its previous team. For every other field,
passing the literal `null` clears it — scalar, relation, or list. For a list,
`--tags null` writes `tags: []` (verified), on a par with `--depends-on null`. The
empty-string form `--tags ""` still works and stays valid, but is no longer required.

> Historical note: before this was fixed, `--tags null` created a tag literally named
> `null` and `--tags ""` was the only way to empty a list. That gotcha is gone.

> There is no `archive` command any more: a delivered task simply stays `done` in its
> stage (the *Done* column of the Backlog). The done backlog — with `commit`,
> `outcome` and `verification` recorded — **is** the changelog.

### Errors are self-documenting

Every command now fails loud with **that command's own usage line** on a bad or
missing flag — never a generic error, never the full global `USAGE` dump. Two
examples already above, both in this section: `add --zone store` prints `add`'s own
allowed-flags list; `quick` with no title prints `quick`'s one-line usage. The rule
generalizes across the whole CLI: `next`/`take`/`brief`/`show`/`done`/`update` all do
the same. In practice this means `next/take/start/done/add/quick` never need a
reference doc open to use correctly — `--help` and the error message itself are
enough (see [§6](#6-working-with-a-claude-agent)'s golden rule).

### The MCP server — the same commands as auto-documented tools

The final rung of the token economy: `scripts/mcp-server.mjs` exposes the whole CLI as
**MCP tools**. For an agent this beats the CLI on three counts — the tool's JSON schema
*is* its documentation (injected once by the protocol instead of living in a reference),
there is no shell line to assemble and quote, and the output has no formatting noise —
dense text for the reading tools, plus `structuredContent` (always an object, per the MCP
spec) only where the object *is* the payload: write tools return the resulting task, and
clients that prefer `structuredContent` over text would otherwise hide the dense text
([#95](#)). It is the **agent's** surface; the CLI
stays for humans, CI, and tests. Both call the same `src/lib` core (`taskWrites` +
`roadmap` + `render`) — one validation, one lock ([#83](#)), no second write path.

**Activation.** A committed `.mcp.json` at the repo root wires it in:

```json
{
  "mcpServers": {
    "roadmapped": { "command": "node", "args": ["scripts/mcp-server.mjs"] }
  }
}
```

Restart Claude Code to load it (Node ≥ 22.18 — the server imports `.ts` from `src/lib`
with native type-stripping, like the CLI). It coexists with the CLI skill; nothing to
uninstall.

**Tool catalog (13).** Read: `sitrep` (state of the world), `take` (open a session:
next + start + brief), `brief` (dense execution context), `next` (the work queue),
`show` (full task detail), `list` (browse, filter by section/status/team/tag), `roadmap`
(milestone rollup), `validate` (check everything). Write (via `taskWrites`, so validation
+ rollback + lock are inherited): `add`, `quick`, `start`, `done` (auto-fills the HEAD
commit, surfaces the no-refs warning), `update`. A business error (team out of
enum, dependency cycle, missing section) comes back as an `isError` result carrying the
same self-documenting message the CLI prints — the rollback leaves the tree untouched.

### The pre-commit guard — every repo change is a ticket

The rule (born from a real incident, see `docs/process-enforcement-gap.md`): **every
change to the repo is a roadmapped unit — a `quick`, a task, or a spec — without
exception, including right after a `done`.** A `done` is a boundary, not a lid: feedback,
rework, and review fixes each get their own `quick`. "ASAP" is never a reason to skip it —
the `quick` *is* the fast path (~2 commands). Only exchanges that produce no artifact
(questions, explanations, status) stay conversational.

Because a rule an agent must *remember* fails exactly when it matters (long context,
"just polishing" after a done), the app enforces it at the real choke point — the commit:

- **`task.mjs guard`**, wired as a pre-commit hook. In a host repo,
  `npx roadmapped init` installs it — chained after any existing hook (husky,
  lefthook, custom), never clobbering it. In this repository it is a committed hook
  (`scripts/githooks/`, activated automatically by `npm install` via the `prepare`
  script → `git config core.hooksPath`). It **refuses** a commit that stages product files while
  no task is `in_progress`, and its message hands you the exact `quick` command to run.
  It stays out of the way for: backlog-only commits (the consignation itself), merges,
  repos not yet initialized, and anything when a task is in progress.
- **`sitrep` signal** (CLI and MCP): `⚠ N unlogged commit(s) since #<id>` when commits landed
  after the last recorded delivery with no task in progress — drift that slipped through
  becomes visible at the next session opening instead of silent.
- **Escape hatch**: `git commit --no-verify` still works — deliberately. Skipping the
  ticket becomes a conscious, visible act instead of an omission.

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
└── 08-mature/
```

An empty stage (no tasks) still exists as a folder — the dashboard dims it, it is
never removed.

### Task schema — field by field

The field order below is canonical (the CLI writes it this way).

| Field | Type | Meaning |
|---|---|---|
| `id` | int | Allocated by the CLI from `_meta.yaml`. Never chosen by hand, never reused. |
| `kind` | `task` \| `quick` | **Additive, omitted from the YAML for the default** (`task`) — only written when `quick "…"` creates the file. A quick skips `refs`/`detail` gates and only requires `--outcome` (no `--verification`) at `done`; validation rejects `kind: quick` combined with `size: L` (if it's big, it's a task). Never set by hand: created via `quick`, read via `show`/`brief`/`list --json`. |
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

Enforced invariants: ids unique globally; every `dependsOn` id exists; no
self-dependency; the `dependsOn` graph is acyclic; any `milestone` is declared in
`_roadmaps.yaml`; `team` present and in the enum on every task; `kind` is either
`task` or `quick`; a `quick` cannot have `size: L`; a `quick` cannot be marked
`done` without an `outcome`.

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

A `quick` file is the same shape minus the ceremony — `kind: quick` is the only extra
field, `detail`/`refs`/`dependsOn` stay empty, and `verification` can legitimately
stay `null` even once `done`:

```yaml
id: 69
kind: quick
code: null
title: "Fix chevron alignment mobile nav"
status: done
tags: []
size: null
team: design
detail: null
refs: []
links: []
dependsOn: []
milestone: null
source: ai
createdAt: "2026-07-07"
completedAt: "2026-07-07"
commit: null
outcome: "Mobile nav chevron re-centered vertically."
verification: null
release: null
```

### Stage — `_section.yaml`

```yaml
title: "Build Stage"
status: open              # open | done | dormant | abandoned
note: "Build the product AND its business foundations (site, email, accounting)."   # or null
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

### Delivered tasks

A `done` task stays in its stage folder — there is no archive (removed in #154).
`completedAt` is guaranteed (set automatically on `done`), but
`commit`/`outcome`/`verification` exist only if `done` supplied them — so record
them at `done` time. The done backlog **is** the changelog.

---

## 6. Working with a Claude agent

Roadmapped ships a Claude skill (`skills/roadmapped/`) so an agent drives the backlog in
the correct format. The CLI is the agent's **only write interface**.

**The skill is split**: `skills/roadmapped/SKILL.md` is a ≤50-line **core** — compass,
decision ladder, the cycle, one line per command, the prohibitions, and a **router** —
and it is the *only* thing a routine session loads. Everything else lives in
`references/` and is opened **only on its own explicit trigger**, never speculatively:

| Trigger | Reference |
|---|---|
| Breaking a spec down / planning multi-task work | `references/planning.md` |
| First setup of a repo (`docs/tasks/_meta.yaml` absent) | `references/setup.md` |
| Hand-editing a YAML (sub-tasks, uncovered cases) | `references/formats.md` |
| Delegating to subagents | `references/delegation.md` |

For `next`/`take`/`start`/`done`/`add`/`quick` — the everyday commands — **no
reference is opened at all**: the CLI is self-contained, `--help` and the
[self-documenting error messages](#errors-are-self-documenting) are the only guidance
needed. This is the core's explicit "golden rule" and the main token-economy lever
(see `docs/specs/2026-07-07-token-economy.md`): a routine session costs one SKILL.md
read, not a SKILL.md plus three references.

### Developing the skill itself (dogfooding)

If you edit `skills/roadmapped/` in the repo and also want it loaded in your own
sessions, **symlink** the installed skill to the repo instead of copying — a copy
drifts silently the moment you forget to resync:

```bash
ln -sfn "$(pwd)/skills/roadmapped" ~/.claude/skills/roadmapped
```

The installed skill then *is* the repo file. There is no sync step and nothing to
drift.

### First use in a repo — mandatory setup

If `docs/tasks/_meta.yaml` does **not** exist, the repo is not initialised and the
skill routes to the setup phase (`references/setup.md`). It:

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

### The decision ladder — stop at the first rung that holds

Written into the skill's core, run before creating anything:

1. **Does this change even deserve to exist?** If not, create nothing.
2. **Does a `quick` suffice** (isolated fix, size S, no decision to arbitrate)? →
   `quick "…" --team <t> [--start]`, `done <id> --outcome "…"` alone closes it.
3. **Otherwise, does one task suffice?** → `add`, the normal cycle below.
4. **Otherwise** (multi-task, an architecture choice to settle): spec first, **then**
   the tasks (`references/planning.md`) — the hard gate from §1 of that reference.

### The work cycle: `take → work → done`

1. **Take** — `take [--team <t>]`: `next` + `start` + `brief`, **in one call**. It
   picks the next available task (or the id the user asked for, via `start <id>`
   directly if already chosen), starts it, and prints the full execution brief —
   deps/links titled, refs, the exact `done` line to use at the end. No separate
   `show` needed to get moving. If the task is locked, do its prerequisites first;
   never route around a dependency.
2. **Work** — follow `detail` and the documents in `refs`; read the referenced spec
   *before* coding.
3. **Verify the real artifact** — the file produced, the pixel rendered, the command
   run. Not just a typecheck.
4. **Record** — `done <id> --commit <sha> --outcome "…" --verification "…"` for a
   task (`--outcome` alone for a `quick` — it *is* the verification). The outcome says
   what shipped in one user-facing sentence; the verification says what was
   *observed*, never "it works". The task stays `done` in its stage — the done
   backlog is the changelog.

For anything beyond a single task — decomposing a spec into a task graph, sizing,
sequencing with `dependsOn` — `references/planning.md` is the operating manual (①
Idea → Spec hard gate, ② Spec → Tasks). Delegating solo work to fresh subagents lives
in `references/delegation.md` (③), which now hands out `brief <id>` instead of `show
--json` as the subagent's context. Transverse guardrails (TDD, root cause before fix,
proof before claiming success) are in the core's prohibitions below.

### Key prohibitions

- Do **not** hand-edit a task YAML when the CLI covers the operation.
- Do **not** start a locked task, or delete a dependency to unblock yourself, without
  the user's agreement.
- Do **not** touch `_meta.yaml` or reuse an id.
- Do **not** write a status outside `todo|in_progress|done`, or a size outside
  `S|M|L`.
- Do **not** `done` without an honest `--outcome`, and for a `task` (not a `quick`) a
  `--verification` you actually ran — never "it should work".
- Do **not** create markdown checklist plans or a parallel progress ledger — plans
  are `dependsOn` tasks, tracking is their status.
- Do **not** code non-trivial work (ladder rung 4) before the spec is approved, fix a
  bug without understanding the root cause, or stack a fourth patch on an approach
  that failed three times.
- Do **not** create a 9th stage, rename a stage, or write a `kind` outside `task |
  quick`.

Manual editing is allowed **only** for what the CLI does not cover — creating a
sub-task twin folder — and is **always** followed by `validate`. There is no "create
a stage" edit to make: the 8 stages are fixed and created once at setup.

---

## 7. FAQ

**Do ids ever get reused?**
No. `nextId` in `_meta.yaml` is monotonic. Deleting a task never frees its number.
This keeps `dependsOn` and `links` referentially stable forever. Never edit `nextId`
by hand.

**What happens if a write would be invalid?**
Every CLI and dashboard write re-validates the *entire* `docs/tasks/` tree after
writing and **rolls back** on any error — schema violation, duplicate id, dependency
cycle, unknown milestone. You cannot end up in a half-written state.

**Can I edit the files by hand?**
Yes, for what the CLI does not do (creating a sub-task twin folder) — and then run
`node scripts/task.mjs validate`. There is no hand-edit for stages: the 8 are created
once at setup and are immutable. For everything the CLI covers (add, status changes,
field edits), use the CLI: it allocates ids correctly and validates for you. If you
do hand-edit a task, keep the field order canonical and run `validate` immediately.

**Where is the roadmap? The `roadmap` command says there is none.**
The everyday roadmap is the **dashboard's Roadmap view**, built from the *8 fixed
stages* (one column per stage, idea→mature order, dependency state computed). The
`roadmap` *command* reports the optional `_roadmaps.yaml` named milestones, which
most projects (including this one) don't use — hence "No roadmap". Stages *are*
your milestones: to build a roadmap, put each task in the right stage and set your
`dependsOn` edges — there is no section to create or order.

**How do I clear a field with `update`?**
Pass the literal `null` — it works for every field kind now: scalars,
`--depends-on` / `--milestone`, and lists (`tags`, `refs`, `links`). For example
`--tags null` writes `tags: []`. The old workaround `--tags ""` still works but is
no longer necessary.

**Does `done` create a delivery document?**
No. The delivery record *is* the `outcome`, `verification`, `commit` and `release`
fields written onto the task's own YAML. Those fields, on the done tasks, are your
changelog.

**What stops me starting a locked task?**
Nothing technical — `start` and `done` accept a locked task without error. Respecting
locks is the agent's discipline; the dashboard and `next` simply never *offer* locked
work.

**`quick` or `add`? Which one do I use?**
Run the [decision ladder](#the-decision-ladder--stop-at-the-first-rung-that-holds):
isolated fix, size S, nothing to decide → `quick`. Anything needing `detail`, `refs`,
`dependsOn`, or a size beyond S → `add`. Validation enforces the boundary from one
side (`kind: quick` + `size: L` is rejected) but not the other — nothing stops using
`add` for a one-liner, it is just more ceremony than the work needs.

**Why does `list --json` look different from before?**
`--json` became the *light* shape (`id, title, status, team, stage, size, kind`) —
it's what scripts/UI actually consume, and the full task objects were dead weight in
that path. If you need the complete tree (every field, every task) in one call, ask
for `--json-full` instead — it is the old `--json` shape, unchanged.
