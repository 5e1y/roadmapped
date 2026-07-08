# Roadmapped

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

**Your repo is already your project management tool. We just added the interface.**

Backlog, roadmap and docs live as plain YAML and markdown inside your repository — the only
source of truth. No database, no SaaS, no account. Your AI agent reads and writes it in the
right format through a CLI and a Claude skill; you review the diff.

![Roadmapped dashboard — Backlog view](./docs/assets/dashboard.png)

## Install it by pointing your AI agent at this repo

Give your AI coding agent (Claude Code and friends) this repo and one instruction:

> **Install Roadmapped in my repo:** https://github.com/5e1y/roadmapped

The agent should then, from your repo's root:

**1. Install the skill** — so the agent learns Roadmapped's method before touching anything:

```bash
tmp=$(mktemp -d) && git clone --depth 1 https://github.com/5e1y/roadmapped "$tmp" \
  && mkdir -p .claude/skills && cp -r "$tmp/skills/roadmapped" .claude/skills/roadmapped \
  && rm -rf "$tmp"
```

**2. Reload your skills** so the freshly installed skill is picked up — in Claude Code,
restart the session (or run `/doctor` then reopen). The `roadmapped` skill is now active.

**3. Run the guided setup** — now that the skill is loaded, it walks the agent through init:

```bash
npx --yes github:5e1y/roadmapped init
```

`init` is idempotent and scaffolds everything: the `docs/tasks/` skeleton, the Claude
skill in `.claude/skills/`, an `.mcp.json` entry, a git pre-commit guard, and a `CLAUDE.md`
block. From there the skill's setup phase reads your repo and helps you seed the backlog —
just tell the agent "let's set up Roadmapped".

## Why

- **It's just files.** Task YAML you can diff, review, and blame — because it *is* one. No
  hidden state, no second copy to drift out of sync.
- **Agent-first.** A CLI (`npx roadmapped`) and a Claude skill so your agent creates specs,
  tasks and dependencies in the correct schema — and records what it ships.
- **Local and yours.** Your data stays on your machine, in your repo. Not out of principle —
  we simply don't have a server to send it to. Deleting your account is `rm -rf`.
- **Free, and actually free.** MIT licensed. No pricing page, no seats, no "contact sales."

> Yes, it's a folder of YAML files. No, it's not a database. That's kind of the point.

## Quickstart

In any repo you want to manage (until the npm package is published, run it straight from
GitHub with `github:5e1y/roadmapped`):

```bash
npx --yes github:5e1y/roadmapped init       # scaffold docs/tasks/, the skill, the git guard
npx --yes github:5e1y/roadmapped dashboard  # open the dashboard in your browser
npx --yes github:5e1y/roadmapped --help     # the CLI your agent (or you) drives
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
> and the npm package are `roadmapped` (lowercase). Host repos still using the legacy
> `roadmaped.config.json` (one p) keep working — the old filename is read as a fallback.

## Documentation

- [User guide](./docs/guide.md) — installation, dashboard tour, full CLI reference, YAML formats, agent workflow.
- [Claude skill](./skills/roadmapped/) — the skill an agent loads to drive Roadmapped in your repo.

## License

[MIT](./LICENSE) © Rémi Courtillon
