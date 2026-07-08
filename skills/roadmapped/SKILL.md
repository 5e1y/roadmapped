---
name: roadmapped
description: Roadmapped project management — use BEFORE modifying any file in this repo, whatever the framing — feature, feedback, rework, post-done fix, "ASAP" included — and whenever work must be created, planned, executed, or logged (tasks, specs, roadmaps, documentation), when the user says "let's work through the roadmap", "create the tasks", "fix this", or on the FIRST use in a repo (mandatory setup phase).
---

# Roadmapped — the file-driven project

## Compass

Flat YAML/markdown files under `docs/tasks/` are the ONLY source of truth (no parallel plan). 8 fixed, immutable stages (`01-idea` → `08-mature` = the milestones, one dashboard column each). Every active task carries a mandatory `team` (fixed enum). The `npx roadmapped <command>` CLI — or the roadmapped MCP tools if loaded (same core, same guarantees) — is your ONLY write interface — never hand-edit a YAML the CLI covers. (In the Roadmapped repo itself, `node scripts/task.mjs <command>` remains equivalent.)

## Decision ladder — stop at the first rung that holds

**Every repo change = one roadmapped unit, no exceptions.** `done` is a boundary, not a lid: feedback, a rework, a review fix → each gets its own `quick`. "ASAP" is never a reason to skip the `quick` — the `quick` IS the fast path (~2 commands). Only artefact-free exchange (question, explanation, status) stays conversational.

**Feedback vs quick (#149) — the same-scope exception.** A note on a task that isn't a change yet → `feedback <id> "…"` (captured, no ticket). When you ACT on it: SAME scope (finishing the same thing) → **reopen** the task (`start <id>`) and re-`done` with a new commit — git keeps every commit, the task carries the journal, no twin ticket. NEW scope (a different concern) → a `quick`, as always. `sitrep` flags done tasks with open feedback.

1. Does this change even deserve to exist? If not, create nothing.
2. Does a `quick` suffice (isolated fix, size S, no decisions to make)? → `quick`, done with `--outcome` alone.
3. Otherwise, does a single task suffice? → `add`, normal cycle.
4. Otherwise (multi-task, architecture calls to make): spec first, THEN the tasks (`references/planning.md`).

## The cycle

`sitrep` (the state of the world in 1 call — THE 1st move of a session) → `take [--team t]` (claims + starts + briefs in 1 call) → work (`detail` + `refs`) → verify the REAL artefact (not just the typecheck) → `done <id> --outcome "…" --verification "…"` (`--commit` auto-fills to HEAD; for a `quick`: `--outcome` alone suffices).

Two guard mechanics to internalise: (1) a unit must be `in_progress` BEFORE you commit its work — `take`/`start`/`quick --start` first, or the commit is refused. (2) `done` mutates the task YAML, so that YAML is left uncommitted — commit it as a task-log-only follow-up (`chore: consigne — done #<id>`); the guard exempts commits that touch ONLY `docs/tasks/`.

## Accepted debt = a `quick` tagged `debt`

A deliberate shortcut (known ceiling, upgrade path) gets logged as `quick "<the ceiling>" --team <t> --tags debt` — the queryable equivalent of a `ponytail:` comment. `list --tag debt` prints the ledger; `sitrep` flags open debt.

## Commands (one line each)

- `sitrep` — today's done, in_progress, next 3, validate, alerts in ≤30 lines. Opens the session.
- `take [--team t] [--json]` — next + start + brief, THE command to open work.
- `brief <id>` — dense execution context (titled deps/related, refs + anchor excerpts & staleness flag, `done` reminder).
- `next [--count N] [--team t] [--json]` — the work queue to CONSUME as-is.
- `quick "<title>" --team <t> [--stage s] [--tags a,b] [--start] [--json]` — mini-ticket, minimal ceremony.
- `add --section <stage> --title <t> --team <t> [--detail d] [--refs a,b] [--depends-on 1,2] [--epic slug] [--kind task|quick|milestone] [--blocks 1,2] [--json]` — create a task (`--epic` = cross-stage grouping; `--kind milestone` + `--blocks` = a milestone that locks the cited tasks via their dependsOn).
- `start <id>` — todo → in_progress.
- `done <id> [--commit sha] [--outcome o] [--verification v] [--release r] [--suggest-refs] [--resolve-feedback all|1,3]` — log completion (commit auto=HEAD; `--suggest-refs` suggests refs from the diff, to confirm; `--resolve-feedback` closes open feedback items).
- `feedback <id> "<text>" [--author name]` — capture a note on a task WITHOUT a ticket (#149). Same scope → reopen (`start <id>`) + re-`done`; new scope → a `quick`.
- `update <id> [--field value ...]` — generic patch (`"null"` to clear a field).
- `list [--section s] [--status s] [--team t] [--tag t] [--json]` — list.
- `show <id> [--json]` — full detail of a task.
- `validate` — revalidates all of `docs/tasks/` (mandatory after any manual edit).
- `roadmap [--json]` — overall progress + per-epic view, available/locked (`sitrep` also carries the `progress: x/y` line).

Anchoring a ref (opt-in): `file#symbol` (robust, resolved by grep at serve time) or `file:line` (fragile) → `brief` attaches the excerpt. A bare ref stays a line.

## Golden anti-token rule

For `sitrep`/`take`/`brief`/`next`/`quick`/`add`/`start`/`done`: open NO reference — the CLI is self-contained (`--help` and error messages guide you). Consume the queue served by `next`/`take` as-is, never RECOMPUTE priority by re-reading the backlog.

## Forbidden

- ❌ Committing without a roadmapped unit — the `guard` hook refuses; `--no-verify` = a conscious drift, to be disclosed to the user.
- ❌ Hand-editing a YAML when the CLI covers the operation, or touching `_meta.yaml`/reusing an id.
- ❌ Starting a locked task or bypassing a dependency without explicit agreement.
- ❌ `done` without an honest `--outcome` (and `--verification` actually run for a `task`) — never "should work".
- ❌ Creating a 9th stage, renaming a stage, or writing a status/size outside the enum.
- ❌ Coding anything non-trivial (rung 4) without an approved spec first.
- ❌ Creating a parallel markdown plan file — a plan IS tasks chained by `dependsOn`.

## Router — open a reference ONLY on this exact trigger

Breaking down a spec / planning → `references/planning.md` · first setup of a repo (`docs/tasks/_meta.yaml` missing) → `references/setup.md` · hand-editing a YAML (subtasks, uncovered cases) → `references/formats.md` · delegating to subagents → `references/delegation.md`.
