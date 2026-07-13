# Roadmapped

<img src="./docs/assets/bird-peck.gif" alt="La mascotte Roadmapped picore" align="right" width="84" />

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
![Node](https://img.shields.io/badge/node-%E2%89%A522.18-blue.svg)

**Your repo is already your project management tool. We just added the interface.**

Backlog, roadmap and docs live as plain YAML and markdown inside your repository — the only
source of truth. No database, no SaaS, no account. Your AI agent reads and writes it in the
right format through a CLI and a Claude skill; you review the diff.

![Roadmapped dashboard — Backlog view](./docs/assets/dashboard.png)

## Install it by pointing your AI agent at this repo

Give your AI coding agent (Claude Code and friends) this repo and one instruction:

> **Install Roadmapped in my repo:** https://github.com/5e1y/roadmapped

Three ways in. All three converge on the same wired state, and every install keeps itself
current from GitHub HEAD in the background — no reinstalling.

**Claude Code plugin** — the easiest inside Claude Code:

```
/plugin marketplace add 5e1y/roadmapped
/plugin install roadmapped@roadmapped
```

**npm** — from your repo's root:

```bash
npx roadmapped init   # scaffold + skill + .mcp.json + git guard + SessionStart hooks + devDependency
npm install           # materialize node_modules/roadmapped → activates the hooks + MCP
```

**Straight from GitHub** — same thing, no npm registry involved:

```bash
npx --yes github:5e1y/roadmapped init
npm install
```

GitHub stays the single source of truth; npm mirrors it automatically.

`init` is idempotent. It lays down the `docs/tasks/` skeleton, the Claude skill in
`.claude/skills/`, a git pre-commit guard, an `.mcp.json` entry, a `CLAUDE.md` block, and
adds `roadmapped` as a devDependency.

Then:

1. **Restart your Claude Code session** so it picks up the freshly installed skill *and* the
   MCP server.
2. Tell the agent **"let's set up Roadmapped"**. The skill is now active — its setup phase
   reads your existing plans, roadmaps, TODOs and specs and converts them into the backlog,
   with your sign-off on the mapping. From there, `npx roadmapped <cmd>` drives everything.

> **Requirements:** Node ≥ 22.18 in the host repo. Roadmapped installs itself as a dev
> dependency, so the repo needs a `package.json` (the guard hook, `SessionStart` hook and
> MCP entry all resolve through `node_modules/roadmapped/`).
>
> **Non-Node repo (Python, Go, Rust…)?** Add a minimal `package.json` at the root
> (`npm init -y` is enough — Roadmapped only uses it to install itself), or track the project
> from a sibling Node repo. First-class non-Node support (an npx fallback or a standalone
> launcher) is on the roadmap, not in v1.

## Why

- **It's just files.** Task YAML you can diff, review, and blame — because it *is* one. No
  hidden state, no second copy to drift out of sync.
- **Agent-first.** A CLI (`npx roadmapped`) and a Claude skill so your agent creates specs,
  tasks and dependencies in the correct schema — and records what it ships.
- **Local and yours.** Your data stays on your machine, in your repo. Not out of principle —
  we simply don't have a server to send it to. Deleting your account is `rm -rf`.
- **Light.** The dashboard ships pre-built, so installing Roadmapped pulls ~30 MB into your
  repo — not a full front-end build toolchain. Node ≥ 22.18 and a `package.json`; that's it.
- **Free, and actually free.** MIT licensed. No pricing page, no seats, no "contact sales."

> Yes, it's a folder of YAML files. No, it's not a database. That's kind of the point.

## Quickstart

In any repo you want to manage:

```bash
npx roadmapped init       # scaffold docs/tasks/, the skill, the git guard
npx roadmapped dashboard  # open the dashboard in your browser
npx roadmapped --help     # the CLI your agent (or you) drives
```

`init` also drops a Claude skill into `.claude/` and an `.mcp.json` entry, so your AI
agent can create and record tasks in the right schema from the first prompt.

> **Working on Roadmapped itself?** Clone the repo, then `npm install` and `npm run dev`
> for the dashboard; the CLI is `node scripts/task.mjs`. Everything below the hood is the
> same code the published package runs.

## What's in the folder

| Area | What it does |
|---|---|
| **Backlog** | Sections and tasks under `docs/tasks/`, full CRUD from the dashboard or the CLI. |
| **Roadmap** | Your sections as columns plus a dependency graph, with `done` / `available` / `locked` states **computed from the graph, never stored**. |
| **Docs** | Your `docs/` folder rendered as markdown. |
| **Knowledge base** | A live graph of your repo (code + docs) with the tickets wired in via their `refs` — nothing to fill in. Rendered in the Docs tab, queried by your agent. Installed by default at `init` (`--no-kb` to opt out) — see [Knowledge base, powered by Graphify](#knowledge-base-powered-by-graphify). |
| **Agent CLI + Claude skill** | `scripts/task.mjs` and `skills/roadmapped/` so an agent creates and records work in the correct schema. |
| **Validation + rollback** | Every write — dashboard or CLI — goes through the same validator; on error the change rolls back. Ids are never reused. |

## Knowledge base, powered by Graphify

Your repo gets a knowledge graph: code and docs indexed as nodes and relations, tickets
wired in through their `refs`, committed at `graphify-out/graph.json` — a file, like
everything else here. It's built by [Graphify](https://graphify.com/), a separate
open-source project (full credit below, in the License section).

The pretty graph in the Docs tab is not the point. The point is that your agent navigates
the repo through it instead of grepping cold: task briefs embed the neighborhood of the
files they touch, and the MCP tools (`kb_neighborhood`, `kb_search`, `kb_node`) plus
`npx roadmapped kb` answer "where does X live, what touches it" in a few hundred tokens
instead of a read-everything expedition. Up to ~70% fewer **exploration** tokens —
exploration, not the whole session; the agent still reads what it edits. No miracle
claimed beyond that.

Installed by default at `init` (opt out with `--no-kb`) — a one-time ~30 MB on your
machine, up to ~85 MB if it has neither Python nor uv; the npm package stays Node-only.
The graph itself is generated by your agent — one `/graphify .`, the only step that costs
tokens, and it asks first. Refreshes (`/graphify . --update`) are code-only and free.

## How it works

Everything is flat, hand-editable files. The dashboard and the CLI read and write the same
data through the same validator — never a second, parallel schema hiding somewhere. Roadmap
states are derived from the dependency graph on every read; your git history is the audit log.

Roadmapped's own backlog is managed by Roadmapped, mostly by a Claude agent that records every
task it ships. The done tasks are the changelog. If you want to know whether the workflow
holds up, read the backlog.

> **Naming** — the brand is **Roadmapped** (two p's, renamed 2026-07). The GitHub repository
> and the npm package are `roadmapped` (lowercase). Host repos still using the legacy
> `roadmaped.config.json` (one p) keep working — the old filename is read as a fallback.

## Documentation

- [User guide](./docs/guide.md) — installation, dashboard tour, full CLI reference, YAML formats, agent workflow.
- [Claude skill](./skills/roadmapped/) — the skill an agent loads to drive Roadmapped in your repo.

## License

[MIT](./LICENSE) © Rémi Courtillon

The knowledge base graph is generated by [Graphify](https://graphify.com/) — a separate
open-source project (MIT, [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify)),
not ours. Roadmapped reads `graphify-out/graph.json` and renders it; they do the clever part.
