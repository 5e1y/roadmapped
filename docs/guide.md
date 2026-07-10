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
| Task | `docs/tasks/<NN-type>/<NN-slug>.yaml` | The unit of work: status, dependencies, and the record of what shipped. Carries its **type** (the folder — the *nature* of the deliverable) and an optional `heat` seed that feeds its priority. |
| Type | `docs/tasks/<NN-type>/_section.yaml` | One of **9 fixed types** — Bug, Feature, Chore, Brainstorm, Design, Marketing, Communication, Legal, Business. **Types are the dashboard's columns**: one column per type, always present, dimmed when empty. |
| Spec | `docs/specs/YYYY-MM-DD-<topic>.md` | The approved design of a feature, written *before* its tasks exist. |
| Doc | `docs/**/*.md` | Project knowledge. Tasks link to it through `refs`. |

The 9 types, in their canonical display order: `01-bug` (Bugs) · `02-feature`
(Features) · `03-chore` (Chores) · `04-brainstorm` (Brainstorms) · `05-design`
(Design) · `06-marketing` (Marketing) · `07-communication` (Communication) ·
`08-legal` (Legal) · `09-business` (Business). They are created once at setup and
are **immutable** — no 10th type, no renaming, no "create a section" command
anywhere (CLI, API, or dashboard). Unlike the tool's earlier model, this is a
**single axis**: a type is the *nature* of what a task delivers — a logo is
`design` even though it serves marketing, a broken checkout is `bug` even on the
marketing site. There is no second "team" field to fill in any more; classifying a
task means walking one short decision tree (see
[`skills/roadmapped/references/formats.md`](../skills/roadmapped/references/formats.md)).
The display order (`01`→`09`) carries **no priority** — see below.

**Priority is a computed temperature, not a column.** Where a task lands in `next`
is never "which type" or "which epic" — it's a number, recomputed on every read
from three equal signals: how long the task has been open and how much it blocks
downstream (automatic), the type's own baseline urgency (`baseHeat` in
`_section.yaml` — a `bug` starts hotter than a `chore`), and an optional manual seed
you pose with `--heat` (0–100, absent by default). To make a task jump the queue:
set `--heat` on it, or make something depend on it — never reorder a column or an
epic (an **epic** — the `epic` field, e.g. `graph-revamp` — groups tasks across
types for a project's story, but it never orders or prioritizes anything).

Three properties follow from this design and are enforced everywhere:

- **Every write is validated, then rolled back if invalid.** The CLI and the
  dashboard share the exact same validator (`src/lib/validate.ts`). A mutation that
  would break the schema, duplicate an id or create a dependency cycle leaves the
  files untouched.
- **Ids are never reused.** A monotonic counter in `_meta.yaml` (`nextId`) hands out
  every id. Deleting a task never frees its number.
- **Dependency state — and priority — are computed, never stored.** Whether a task
  is *done*, *available* or *locked* is derived on the fly from its `status` and its
  `dependsOn` list; its temperature is derived on the fly from the graph, its age,
  its type, and its `heat`. You place tasks in their type and set the dependencies
  (and, rarely, a `heat`); the roadmap and the queue draw themselves.

There is no separate "plan" file. An implementation plan *is* a set of tasks chained
by `dependsOn` (the order) and classified into the type they belong to (the nature
of the deliverable). Progress tracking *is* the task statuses. If you find yourself
keeping a parallel checklist, you are fighting the tool.

---

## 2. Installation in a host repo

Roadmapped is an npm package: the tool lives in `node_modules/roadmapped/`, the
*data* (backlog, config) lives at the root of **your** repo. Install and scaffold:

```bash
npm install --save-dev roadmapped
npx roadmapped init          # config + 9-type skeleton + skill + MCP entry + guard hook
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
| `tasksDir` | Where the backlog lives (types, tasks, `_meta.yaml`). | `docs/tasks` |
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

`npx roadmapped dashboard` serves a three-view app. The left sidebar switches between **Backlog**,
**Roadmap** and **Docs**; the last view is remembered across reloads. Clicking any
task anywhere opens a **side panel** on the right.

### One package, many repos

The dashboard **code** ships in the package (`node_modules/roadmapped/`); the **data** it
shows belongs to the repo you launch it from (`ROADMAPPED_ROOT`, resolved by walking up
from the current directory). One package, N host repos. The header spells out which repo
the window is looking at: **Roadmapped × yourrepo** (top-left), and the browser tab title
is prefixed with the repo name — so several open dashboards stay distinguishable.

Working on two repos at once just works: run `npx roadmapped dashboard` in each. The
first takes port **5173**; the second sees that 5173 already serves a *different* repo and
lets Vite auto-increment to **5174** (and so on). Launching twice in the *same* repo is a
no-op — it just reopens the existing window. Need a fixed port for the second repo:
`npx roadmapped dashboard --port 5174`.

### Backlog

The working list. The 9 types in canonical order (empty ones dimmed and collapsed by
default), each with a `done/total` count and its tasks below. A task row shows a status
glyph (`[ ]` todo, `[~]` in progress, `[x]` done), the `#id`, the title, and chips for its
`code`, `size`, `heat` (only shown when set — `heat 80`, a raw seed, not the computed
temperature) and `tags`. Sub-tasks are indented under their parent. This is
where you do full CRUD on tasks — add a task to any type, edit fields, change status.
There is no "add type" button: the 9 types are fixed. A "group by epic" mode groups
tasks across types by their `epic` field — purely a view, it changes nothing about order.

### Roadmap — Columns and Graph

The Roadmap view treats **the 9 fixed types as columns**, always in the same
canonical order. An empty type renders dimmed and narrow (grey header, "0" count,
no body) so the full set stays visible without competing for attention with the
populated types. It has two modes, toggled in the header (*Columns* / *Graph*).

- **Columns** — each type is a column with a progress bar and its task cards.
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

The set of available cards, ranked by temperature, is your "work front" — what can
legitimately be started right now, in the order `next` would serve it.

### Docs

Renders `docsDir` (`docs/`) as a browsable markdown tree. The sidebar lists the
files; the pane renders the selected one with clickable heading anchors and working
relative `.md` links. This guide itself renders here.

### Side panel

Clicking a task opens it on the right for inline editing: title, status, size, `heat`
(a ghost numeric input, 0–100, blank = cold), code, tags, `dependsOn` (chosen from
existing tasks), `epic` (combobox, create-on-the-fly), `refs`, `links`, and the
delivery fields `commit`, `outcome`, `verification`, `release`. Every edit goes
through the same validate-then-rollback path as the CLI, so the panel can never save
an invalid state.

---

## 4. CLI reference

The CLI is the agent's entry point and the only *write* interface you should use
for anything it covers. In a host repo the portable form is:

```bash
npx roadmapped <command> [arguments]
```

Every unknown verb is proxied to the task CLI (`init`, `upgrade` and `dashboard`
are handled by the dispatcher itself), and the data root is resolved from your
repo, wherever you run it from. The examples below use `npx roadmapped`; inside
the Roadmapped repository (self-hosting), `node scripts/task.mjs <command>` is
exactly equivalent:

```bash
node scripts/task.mjs <command> [arguments]
```

> **Read** commands below were run against this repository's live backlog
> (already migrated to the 9 types + temperature model, #230/#234). **Write**
> commands were run in an isolated sandbox (a copy of `src/` + `scripts/` with a
> throwaway `tasksDir`, seeded with the 9 canonical types — `add` refuses to write
> into anything else), because writing to the real backlog is out of scope for a
> doc task. The displayed file paths are always shown rooted at `docs/tasks/`.
> `take` and `quick "<title>"` are **not** demonstrated live against the real
> backlog (both start a real task) — their read-only paths (`brief`, and `quick`'s
> own flag-validation error) are shown running for real against it; the sandbox
> demonstrates the actual write.

### `sitrep` — the state of the world in one call

The **first** gesture of a session: overall progress, what closed today, what is in
progress (with an age in days), the next three available tasks (temperature order),
a one-word `validate`, and alerts (stale in-progress ≥ 7 days, open `#debt`, red
validate). Capped at ≤ 30 lines — it replaces re-reading the whole backlog at
session start (~1 200 tokens → ~150). Titles only; the count stays exact even when
the display is truncated with `(+K more)`.

```console
$ npx roadmapped sitrep
sitrep — 2026-07-09
progress: 196/220 (89%)
done today (34): #199 BUG install : init écrit roadmapped@^0.1.0 (…) · #202 BUG dashboard écran blanc en host-install (…) (+32 more)
in_progress (1): #236 Jalons v2 — Phase 4 : skill + docs + repositionnement site (0d)
next: #218 Audit des licences des dépendances (compat MIT, attributions requises) · #220 Politique de contribution : DCO/CLA ou clause claire (droits sur les contributions) · #212 Logo Roadmapped — concept + déclinaisons
validate: OK
⚠ 1 open debt item(s) (#debt): #176
```

The in-progress age is measured from `startedAt` (falling back to `createdAt` on
tasks predating that field); treat it as a staleness proxy, not a precise start
clock.

### `take [--type <t>]` — open a session in one call

The session-opening command: `next` + `start` + `brief`, in **one** call — the
"let's continue on the roadmap" command. It picks the highest-temperature available
task (optionally filtered by `--type`), starts it, and prints the full execution
brief, so no separate `show` is ever needed to get moving.

```console
$ npx roadmapped take
#218 started (in_progress).
#218 Audit des licences des dépendances (compat MIT, attributions requises)
type: 08-legal · epic: legal-readiness · tags: legal, publish
detail: Passer en revue les licences des deps (…)
done 218 --commit <sha> --outcome "…" --verification "…"
```

> Not run live (it would start a real task on this backlog and cannot be undone from
> the CLI). The `#218 started (in_progress).` line and the `done …` reminder are the
> exact strings `task.mjs` prints (source: `cmdTake`/`briefText`); the brief body
> below it is identical in shape to the real `brief <id>` output shown next — `take`
> is `next` + `start` + that same `briefText()` call, concatenated.

### `brief <id>` — the dense execution context

The CLI equivalent of "copy the agent brief": title, `type` (the section slug),
`epic`/`heat`/`kind`/`size`/`tags` (only the ones actually set), `detail`,
`refs`, **`dependsOn`/`links` with their title and status inline** (no bare ids), and
a ready-to-paste `done` reminder. This is what `take` prints after starting the task,
and what a delegated subagent should be handed instead of `show --json`.

```console
$ npx roadmapped brief 218
#218 Audit des licences des dépendances (compat MIT, attributions requises)
type: 08-legal · epic: legal-readiness · tags: legal, publish
detail: Passer en revue les licences des deps (react, @base-ui/react, trinil-react, tailwindcss, vite, marked, js-yaml, amaro, @modelcontextprotocol/sdk, dagre…) : toutes compatibles avec une distribution MIT/open-source ? attributions ou fichiers de licence à embarquer ? repérer tout copyleft (GPL/LGPL) problématique. Outil possible : license-checker.
done 218 --commit <sha> --outcome "…" --verification "…"
```

```console
$ npx roadmapped show 214
[ ] #214 Charte graphique / brand guidelines — document  (design brand docs)
  section: 05-design
  file: docs/tasks/05-design/15-charte-graphique-brand-guidelines-docume.yaml
  detail: Rédiger la charte : couleurs (tokens actuels + éventuelle palette de marque), typographie, échelle d'espacement, usage du logo, do/don't, ton visuel, exemples. Dérivable de docs/design.md + docs/tone-of-voice.md ; Rémi valide les partis-pris. Dépend des décisions DA (owner Rémi) et du logo.
  depends on: #212 Logo Roadmapped — concept + déclinaisons (todo) · #213 Direction artistique : trancher les partis-pris de marque (palette étendue, style visuel, ton graphique) (todo)
  dates: created 2026-07-09T13:54:57 · source ai
```

Note the last line: `brief` prints a ready-to-paste `done <id> --commit <sha>
--outcome "…" --verification "…"` reminder — `--verification` is encouraged but
never blocking at `done`, for every task. Meta fields (`heat`, `kind`, `epic`, `size`, `tags`)
each only appear when set — `#218` has no `heat` and is a plain `task`, so neither
shows.

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
list [--type <t>] [--status todo|in_progress|done] [--tag <tag>] [--json] [--json-full]
```

(`--section`/`--stage` remain accepted aliases of `--type`, same as `add`/`update`.)

```console
$ npx roadmapped list --type legal
08-legal — Legal (open) 0/5
  [ ] #217 Licence du projet : confirmer MIT, fichier LICENSE (holder, année), cohérence README/site  (legal publish)
  [ ] #218 Audit des licences des dépendances (compat MIT, attributions requises)  (legal publish)
  [ ] #219 Attributions tierces : NOTICE / THIRD-PARTY si requis  (legal publish)
  [ ] #220 Politique de contribution : DCO/CLA ou clause claire (droits sur les contributions)  (legal publish)
  [ ] #221 Nom & marque « Roadmapped » : disponibilité (trademark, org GitHub/npm, domaine)  (owner-remi legal publish)
```

`--type` takes either the full folder slug (`08-legal`) or the bare name (`legal`) —
both filter identically for `list`/`next`. `--status` filters by status. `--tag <tag>`
keeps only tasks carrying that tag — this is how the **debt ledger** is queried:

```console
$ npx roadmapped list --tag debt
03-chore — Chores (open) 8/8
  [x] #104 Liaison vérifiable commit↔tâche (…)  (quick debt process)
  [x] #105 guard : mapping fichiers stagés↔tâche in_progress (…)  (quick debt process)
  ...
04-brainstorm — Brainstorms (open) 0/1
  [ ] #176 Décision design : toggle show-done (…) À trancher par Rémi  (quick debt design-system)
05-design — Design (open) 2/2
  [x] #134 Re-capturer docs/assets/dashboard.png — obsolète (…)  (quick debt)
  [x] #138 Graphe : un prérequis dans un epic replié affiché « +n hors graphe » (…)  (quick debt)
```

**`--json` is LIGHT**: `{ id, title, status, type, size, kind, heat }` per task
(sub-tasks flattened in), not the full tree — this is the format meant for
scripts/UI consumption. Need the complete task object (detail, refs,
dates, everything) for every task in one call — `--json-full`, which prints
`{ nextId, sections }` in full.

### `show <id>` — full detail of one task

Takes a **global** id (not a per-type number).

```console
$ npx roadmapped show 218
[ ] #218 Audit des licences des dépendances (compat MIT, attributions requises)  (legal publish)
  section: 08-legal
  file: docs/tasks/08-legal/23-audit-des-licences-des-dependances-compa.yaml
  detail: Passer en revue les licences des deps (react, @base-ui/react, trinil-react, tailwindcss, vite, marked, js-yaml, amaro, @modelcontextprotocol/sdk, dagre…) : toutes compatibles avec une distribution MIT/open-source ? attributions ou fichiers de licence à embarquer ? repérer tout copyleft (GPL/LGPL) problématique. Outil possible : license-checker.
  dates: created 2026-07-09T13:55:19 · source ai
```

`show`'s plain-text output prints `section:` (the type folder) — it doesn't surface
`heat`/`epic` inline the way `brief` does; add `--json` to get the raw task object
(every field, `heat`/`epic` included). For handing context to a subagent, prefer
[`brief <id>`](#brief-id--the-dense-execution-context) instead — it is the official
execution entry point now.

**`depends on`/`linked` print the linked task's title and status inline** — no more
bare ids to chase with a follow-up `show`:

```console
$ npx roadmapped show 214
[ ] #214 Charte graphique / brand guidelines — document  (design brand docs)
  section: 05-design
  file: docs/tasks/05-design/15-charte-graphique-brand-guidelines-docume.yaml
  detail: Rédiger la charte (…)
  depends on: #212 Logo Roadmapped — concept + déclinaisons (todo) · #213 Direction artistique : trancher les partis-pris de marque (palette étendue, style visuel, ton graphique) (todo)
  dates: created 2026-07-09T13:54:57 · source ai
```

`#212 … (todo)` tells you the dependency isn't done yet without a second `show 212` —
the old bare-id format used to force exactly that extra round trip.

### `next` — the highest-temperature available task

Returns the **first available todo** (all dependencies done), ranked by computed
**temperature** — never by "which column" or "which epic". It never proposes a
locked task — that is the whole point of "let's continue on the roadmap".

```console
$ npx roadmapped next --count 5
[ ] #218 Audit des licences des dépendances (compat MIT, attributions requises)  (legal publish)
[ ] #220 Politique de contribution : DCO/CLA ou clause claire (droits sur les contributions)  (legal publish)
[ ] #212 Logo Roadmapped — concept + déclinaisons  (owner-remi design brand)
[ ] #15  Publier le skill sur le marketplace Claude  (S skill open-source)
[ ] #217 Licence du projet : confirmer MIT, fichier LICENSE (holder, année), cohérence README/site  (legal publish)
```

Here `08-legal` tasks lead not because "legal comes before design" (the display
order encodes nothing) but because `legal` has a high `baseHeat` (compliance debt
compounds) and these tickets have aged. Without `--count`, `next` prints the single
top task with its full detail block, exactly like `show`. If every remaining todo is
locked, `next` exits 1 with an explanation. Note that in-progress tasks are skipped
— `next` only surfaces *todo* work.

**`--count N`** returns the next *N* available todos as a compact queue instead of one
full detail block — the priority order (temperature, then id) is **computed by the app**;
consume it as given, never recompute it by re-reading the backlog. `--type` filters the
queue to one type (full slug or bare name); `--json` prints the same N task objects as an
array (or a single object, unwrapped, when `--count` is 1 or omitted).

**Prioritizing a task, concretely** — two levers, no third:
- `add --heat 80 ...` or `update <id> --heat 80` (0–100; `--no-heat` or `--heat 0` cools
  it back to absent). A high `heat` adds up to a third of the total temperature — real
  weight, not a guarantee: an old, high-`baseHeat` ticket that blocks a lot can and does
  outrank a maxed `--heat` on something colder by nature.
- `add --depends-on <id> ...` on a new or existing task: declaring that something
  depends on `<id>` heats `<id>` up (it now blocks active work).

Reordering `_epics.yaml` does neither — epics are unordered groupings, full stop.

### `roadmap` — progress + per-epic view

```console
$ npx roadmapped roadmap
overall progress: 196/220 (89%)

a11y  4/4
  [x] #115 Fixes a11y — appliquer les findings clavier + contraste
  [x] #118 a11y mineurs assumés (audit #107) (…)  (quick)
  [x] #107 Audit a11y 1 — navigation clavier complète du dashboard
  [x] #108 Audit a11y 2 — contraste WCAG AA (…)

brand-identity  0/5
  [~] (available) #212 Logo Roadmapped — concept + déclinaisons
  [~] (available) #213 Direction artistique : trancher les partis-pris de marque (…)
  [ ] (locked: #212 #213) #214 Charte graphique / brand guidelines — document
  [ ] (locked: #212) #216 Déclinaisons de marque post-logo : favicon, app icons, og image réelle
  [~] (available) #215 Peaufiner la DA du dashboard — passe de polish UI

community-github  0/6
  ...
```

Each group here is an **epic** — a project's tasks across several types, discovered
automatically from the shared `epic` field (no `_epics.yaml` required; this
repository doesn't have one). The groups are printed in the order they're
encountered — that ordering is cosmetic, not a priority ranking; `next`'s
temperature sort is the only thing that decides work order. A task with no `epic`
lands in an "(no epic) N active task(s) unassigned" tail line, not a group of its
own.

### `validate` — check everything

Validates the whole `docs/tasks/` tree: schema, global id uniqueness, `nextId`,
dependency graph — plus the invariants #230/#234 added: the set of section
folders must be *exactly* the 9 canonical slugs (title included); `team` is
forbidden on any active task; `heat` (task) and `baseHeat` (`_section.yaml`) stay
within bounds if present. Exit 1 on any error. **Run it after every manual edit.**

```console
$ npx roadmapped validate
OK — 9 sections (220 tasks), nextId=238.
```

### `add` — create a task

```
add --type <type> --title <t> [--detail <d>] [--tags a,b] [--heat 0-100]
    [--size S|M|L] [--code <c>] [--refs a,b] [--links 1,2] [--depends-on 1,2]
    [--epic <slug>] [--kind task|milestone] [--blocks 1,2]
    [--source ai|user] [--json]   (--section/--stage are accepted aliases of --type)
```

`--type` is **required** and must be the exact folder slug (`01-bug` … `09-business`
— unlike `list`/`next`, `add` does not resolve a bare name like `bug`). The id is
allocated from `_meta.yaml`; the file is created in the type folder.

```console
$ npx roadmapped add --type 02-feature --title "Set up the database schema" \
    --detail "Create the users and sessions tables." --tags backend,db --size M
#1 created → docs/tasks/02-feature/01-set-up-the-database-schema.yaml

$ npx roadmapped add --type 01-bug --title "Checkout is broken in prod" \
    --heat 80 --size S
#2 created → docs/tasks/01-bug/01-checkout-is-broken-in-prod.yaml
```

Both run for real in the sandbox described above. `--team` is gone — like `--zone`
before it, it fails loud rather than silently falling back:

```console
$ npx roadmapped add --type 02-feature --title "Missing team old flag" --team engineering --size S
Unknown flag: --team
Usage: add --type <type> --title <t> [--detail <d>] [--tags a,b] [--heat 0-100] [--size S|M|L]
        [--code <c>] [--refs a,b] [--links 1,2] [--depends-on 1,2] [--epic <slug>]
        [--kind task|milestone] [--blocks 1,2] [--source ai|user] [--json]  (--section/--stage = aliases of --type)

$ npx roadmapped add --title "No type given" --size S
Missing required flag: --type (the nature/section, e.g. 02-feature)
```

`--source` defaults to `ai`; use `--source user` for work that comes from the user's
own notes. `--json` prints the created task object. The CLI only creates top-level
tasks (see [sub-tasks](#5-yaml-formats)).

**Milestones** (`--kind milestone --blocks 1,2`) run for real too:

```console
$ npx roadmapped add --type 02-feature --title "App public v1 shipped" \
    --kind milestone --blocks 1,2
#6 created → docs/tasks/02-feature/02-app-public-v1-shipped.yaml
#6 now blocks: #1 #2
```

`--blocks` adds the new task's id to the `dependsOn` of every task cited (here #1
and #2) — the ergonomic inverse of `--depends-on`; ids are checked to exist BEFORE
anything is written.

### `quick "<title>"` — a rapid-create alias for a task

```
quick "<title>" [--type <t>] [--tags a,b] [--heat 0-100] [--start] [--json]
```

For work too small to deserve the full `add` form: a one-line fix, a copy tweak. Only
`--title` (positional) is required — `--type` defaults to the first `open` type if
omitted, no `detail`, no `refs`, no `size` to think about. It creates a plain,
ordinary `task` (see [§5](#5-yaml-formats)) — `quick` is purely a rapid-create
shortcut, not a distinct kind; `--start` chains a `start` in the same call. At `done`,
`--verification` is encouraged but never blocking — the same as for any task.

```console
$ npx roadmapped quick
quick: title required (1st positional argument, in quotes).
Usage: quick "<title>" [--type <t>] [--tags a,b] [--heat 0-100] [--start] [--json]  (rapid-create alias for a task)
```

```console
$ npx roadmapped quick "Fix chevron alignment mobile nav" --type 05-design --start
#3 created.
#3 started.
```

The second command ran for real in the sandbox. Two commands close the loop:
`quick "…" [--type <t>] --start` then `done <id> --outcome "…"`.

### `start <id>` — begin work

```console
$ npx roadmapped start 2
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
$ npx roadmapped done 3 --outcome "Typo fixed on landing hero"
#3 done. commit=14aaf6b (HEAD).
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
    [--size] [--heat 0-100|--no-heat] [--code] [--source] [--commit] [--outcome]
    [--verification] [--release] [--depends-on 1,2] [--epic <slug>]
```

```console
$ npx roadmapped update 2 --status in_progress --code C1
#2 updated.

$ npx roadmapped update 1 --heat 45.5
#1 updated.
```

`--heat 0` and `--no-heat` are equivalent — both clear the field back to absent
(cold). `--milestone` still works as a **deprecated** alias for `--epic`, printing a
warning:

```console
$ npx roadmapped update 1 --milestone graph-revamp
⚠ --milestone is deprecated (renamed --epic, #133) — alias applied.
#1 updated.
```

`--team` no longer exists — like every removed flag, it fails loud:

```console
$ npx roadmapped update 1 --team design
Unknown flag: --team
Usage: update <id> [--title ...] [--detail ...] [--status ...] [--heat 0-100|--no-heat] [--tags a,b] [--refs a,b]
        [--links 1,2] [--depends-on 1,2] [--epic <slug>] [--size ...] [--code ...] [--outcome ...] …
```

**Clearing a field — two different conventions:**

| Field kind | Fields | How to clear |
|---|---|---|
| Scalar / string | `title`, `detail`, `status`, `size`, `code`, `source`, `commit`, `outcome`, `verification`, `release` | pass the literal `null` |
| Relations | `depends-on`, `epic` | pass `null` |
| Lists | `tags`, `refs`, `links` | pass `null` (or `""`) |
| Heat | `heat` | `--heat 0` or `--no-heat` (both clear it — there's no `team`-style "required" exception any more: `heat` is optional on every task) |

> Historical note: before this was fixed, `--tags null` created a tag literally named
> `null` and `--tags ""` was the only way to empty a list. That gotcha is gone.

> There is no `archive` command any more: a delivered task simply stays `done` in its
> type (the *Done* column of the Backlog). The done backlog — with `commit`,
> `outcome` and `verification` recorded — **is** the changelog.

### Errors are self-documenting

Every command now fails loud with **that command's own usage line** on a bad or
missing flag — never a generic error, never the full global `USAGE` dump. Two
examples already above, both in this section: `add --team ...` prints `add`'s own
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
next + start + brief), `brief` (dense execution context), `next` (the temperature-ranked
work queue), `show` (full task detail), `list` (browse, filter by type/status/tag), `roadmap`
(per-epic progress rollup), `validate` (check everything). Write (via `taskWrites`, so validation
+ rollback + lock are inherited): `add`, `quick`, `start`, `done` (auto-fills the HEAD
commit, surfaces the no-refs warning), `update`. A business error (unknown type,
dependency cycle, `heat` out of bounds) comes back as an `isError` result carrying the
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
CLI/API writes). `docs/tasks/` holds **exactly the 9 canonical types** below — no
other section folder is admitted, and `validate` rejects a 10th one, a non-canonical
slug, or a missing type:

| Folder | Canonical title | Spirit (default note at setup) |
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

The `01`→`09` order is a display convenience only — it encodes no priority (see
[§4's `next`](#next--the-highest-temperature-available-task) and the temperature
model below). Classifying a task into its type is a short decision (first match
wins — see [`skills/roadmapped/references/formats.md`](../skills/roadmapped/references/formats.md)
for the full tree): something broken → `bug`; a decision/spec document →
`brainstorm`; a visual/UX artefact → `design`; legal paperwork → `legal`; money or a
direct client → `business`; durable acquisition content → `marketing`; outward
posts/announcements/support → `communication`; otherwise code/product that adds a
capability → `feature`, that doesn't → `chore`.

File tree:

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — global counter, monotonic, never hand-edited
├── _epics.yaml                 # optional — epic titles (NOT an order — epics never prioritize)
├── 01-bug/                     # canonical type, created once at setup — never created/renamed by hand
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # a task = a file
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # twin folder = sub-tasks of 02-<slug>.yaml
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

An empty type (no tasks) still exists as a folder — the dashboard dims it, it is
never removed.

### Task schema — field by field

The field order below is canonical (the CLI writes it this way).

| Field | Type | Meaning |
|---|---|---|
| `id` | int | Allocated by the CLI from `_meta.yaml`. Never chosen by hand, never reused. |
| `kind` | `task` \| `milestone` | **Additive, omitted from the YAML for the default** (`task`). Only `milestone` ever materializes this field: a target other tasks lock onto via `dependsOn` (`add --kind milestone --blocks 1,2`), rendered as a diamond. Never set by hand: created via `add --kind`, read via `show`/`brief`/`list --json`. (`quick` creates a plain `task`, not a distinct kind.) |
| `code` | string \| null | Optional short human code (e.g. `B3`). |
| `title` | string | The task title. |
| `status` | `todo` \| `in_progress` \| `done` | Nothing else is valid. |
| `tags` | string[] | Free labels; `[]` if none. |
| `size` | `S` \| `M` \| `L` \| null | Rough effort. |
| `heat` | number \| null | **Optional** priority seed, `0 ≤ heat ≤ 100`, 2 decimals max. Absent/null = cold (0) — the norm; no `heat: 0` is ever written for that reason. Feeds one of the three equal tiers of the computed *temperature* that orders `next` (see below). Set with `add --heat`/`update --heat`, clear with `update --no-heat`. |
| `detail` | string \| null | The *what* and *why*, known traps, definition of done. |
| `refs` | string[] | Relevant files: code (`path:line`) **and** documentation. |
| `links` | int[] | Ids of related tasks (context, not order). |
| `dependsOn` | int[] | Prerequisite ids. The task is *locked* until they are all done — and, as a side effect, is exactly how you make an existing task hotter (it now blocks active work). |
| `epic` | string \| null | Cross-type grouping: a slug shared by tasks of the same project (e.g. `graph-revamp`). **Unordered** — an epic groups a story across types, it never prioritizes. No declaration required. |
| `source` | `user` \| `ai` | Who created the task. |
| `createdAt` | date string | Set at creation. |
| `completedAt` | date string \| null | Set automatically on `done`. |
| `commit` | string \| null | Delivery sha (`done --commit`). |
| `outcome` | string \| null | What shipped, one user-facing sentence (`done --outcome`). Changelog material. |
| `verification` | string \| null | How the artifact was verified (`done --verification`). |
| `release` | string \| null | Release version, if applicable. |

Enforced invariants: ids unique globally; every `dependsOn` id exists; no
self-dependency; the `dependsOn` graph is acyclic; any `epic` is a lowercase/digit/hyphen
slug or null; `heat` absent/null or a number in `[0, 100]` with ≤ 2 decimals; **`team`
is forbidden** on any active task (removed from the model — `_archive/` keeps its old
`team:` and is never re-validated); `kind` is one of `task`/`milestone`.

```yaml
id: 42
code: null
title: "Wire the login endpoint"
status: todo
tags: [backend, db]
size: S
heat: null
detail: |
  Create the POST /login handler against the sessions table.
refs:
  - src/api/auth.ts:120
  - docs/specs/2026-07-07-auth.md
links: []
dependsOn: [41]
epic: null
source: ai
createdAt: "2026-07-07"
completedAt: null
commit: null
outcome: null
verification: null
release: null
```

A `milestone` file is the same shape with one extra field — `kind: milestone` is the
only addition (`task`, the default, omits `kind` entirely). `--blocks` populates the
`dependsOn` of the tasks it gates, so the milestone's own `dependsOn` can stay empty:

```yaml
id: 69
kind: milestone
code: null
title: "App public v1 shipped"
status: todo
tags: []
size: null
heat: null
detail: null
refs: []
links: []
dependsOn: []
epic: null
source: ai
createdAt: "2026-07-07"
completedAt: null
commit: null
outcome: null
verification: null
release: null
```

### Temperature — how `next` actually orders the queue

Never stored, never present in a YAML — computed on every read from the tree and
today's date, rounded to 0.01 before sorting:

```
temperature = auto + base + seed          each term ≤ 33.33, total ≤ 100

auto = min(33.33 ; 20·B + 13.33·A)        MACHINE tier — B = downstream active blockers (saturating), A = age (saturating, half-life 90 days)
base = section's baseHeat (or the type's built-in default)   NATURE tier — fixed per type, e.g. bug 30, business 20, legal 18, feature 14, design 12, brainstorm 10, marketing 7, communication 7, chore 5
seed = heat / 3                            HUMAN tier — the stored 0-100 `heat` field
```

The three tiers are **equal** — none overrides the others. A `bug` that's old and
blocks several other tasks can and should outrank a `design` task someone maxed
`--heat` on: the seed adds weight, it never short-circuits the real signal. This is
also why an empty dependency graph and no seeds anywhere still produces a useful,
stratified queue (bugs first, chores last, ties broken by age) instead of flat FIFO.

### Type — `_section.yaml`

```yaml
title: "Bugs"
status: open              # open | done | dormant | abandoned
baseHeat: 30               # optional, 0-33.33 — this type's NATURE tier of temperature; absent = code default
note: "Something is broken or doesn't behave as promised — product, site, tool, any surface."   # or null
```

`title` is **locked** by validation: it must be exactly the canonical title of the
type (table above). `status` and `note` stay free — `note` is pre-filled with the
type's spirit at setup and can grow over time. `baseHeat` is the one field worth
tuning per project (still bounded to `[0, 33.33]`): raise a type's baseline urgency
without touching a single task.

**There is no "create a section" command** — not in the CLI, not in the API, not by
hand. All 9 types are created once at setup (see [§6](#6-working-with-a-claude-agent))
and are immutable: never renamed, never added to, never removed. `next` serves the
highest-temperature available todo — never "the first type in order".

### Sub-tasks — twin folder

The CLI creates only top-level tasks. A sub-task lives in a **twin folder** named
exactly like its parent file (`04-x/` next to `04-x.yaml`). The clean way to make
one: `add` the task in the type (so the id is allocated properly), then `mv` its
file into the twin folder (use `mv`, not `git mv` — the file is untracked), then
`validate`. Never consume `nextId` by hand. A parent's status is never recomputed
from its sub-tasks (a deliberate decision).

### Epics — `_epics.yaml` (optional, unordered)

```yaml
epics:
  - { slug: graph-revamp, title: "Graph revamp" }
  - { slug: foundation,   title: "Foundation" }
```

Declares readable titles for epics — nothing more. Epic slugs are auto-discovered
from the tasks that carry them; `_epics.yaml` is entirely optional and its file
order is cosmetic, never a priority ranking. **Backward compat**: an old
`_roadmaps.yaml` (named roadmaps + ordered milestones) is still READ — its
flattened milestones become epics — but is no longer written.

### Delivered tasks

A `done` task stays in its type folder — there is no archive (removed in #154).
`completedAt` is guaranteed (set automatically on `done`), but
`commit`/`outcome`/`verification` exist only if `done` supplied them — so record
them at `done` time. The done backlog **is** the changelog.

---

## 6. Working with a Claude agent

Roadmapped ships a Claude skill (`skills/roadmapped/`) so an agent drives the backlog in
the correct format. The CLI is the agent's **only write interface**.

**The skill is split**: `skills/roadmapped/SKILL.md` is a ≤60-line **core** — compass,
decision ladder, the classification tree, the temperature model, one line per command,
the prohibitions, and a **router** — and it is the *only* thing a routine session loads.
Everything else lives in `references/` and is opened **only on its own explicit trigger**,
never speculatively:

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
   checkbox plans, `docs/specs/`, existing docs, and the code (which suggests the
   natural *nature* of each item — broken, a new capability, infra, a visual asset,
   outward content, legal, money-related, or a decision to make).
2. **Classifies everything into the 9 fixed types** using the decision tree (first
   match wins) and waits for the user's approval — there is nothing to propose about
   the types themselves (always the same 9, in the same order); the work is
   classifying. Every open item becomes a task in the type it belongs to
   (finished/checked items are *not* imported, except a couple of retroactive `done`
   tasks that tell the project's real origin story); ordered plan steps become
   `dependsOn` chains (which also seeds real priority signal — no `heat` needed by
   default); existing docs are wired into `refs`. Old phase/version language ("v1",
   "beta", "phase 2") tells you nothing about type — classify by nature, never by
   the phase it was written under.
3. **Initialises**: create `_meta.yaml` (`nextId: 1`), create the 9 canonical type
   folders with their locked titles and seeded `baseHeat`, `validate`, then create
   tasks **via the CLI only** (`add --type <type>`, exact folder slug required), in
   dependency order.

If `_meta.yaml` already exists, the repo is initialised — the agent never re-runs
setup (it would overwrite real state) and never creates a stray task in an
uninitialised repo.

### The decision ladder — stop at the first rung that holds

Written into the skill's core, run before creating anything:

1. **Does this change even deserve to exist?** If not, create nothing.
2. **Is it a title-only fix** (isolated, nothing to fill in, no decision to arbitrate)? →
   the `quick "…" [--type <t>] [--start]` fast path, then `done <id> --outcome "…"` closes it.
3. **Otherwise, does one task suffice?** → `add`, the normal cycle below.
4. **Otherwise** (multi-task, an architecture choice to settle): spec first, **then**
   the tasks (`references/planning.md`) — the hard gate from §1 of that reference.

### The work cycle: `take → work → done`

1. **Take** — `take [--type <t>]`: `next` + `start` + `brief`, **in one call**. It
   picks the highest-temperature available task (or the id the user asked for, via
   `start <id>` directly if already chosen), starts it, and prints the full execution
   brief — deps/links titled, refs, the exact `done` line to use at the end. No
   separate `show` needed to get moving. If the task is locked, do its prerequisites
   first; never route around a dependency.
2. **Work** — follow `detail` and the documents in `refs`; read the referenced spec
   *before* coding.
3. **Verify the real artifact** — the file produced, the pixel rendered, the command
   run. Not just a typecheck.
4. **Record** — `done <id> --commit <sha> --outcome "…" --verification "…"`.
   `--verification` is encouraged but never blocking, on every task. The outcome says
   what shipped in one user-facing sentence; the verification says what was
   *observed*, never "it works". The task stays `done` in its type — the done
   backlog is the changelog.

For anything beyond a single task — decomposing a spec into a task graph, sizing,
sequencing with `dependsOn` — `references/planning.md` is the operating manual (①
Idea → Spec hard gate, ② Spec → Tasks). Delegating solo work to fresh subagents lives
in `references/delegation.md` (③), which hands out `brief <id>` instead of `show
--json` as the subagent's context. Transverse guardrails (TDD, root cause before fix,
proof before claiming success) are in the core's prohibitions below.

### Key prohibitions

- Do **not** hand-edit a task YAML when the CLI covers the operation.
- Do **not** start a locked task, or delete a dependency to unblock yourself, without
  the user's agreement.
- Do **not** touch `_meta.yaml` or reuse an id.
- Do **not** write a status outside `todo|in_progress|done`, or a size outside
  `S|M|L`.
- Do **not** `done` without an honest `--outcome`, nor claim a `--verification` you
  did not actually run — never "it should work" (verification is encouraged on every
  task but never blocking).
- Do **not** create markdown checklist plans or a parallel progress ledger — plans
  are `dependsOn` tasks, tracking is their status.
- Do **not** code non-trivial work (ladder rung 4) before the spec is approved, fix a
  bug without understanding the root cause, or stack a fourth patch on an approach
  that failed three times.
- Do **not** create a 10th type, rename a type, write a `team` field (removed), or a
  `kind` outside `task | milestone`.
- Do **not** reorder `_epics.yaml` expecting it to change priority — it doesn't;
  use `--heat` or a dependency.

Manual editing is allowed **only** for what the CLI does not cover — creating a
sub-task twin folder — and is **always** followed by `validate`. There is no "create
a type" edit to make: the 9 types are fixed and created once at setup.

---

## 7. FAQ

**Do ids ever get reused?**
No. `nextId` in `_meta.yaml` is monotonic. Deleting a task never frees its number.
This keeps `dependsOn` and `links` referentially stable forever. Never edit `nextId`
by hand.

**What happens if a write would be invalid?**
Every CLI and dashboard write re-validates the *entire* `docs/tasks/` tree after
writing and **rolls back** on any error — schema violation, duplicate id, dependency
cycle, out-of-bounds `heat`. You cannot end up in a half-written state.

**Can I edit the files by hand?**
Yes, for what the CLI does not do (creating a sub-task twin folder) — and then run
`npx roadmapped validate`. There is no hand-edit for types: the 9 are created
once at setup and are immutable. For everything the CLI covers (add, status changes,
field edits), use the CLI: it allocates ids correctly and validates for you. If you
do hand-edit a task, keep the field order canonical and run `validate` immediately.

**Where is the roadmap?**
The everyday roadmap is the **dashboard's Roadmap view**, built from the 9 fixed
types (one column per type, dependency state computed). The `roadmap` *command*
reports progress plus a per-epic rollup (epics auto-discovered from the `epic`
field) — groups are printed in encounter order, which is cosmetic; there's no
column or epic "priority" to build, only classification (type) and, if you want a
task to run sooner, a `--heat` or a `dependsOn`.

**How do I clear a field with `update`?**
Pass the literal `null` for scalars, `--depends-on`/`--epic`, and lists (`tags`,
`refs`, `links` — e.g. `--tags null` writes `tags: []`). For `heat`, use `--heat 0`
or `--no-heat` — both clear it back to absent (cold).

**Does `done` create a delivery document?**
No. The delivery record *is* the `outcome`, `verification`, `commit` and `release`
fields written onto the task's own YAML. Those fields, on the done tasks, are your
changelog.

**What stops me starting a locked task?**
Nothing technical — `start` and `done` accept a locked task without error. Respecting
locks is the agent's discipline; the dashboard and `next` simply never *offer* locked
work.

**`quick` or `add`? Which one do I use?**
Purely an ergonomic choice — both create an ordinary `task`, so this is a fast-path
question, not a ceremony or kind difference. `quick` is the title-only route: an
isolated fix with nothing to fill in beyond a title. Reach for `add` the moment you
want to set `detail`, `refs`, `dependsOn`, a `size`, or any other field up front —
nothing stops using `add` for a one-liner, it is just more to type than the work needs.

**How do I make a task more urgent?**
Set `--heat` on it (`add --heat`/`update --heat`, 0–100), or make another task
`dependsOn` it — declaring the dependency heats the blocker up. There's no third
way: reordering `_epics.yaml`, or moving a task to a "more urgent" type, changes
nothing about `next`'s order. A naturally hot task (old, blocking a lot, a
high-`baseHeat` type like `bug`) can still outrank a maxed `--heat` — that's by
design, not a bug: the seed weighs in, it doesn't command.

**Why does `list --json` look light?**
`--json` is the *light* shape (`id, title, status, type, size, kind, heat`) — it's
what scripts/UI actually consume. If you need the complete tree (every field, every
task) in one call, ask for `--json-full` instead.
