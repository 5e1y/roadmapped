# Roadmapped — setup phase (first use in a repo)

Goal: when Roadmapped has just been installed, the agent takes charge of the project — it **recovers everything that exists** (docs, plans, prose roadmaps, TODOs, specs) and **converts it to Roadmapped format**, with the user's agreement on the mapping. In the end, `docs/tasks/` is the sole source of truth for the work to do.

## 0. Detection and paths

The host root = the current repo: the CLI walks up from cwd to the first folder holding `roadmapped.config.json` (or `.git`), and resolves `tasksDir`/`docsDir` there (defaults `docs/tasks`, `docs`, relative to that root). Verify the config points to the right place BEFORE any command, or the CLI will work in the wrong place.

Setup is required if `docs/tasks/_meta.yaml` doesn't exist. If it exists, the repo is already initialized — NEVER redo the setup (you'd overwrite real state).

## 1. Inventory (read-only, BEFORE any write)

Scan and list what exists:
- **Prose vision/backlog**: `README*`, `ROADMAP*`, `TODO*`, `BACKLOG*`, `NOTES*`, exported issues.
- **Plans**: any checklist markdown (`- [ ]`), `plans/`, `docs/plans/` folders.
- **Specs/designs**: `docs/specs/`, `specs/`, RFC, ADR.
- **Documentation**: any `docs/**/*.md` (and embedded wiki) — it will NOT be converted, it will be **referenced**.
- **The code itself** and the team's organization: give clues to infer the natural `team` for each task (who would own it).

## 2. Mapping proposal (user validation MANDATORY)

Present in compact prose, and wait for agreement before writing:
- **Stages**: nothing to propose — the 8 canonical stages (`01-idea` → `08-mature`, see `references/formats.md`) are fixed and created as-is. The work is to **map** the existing content onto them: if the inventory mentions phases/versions ("v1", "beta", "phase 2", ROADMAP.md sections…), match each to the closest product-launch-cycle stage (a build-oriented v1 → `04-build`; a coordinated launch → `06-launch`; etc.), instead of creating a new section.
- **Tasks**: every open item (unchecked box, TODO bullet, "we should" sentence) → one task, dropped into the mapped stage. CHECKED/finished items are NOT imported (the history stays in the old files) — except for `01-idea`/`02-initial`, which may be born `done` with 2-3 retroactive tasks if it tells the project's true story.
- **Team**: every imported task gets a `team` (fixed enum: `marketing | sales | support | operations | finance | legal | engineering | design`), inferred from the content (who would do this work on the team). No active task stays without a team — it's a mandatory field, not an optional guess.
- **Dependencies**: ordered steps of the same plan → a `dependsOn` chain; whatever is independent stays without a dependency (parallelizable).
- **Roadmap**: the 8 stages ARE the milestones (the Roadmap view = one column per stage, in idea→mature order, empty stage dimmed). Nothing to create or order: the mapping above is enough.
- **Docs**: for each task, the relevant existing doc to put in `refs`. Flag important efforts WITHOUT a doc — the doc to write becomes a task or part of the `detail`.
- **Fate of old files**: propose (user's choice) leaving them intact with a header note "⚠️ Replaced by docs/tasks/ (Roadmapped)", or moving them to `docs/_imported/`. NEVER delete without explicit agreement.

## 3. Initialization (writing, in this order)

1. `npx roadmapped init` — lays down ALL the plumbing in one move, idempotent: `roadmapped.config.json`, the `docs/tasks/` skeleton (`_meta.yaml` nextId: 1 + the 8 canonical stages with their `_section.yaml`), the skill in `.claude/skills/roadmapped/`, the MCP entry in `.mcp.json`, a `SessionStart` hook in `.claude/settings.json` (runs `sitrep` when each session opens — the state of the world is injected upfront, #122), and the git guard hook (chained onto an existing pre-commit, never overwritten). It NEVER touches an already-populated `docs/tasks/` or an existing config.
2. The 8 stages are laid down by `init`, immutable, always the same, in the same order — this is NOT a proposal to the user (their canonical titles/notes: table in `references/formats.md`).
3. `npx roadmapped validate` → must pass BEFORE adding a single task (the 8 present, empty stages already validate).
4. Create tasks **via the CLI only** (`add --section <stage> --team <team> ...`), in dependency order (a `--depends-on` can only cite an already-created id). `--team` is required on every `add` — no task without a team. Set `--refs`, `--tags`, `--size`, `--depends-on` right at creation. `--source user` for what comes from the user's own writing, `ai` for what you infer.
5. Apply the agreed fate for the old files.
6. Final `validate` + `npx roadmapped roadmap` and `list` to show the result to the user.

## 4. End-of-setup verification

- `validate` → OK with no error (8 active stages, every active task has a team).
- `next` → returns a real, sensible first task (this is the usage test: "where do I start?").
- Dashboard: offer the user `npx roadmapped dashboard` (in the Roadmapped repo itself: `npm run dev`) to see their backlog and roadmap.
- Summarize: N tasks spread across the 8 stages (= milestones), by team, N dependencies, what was imported from where, what was left out and why.
