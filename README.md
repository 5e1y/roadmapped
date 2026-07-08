# Roadmapped

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Your repo is already your project management tool. We just added the interface.**

Backlog, roadmap and docs live as plain YAML and markdown inside your repository — the only
source of truth. No database, no SaaS, no account. Your AI agent reads and writes it in the
right format through a CLI and a Claude skill; you review the diff.

![Roadmapped dashboard — Backlog view](./docs/assets/dashboard.png)

## Why

- **It's just files.** Task YAML you can diff, review, and blame — because it *is* one. No
  hidden state, no second copy to drift out of sync.
- **Agent-first.** A CLI (`scripts/task.mjs`) and a Claude skill so your agent creates specs,
  tasks and dependencies in the correct schema — and records what it ships.
- **Local and yours.** Your data stays on your machine, in your repo. Not out of principle —
  we simply don't have a server to send it to. Deleting your account is `rm -rf`.
- **Free, and actually free.** MIT licensed. No pricing page, no seats, no "contact sales."

> Yes, it's a folder of YAML files. No, it's not a database. That's kind of the point.

## Quickstart

In any repo you want to manage:

```bash
npx roadmapped init       # scaffold docs/tasks/, the Claude skill, and the git guard
npx roadmapped dashboard  # open the dashboard in your browser
npx roadmapped --help     # the CLI your agent (or you) drives over docs/tasks/
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
| **Agent CLI + Claude skill** | `scripts/task.mjs` and `skills/roadmapped/` so an agent creates and records work in the correct schema. |
| **Validation + rollback** | Every write — dashboard or CLI — goes through the same validator; on error the change rolls back. Ids are never reused. |

## How it works

Everything is flat, hand-editable files. The dashboard and the CLI read and write the same
data through the same validator — never a second, parallel schema hiding somewhere. Roadmap
states are derived from the dependency graph on every read; your git history is the audit log.

Roadmapped's own backlog is managed by Roadmapped, mostly by a Claude agent that records every
task it ships. The done tasks are the changelog. If you want to know whether the workflow
holds up, read the backlog.

> **Naming** — the brand is **Roadmapped** (two p's, renamed 2026-07). The GitHub repository
> is `Roadmapped`. Host repos still using the legacy `roadmaped.config.json` (one p) keep
> working — the old filename is read as a fallback.

## Documentation

- [User guide](./docs/guide.md) — installation, dashboard tour, full CLI reference, YAML formats, agent workflow.
- [Claude skill](./skills/roadmapped/) — the skill an agent loads to drive Roadmapped in your repo.

## License

[MIT](./LICENSE) © Rémi Courtillon
