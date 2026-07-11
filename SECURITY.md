# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately in one of two ways:

- **GitHub** — open a [private vulnerability report](https://github.com/5e1y/roadmapped/security/advisories/new)
  (Security → Report a vulnerability). Preferred: it keeps the discussion and any
  fix coordinated in one place.
- **Email** — `contact.remi.courtillon@gmail.com`. Put "security" in the subject.

Include what you'd want if you were on the receiving end: affected version or
commit, a description of the issue, and the smallest steps that reproduce it.

## What to expect

This is a small project, maintained by one person. Realistic promises only:

- An acknowledgement within **7 days**.
- An honest assessment of whether it's a real issue and how it'll be handled.
- Credit in the fix's release notes if you want it — no bug bounty, no money.

## Supported versions

Roadmapped is distributed straight from GitHub (`github:5e1y/roadmapped`) and
versioned by commit. Only the current `main` is supported — fixes land there and
you pull them by updating the dependency. There are no back-ported patch releases.

## Scope — what Roadmapped actually touches

Worth knowing before you go hunting: Roadmapped has **no server, no database, and
no telemetry**. It reads and writes flat YAML/markdown under `docs/tasks/` in your
own repo, on your own machine, plus a local dashboard and an MCP server the agent
talks to. Your data never leaves your machine as part of normal operation.

The interesting surface is therefore local: the CLI and MCP write paths, the git
hooks, and anything the dashboard renders from repo files (e.g. untrusted markdown
in a task). Reports about those are exactly what we want.
