# Roadmapped — setup phase (first use in a repo)

Goal: when Roadmapped has just been installed, the agent takes charge of the project — it **recovers everything that exists** (docs, plans, prose roadmaps, TODOs, specs) and **converts it to Roadmapped format**, with the user's agreement on the mapping. In the end, `docs/tasks/` is the sole source of truth for the work to do.

## 0. Detection and paths

Requirements: Node ≥ 22.18 and a `package.json` in the host repo (Roadmapped installs itself as a dev dependency; the guard/SessionStart hooks and MCP entry resolve through `node_modules/roadmapped/`). Non-Node repo (Python/Go/Rust)? Add a minimal `package.json` (`npm init -y`) or track from a sibling Node repo — first-class non-Node support is roadmap, not v1.

The host root = the current repo: the CLI walks up from cwd to the first folder holding `roadmapped.config.json` (or `.git`), and resolves `tasksDir`/`docsDir` there (defaults `docs/tasks`, `docs`, relative to that root). Verify the config points to the right place BEFORE any command, or the CLI will work in the wrong place.

Setup is required if `docs/tasks/_meta.yaml` doesn't exist. If it exists, the repo is already initialized — NEVER redo the setup (you'd overwrite real state).

## 1. Inventory (read-only, BEFORE any write)

Scan and list what exists:
- **Prose vision/backlog**: `README*`, `ROADMAP*`, `TODO*`, `BACKLOG*`, `NOTES*`, exported issues.
- **Plans**: any checklist markdown (`- [ ]`), `plans/`, `docs/plans/` folders.
- **Specs/designs**: `docs/specs/`, `specs/`, RFC, ADR.
- **Documentation**: any `docs/**/*.md` (and embedded wiki) — it will NOT be converted, it will be **referenced**.
- **The code itself**: gives clues to infer the natural `type` for each item — is the deliverable broken (bug), a new capability (feature), infra/debt (chore), a visual asset (design), outward content (marketing/communication), legal paperwork (legal), money/clients (business), or a decision to make first (brainstorm)? See the classification tree in `references/formats.md`.

## 2. Mapping proposal (user validation MANDATORY)

Present in compact prose, and wait for agreement before writing:
- **Types**: nothing to propose — the 9 canonical types (`01-bug` → `09-business`, see `references/formats.md`) are fixed and created as-is. The work is to **classify** each existing item by the nature of its deliverable, using the classification tree (first match wins): something broken → bug; a decision/spec → brainstorm; a visual/UX artefact → design; legal paperwork → legal; money/direct clients → business; outward content → marketing or communication; otherwise code/product → feature or chore. There is no "when" to encode — old phase/version language ("v1", "beta", "phase 2") tells you NOTHING about type; classify by nature, not by the phase it was written under.
- **Tasks**: every open item (unchecked box, TODO bullet, "we should" sentence) → one task, dropped into its classified type. CHECKED/finished items are NOT imported (the history stays in the old files) — except a couple of tasks that may be born `done` if they tell the project's true origin story (e.g. "initial idea", "repo created").
- **Dependencies**: ordered steps of the same plan → a `dependsOn` chain; whatever is independent stays without a dependency (parallelizable). Ask, for each task, whether it blocks or waits on another existing one — declaring a dependency is also how a task gets naturally hotter for `next` (see § Priority in `references/formats.md`), so it's worth asking even when not strictly load-bearing.
- **Priority**: nothing to seed by default — a fresh task starts cold (`heat` absent) and its temperature is `base(type) + age` until it earns blockers or a deliberate `--heat`. Only set `--heat` for something the user explicitly flags as more urgent than its type/age would suggest.
- **Roadmap**: the 9 types render as columns; nothing to create or order there. Cross-project groupings ("launch the app", "graph revamp") become **epics** (`--epic <slug>`) — a simple shared tag, unordered, auto-discovered; `_epics.yaml` is optional and only gives them a readable title.
- **Docs**: for each task, the relevant existing doc to put in `refs`. Flag important efforts WITHOUT a doc — the doc to write becomes a task (type `feature` if embedded in the product, `brainstorm` if it's a spec) or part of the `detail`.
- **Fate of old files**: propose (user's choice) leaving them intact with a header note "⚠️ Replaced by docs/tasks/ (Roadmapped)", or moving them to `docs/_imported/`. NEVER delete without explicit agreement.

## 3. Initialization (writing, in this order)

1. `npx roadmapped init` — lays down ALL the plumbing in one move, idempotent: `roadmapped.config.json`, the `docs/tasks/` skeleton (`_meta.yaml` nextId: 1 + the 9 canonical types with their `_section.yaml`, `baseHeat` seeded from the code defaults), the skill in `.claude/skills/roadmapped/`, the MCP entry in `.mcp.json`, a `SessionStart` hook in `.claude/settings.json` (runs `sitrep` when each session opens — the state of the world is injected upfront, #122), and the git guard hook (chained onto an existing pre-commit, never overwritten). It NEVER touches an already-populated `docs/tasks/` or an existing config.
2. The 9 types are laid down by `init`, immutable, always the same, in the same order — this is NOT a proposal to the user (their canonical titles/notes: table in `references/formats.md`).
3. `npx roadmapped validate` → must pass BEFORE adding a single task (the 9 present, empty types already validate).
4. Create tasks **via the CLI only** (`add --type <type> ...`, `--type` is the exact folder slug, e.g. `02-feature`), in dependency order (a `--depends-on` can only cite an already-created id). Set `--refs`, `--tags`, `--size`, `--depends-on`, and `--heat` (only when a deliberate priority signal is warranted) right at creation. `--source user` for what comes from the user's own writing, `ai` for what you infer.
5. Apply the agreed fate for the old files.
6. Final `validate` + `npx roadmapped roadmap` and `list` to show the result to the user.

## 4. End-of-setup verification

- `validate` → OK with no error (9 active types).
- `next` → returns a real, sensible first task (this is the usage test: "where do I start?") — it's the highest-temperature available todo, not "the first stage".
- Dashboard: offer the user `npx roadmapped dashboard` (in the Roadmapped repo itself: `npm run dev`) to see their backlog and roadmap.
- Summarize: N tasks spread across the 9 types, N dependencies, what was imported from where, what was left out and why.
