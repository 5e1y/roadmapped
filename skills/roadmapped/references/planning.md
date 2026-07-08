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

**Every task picks a stage (the WHEN) and a team (the WHO).** The stage (`--section`, one of the 8 fixed idea→mature) places the task in the product launch sequence — the stages ARE the milestones, no need to create a dedicated section or milestone. The team (`--team`, fixed enum) says which business team owns it. Both are required at creation (`add`); no active task is exempt.

**The `detail` field carries what a plan used to carry.** For each task:
- WHAT and WHY, the exact files to create/modify, the chosen approach.
- The interfaces neighboring tasks expect (signatures, names — the executor sees only THEIR task).
- The definition of done: which command, which artefact observed.
- **Absolute bans**: "TBD", "to be completed", "handle errors properly", "like task N" without the content. If you can't write it precisely, the spec isn't finished — escalate.

**Order and parallelism**: `--depends-on` encodes the REAL order (A must exist for B). What can be done in parallel has NO dependency between the two — that's what the Graph view shows (columns = stages, available cards = the work front). Don't chain artificially.

**Final check**: `roadmap` must show a sensible starting front (the first available tasks) and a clear end. Otherwise the breakdown is wrong.
