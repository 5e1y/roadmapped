---
name: roadmapped
description: Roadmapped project management — use BEFORE modifying any file in this repo, whatever the framing — feature, feedback, rework, post-done fix, "ASAP" included — and whenever work must be created, planned, executed, or logged (tasks, specs, roadmaps, documentation), when the user says "let's work through the roadmap", "create the tasks", "fix this", or on the FIRST use in a repo (mandatory setup phase).
---

# Roadmapped — the file-driven project

## Compass

Flat YAML/markdown files under `docs/tasks/` are the ONLY source of truth (no parallel plan). 9 fixed, immutable TYPES (`01-bug` → `09-business` = the NATURE of the work, one dashboard column each — never a "when", never a team). Priority is a computed TEMPERATURE, not a stage rank and not an epic order (epics are unordered groupings). The `npx roadmapped <command>` CLI — installable via npm, GitHub (`github:5e1y/roadmapped`), or the Claude Code plugin — or the roadmapped MCP tools if loaded (same core, same guarantees) — is your ONLY write interface — never hand-edit a YAML the CLI covers. (In the Roadmapped repo itself, `node scripts/task.mjs <command>` remains equivalent.)

## Decision ladder — stop at the first matching row

**Every repo change = one roadmapped unit, no exceptions.** `done` is a boundary, not a lid (a rework/review-fix gets its own unit); "ASAP" is never a reason to skip it — logging IS the fast path (~2 commands). Only artefact-free exchange (question, explanation, status) stays conversational. **Before creating anything, check it isn't already tracked**: one `list --type <t> --status todo` (or `next --type <t>`) — a self-contained call (allowed below), NOT a priority recompute (forbidden); don't conflate the two uses of "reading the backlog".

| The work is… | do this — do NOT default to a fresh isolated ticket |
|---|---|
| doesn't deserve to exist | nothing |
| a note/change on an **existing** ticket | **open** → `feedback <id> "…"` · **done + same scope** → reopen (`start <id>`) + re-`done` · **done + new scope** → a `quick` |
| a **slice** of a ticket, meaningless on its own | a **subtask** of it (`references/formats.md`) |
| part of a **named effort**, or you're filing **3+ related** tickets | give each its own type + the **same `--epic <slug>`** (grouping — does NOT prioritise) |
| an **isolated** size-S fix, nothing to decide | `quick "<title>" --type <t>` |
| a standalone unit with real context | `add --type <t> …`, normal cycle |
| multi-task, architecture calls to make | spec first (`references/planning.md`), THEN the tasks |

`feedback` (#149) captures a remark WITHOUT a ticket; git keeps every commit, the task carries the journal — prefer it to a twin ticket. `sitrep` flags done tasks with open feedback.

## Which type? — first match wins (the deliverable's NATURE, never its purpose or who does it)

One axis, 9 fixed folders: `01-bug · 02-feature · 03-chore · 04-brainstorm · 05-design · 06-marketing · 07-communication · 08-legal · 09-business`. Classify by what the deliverable **is**, not what it serves: a logo serves marketing, but it's a visual artefact → `design`. Tree, first match wins:

1. Something is broken (regression, doesn't behave as promised) — any surface, product/site/CLI/docs → **bug**.
2. The deliverable is a reflection/decision document (spec, brainstorm, research, benchmark, plan) → **brainstorm**.
3. The deliverable is a visual/UX artefact (logo, mockup, design system, illustration) → **design**.
4. The deliverable is legal (ToS, privacy, licence, contract, trademark filing, company structure) → **legal**.
5. The deliverable touches money or a direct client relationship (pricing, billing, accounting, prospecting, deals, partnerships) → **business**.
6. The deliverable is outward-facing content: durable acquisition (site page, copy, SEO, campaign) → **marketing**; informs or animates (post, announcement, newsletter, changelog, community, support reply) → **communication**.
7. Otherwise it's code/product: adds a user-visible capability (embedded product docs count) → **feature**; doesn't (refactor, debt, deps, CI, tooling, migration, monitoring) → **chore**.

A `kind: milestone` (a target other tasks lock onto via `dependsOn`) still gets a type — the type of its own final gesture, not of what it aggregates.

## Priority — temperature, never a stage or epic order

There's no "do this column first" and no "epics in priority order" (an epic is an unordered grouping, always). `next` serves tasks by a computed **temperature** (downstream blockers + age + the type's base heat + an optional manual seed). **To prioritize a task: give it `--heat` (0–100, `add`/`update`) OR make something depend on it** (a dependency heats its blocker). A naturally hot ticket can outrank a manually maxed `--heat`. Full formula: `references/formats.md`.

## The cycle

`sitrep` (the state of the world in 1 call — THE 1st move of a session) → `take [--type t]` (claims + starts + briefs in 1 call) → work (`detail` + `refs`) → verify the REAL artefact (not just the typecheck) → `done <id> --outcome "…" --verification "…"` (`--commit` auto-fills to HEAD; `--verification` is encouraged but non-blocking on every task — `--outcome` alone still closes a trivial one).

Two guard mechanics to internalise: (1) a unit must be `in_progress` BEFORE you commit its work — `take`/`start`/`quick --start` first, or the commit is refused. (2) `done` mutates the task YAML, so that YAML is left uncommitted — commit it as a task-log-only follow-up (`chore: consigne — done #<id>`); the guard exempts commits that touch ONLY `docs/tasks/`.

## Know what a task touches — before exploring blind

Before working a non-trivial task, read its **KB neighborhood**: the code and docs it touches — derived from its `refs` and the project's knowledge graph (built by **Graphify**, committed at `graphify-out/graph.json`). One call points you at the right files instead of grepping the repo cold. MCP: `kb_neighborhood { id }`, `kb_search { query }`, `kb_node { id }` (+ tickets touching a node). CLI: `roadmapped kb neighborhood <id>` · `kb search "<query>"` · `kb doctor`. No graph yet → the tools say so; generate it with `/graphify .`.

## Accepted debt = a `quick` tagged `debt`

A deliberate shortcut (known ceiling, upgrade path) gets logged as `quick "<the ceiling>" --tags debt` — the queryable equivalent of a `ponytail:` comment. `list --tag debt` prints the ledger; `sitrep` flags open debt.

## Commands (one line each)

- `sitrep` — today's done, in_progress, next 3, validate, alerts in ≤30 lines. Opens the session.
- `take [--type t] [--json]` — next + start + brief, THE command to open work.
- `brief <id>` — dense execution context (titled deps/related, refs + anchor excerpts & staleness flag, `done` reminder).
- `next [--count N] [--type t] [--json]` — the work queue, temperature-sorted — CONSUME as-is.
- `quick "<title>" --type <t> [--tags a,b] [--heat 0-100] [--start] [--json]` — rapid title-first task; `--type` is REQUIRED (categorise even the quick ones — no silent default).
- `add --type <type> --title <t> [--detail d] [--tags a,b] [--heat 0-100] [--refs a,b] [--depends-on 1,2] [--epic slug] [--kind task|milestone] [--blocks 1,2] [--json]` — create a task (`--type` = the exact folder slug, e.g. `02-feature` — REQUIRED; `--epic` = cross-type grouping, unordered; `--kind milestone` + `--blocks` = a milestone that locks the cited tasks via their dependsOn).
- `start <id>` — todo → in_progress.
- `done <id> [--commit sha] [--outcome o] [--verification v] [--release r] [--suggest-refs] [--resolve-feedback all|1,3]` — log completion (commit auto=HEAD; `--suggest-refs` suggests refs from the diff, to confirm; `--resolve-feedback` closes open feedback items).
- `feedback <id> "<text>" [--author name]` — capture a note on a task WITHOUT a ticket (#149). Same scope → reopen (`start <id>`) + re-`done`; new scope → a `quick`.
- `update <id> [--field value ...] [--heat 0-100|--no-heat]` — generic patch (`"null"` to clear a field, `--no-heat` cools it back to absent).
- `list [--type t] [--status s] [--tag t] [--json]` — list.
- `show <id> [--json]` — full detail of a task.
- `validate` — revalidates all of `docs/tasks/` (mandatory after any manual edit).
- `roadmap [--json]` — overall progress + per-epic view, available/locked (`sitrep` also carries the `progress: x/y` line).

Anchoring a ref (opt-in): `file#symbol` (robust, resolved by grep at serve time) or `file:line` (fragile) → `brief` attaches the excerpt. A bare ref stays a line.

## Golden anti-token rule

For `sitrep`/`take`/`brief`/`next`/`quick`/`add`/`start`/`done`: open NO reference — the CLI is self-contained (`--help` and error messages guide you). Consume the queue served by `next`/`take` as-is, never RECOMPUTE priority by re-reading the backlog. (This bans recomputing PRIORITY by hand — it does NOT ban the dedup check of ladder step 1: a `list`/`next` to confirm no existing ticket covers a scope is required, not forbidden.)

## Forbidden

- ❌ Committing without a roadmapped unit — the `guard` hook refuses; `--no-verify` = a conscious drift, to be disclosed to the user.
- ❌ Hand-editing a YAML when the CLI covers the operation, or touching `_meta.yaml`/reusing an id.
- ❌ Starting a locked task or bypassing a dependency without explicit agreement.
- ❌ `done` without an honest `--outcome` (and `--verification` actually run for a `task`) — never "should work".
- ❌ Creating a 10th type, renaming a type, writing a `team`/`stage` field (removed from the schema), or a status/size outside the enum.
- ❌ Reordering `_epics.yaml` to "prioritize" — epics don't order anything; use `--heat` or a dependency instead.
- ❌ Coding anything non-trivial (rung 4) without an approved spec first.
- ❌ Creating a parallel markdown plan file — a plan IS tasks chained by `dependsOn`.

## Router — open a reference ONLY on this exact trigger

Breaking down a spec / planning → `references/planning.md` · first setup of a repo (`docs/tasks/_meta.yaml` missing) → `references/setup.md` · **creating a subtask, or hand-editing a YAML** (uncovered cases, formats) → `references/formats.md` · delegating to subagents → `references/delegation.md`.
