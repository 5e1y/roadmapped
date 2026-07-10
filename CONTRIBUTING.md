# Contributing to Roadmapped

Thanks for your interest in improving Roadmapped. This document covers the dev setup, the project's philosophy, and how to submit changes.

## Dev setup

```bash
npm install
npm run dev          # starts the dashboard on http://localhost:5173
```

Other useful commands:

```bash
npm run test          # run the test suite (vitest)
npm run build         # type-check (tsc -b) and build for production (vite build)
npm run validate      # validate the YAML task backlog under docs/tasks/
```

Run `npm run test` and `npm run build` before opening a pull request — CI runs both on every push and pull request.

## Project philosophy

Roadmapped has no database. Understanding these principles will make your contributions fit naturally into the codebase:

- **Flat files are the only source of truth.** Everything the dashboard displays — backlog sections, tasks, specs — lives in plain YAML/markdown files under `docs/`. The app is a read/write view over those files, not a store of its own.
- **Every write is validated, then rolled back if invalid.** Any mutation (via the CLI or the dashboard) is applied, validated against the expected schema, and reverted if the result would be invalid. The repo should never be left in a broken state by a Roadmapped operation.
- **IDs are never reused.** Once a task ID has been assigned, it is retired for good, even if the item is later deleted. This keeps history and references stable over time.

## Contribution process

1. **Write a spec first.** Any nontrivial feature starts as a spec in `docs/specs/` before any code is written. Look at existing specs in that directory for the expected shape and level of detail.
2. **Implement against the spec**, keeping changes scoped to what the spec describes.
3. **Add or update tests** covering your change.
4. **Open a pull request** using the provided template, with tests passing locally and a reference to the spec for feature work.

## Licensing of contributions

Roadmapped is [MIT licensed](./LICENSE), and contributions follow the same terms —
**inbound = outbound**. By opening a pull request you agree that your contribution
is licensed to the project and its users under the MIT License, and that you have
the right to submit it.

We use the [Developer Certificate of Origin](https://developercertificate.org/)
(DCO) rather than a CLA — no paperwork, no copyright assignment. You certify the
DCO by signing off your commits:

```bash
git commit -s        # appends a "Signed-off-by: Your Name <you@example.com>" line
```

The sign-off is a simple statement that you wrote the patch (or otherwise have the
right to contribute it). Configure `git config user.name`/`user.email` to match the
sign-off, and use the same name and email for every commit in the PR.

## Reporting issues

Use the bug report or feature request issue templates when opening an issue — they help us triage faster.
