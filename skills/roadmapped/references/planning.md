# Roadmapped — from idea to execution-ready tasks

The lifecycle of a feature, before execution: **Idea → Spec → Tasks**. Each step has its gate. The dashboard makes everything visible (backlog, roadmap, docs) — there is NO other tracking file to maintain.

## 1. Idea → Spec (brainstorming)

**HARD GATE: zero lines of code, zero tasks created, before a spec approved by the user.** Even for a "simple" project — this is where unexamined assumptions cost the most.

1. Explore the real context first (code, docs, existing tasks via `list`).
2. Questions **one at a time** (multiple choice preferred): goal, constraints, done criteria. Never a wall of questions.
3. Propose **2-3 approaches** with trade-offs and your recommendation upfront.
4. Present the design **section by section**, with validation at each section.
5. Write the spec (`docs/specs/YYYY-MM-DD-<subject>.md`): context, decisions AND discarded alternatives, explicit scope / out-of-scope, done criteria.
6. **Self-review the spec** before showing it: placeholders ("TBD", empty section)? internal contradictions? ambiguity (two possible readings → decide and make explicit)? scope (a single effort, otherwise split)?
7. The user reviews and approves THE SPEC (not your summary). Only then: the tasks.

## 2. Spec → Tasks (formerly writing-plans)

A Roadmapped "plan" = chained tasks. Granularity: **one task = one independently testable deliverable**, one a context-free executor can pick up via `brief <id>` + the spec in `refs`.

**Every task picks ONE type — the nature of its deliverable, not its purpose or who does it.** The type (`--type`, one of the 9 fixed folders, e.g. `02-feature`) is REQUIRED at creation (`add`); classify with the tree in `references/formats.md` (first match wins: broken → bug, decision doc → brainstorm, visual/UX → design, legal → legal, money/clients → business, outward content → marketing/communication, otherwise code → feature/chore). There's no second axis to fill in — the old stage (WHEN) and team (WHO) are gone, fused into this single nature axis.

**Priority is not a placement decision.** Putting a task in `01-bug` doesn't make it urgent by itself — its `next` order comes from a computed temperature (age + downstream blockers + the type's base heat + an optional `--heat` seed). While planning, the only priority levers worth using are `--depends-on` (real order) and, rarely, `--heat` on something that must visibly jump the queue.

**The `detail` field carries what a plan used to carry.** For each task:
- WHAT and WHY, the exact files to create/modify, the chosen approach.
- The interfaces neighboring tasks expect (signatures, names — the executor sees only THEIR task).
- The definition of done: which command, which artefact observed.
- **Absolute bans**: "TBD", "to be completed", "handle errors properly", "like task N" without the content. If you can't write it precisely, the spec isn't finished — escalate.

**Order and parallelism**: `--depends-on` encodes the REAL order (A must exist for B — and it's also a priority signal: B being blocked heats A up). What can be done in parallel has NO dependency between the two — that's what the Graph view shows (columns = types, available cards = the work front). Don't chain artificially.

**Final check**: `roadmap` must show a sensible starting front (the first available tasks) and a clear end. Otherwise the breakdown is wrong.
