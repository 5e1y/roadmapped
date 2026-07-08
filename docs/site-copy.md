# Site copy — Roadmapped landing

**Status: proposal, section by section. Language: EN. Voice:
[docs/tone-of-voice.md](./tone-of-voice.md), applied to the letter.**

Audience: solo founders and developers who run their work through an AI agent
(Claude Code and friends). They already live in the repo. They don't want
another SaaS tab.

Promise: *your repo is already your project management tool.*

Differentiators: flat files, no database, no SaaS, agent-first, local,
open source, MIT.

---

## Hero

**Headline**

> Your repo is already your project management tool.
> We just added the interface.

**Subhead**

> Backlog, roadmap and docs as plain YAML and markdown inside your repository —
> the only source of truth. No database, no SaaS, no account. Your AI agent
> reads and writes it in the right format; you review the diff.

**Primary CTA**

> Get started — `npm install`

**Under the CTA**

> There's no step 2. We checked.

**Secondary link**

> View on GitHub →

---

## Animated demo (caption)

*Placement: right under the hero, a short looping capture of the dashboard +
the agent recording a task from the CLI.*

**Caption**

> This is the whole product. An agent picks a task, ships it, and records what
> it did — commit, outcome, verification. The dashboard is just a nicer way to
> read the files it wrote. You could read them in your editor. Some people do.

---

## Features

*Placement: three or four cards, or a compact table. Keep the numbers real.*

**Section title**

> What's in the folder

**Cards**

1. **Backlog that lives in git**
   > Sections and tasks under `docs/tasks/`. Full CRUD from the dashboard or the
   > CLI. Every task is a YAML file you can diff, review, and blame — because it
   > is one.

2. **Roadmap with no dates to lie about**
   > Your sections become milestones. `done` / `available` / `locked` states are
   > computed from the dependency graph on every read, never stored. Nothing to
   > drift out of sync, because there's no second copy.

3. **Agent-first, by design**
   > A CLI (`scripts/task.mjs`) and a Claude skill so your agent creates specs,
   > tasks and dependencies in the correct schema — and records what it ships
   > with more discipline than most of us manage.

4. **Validated writes, honest history**
   > Every write — from the dashboard or the CLI — goes through the same
   > validator. On error, the change rolls back. Ids are never reused. Your git
   > history is the audit log.

---

## How it works

**Section title**

> How it works (it's files)

**Body**

> Everything is flat, hand-editable files: task YAML you can read without us,
> docs rendered straight from your `docs/` folder. The dashboard and the CLI
> read and write the same data through the same validator — never a second,
> parallel schema hiding somewhere.
>
> Yes, it's a folder of YAML files. No, it's not a database. That's kind of the
> point.

---

## Built by using it

*Placement: a short trust section. This is the founder-transparency beat.*

**Section title**

> Built by using itself

**Body**

> Roadmapped's own backlog is managed by Roadmapped, mostly by a Claude agent
> that records every task it ships. The `_archive` folder is the changelog. The
> commit history is the proof. If you want to know whether the workflow holds
> up, don't take our word for it — read the archive.

---

## Quickstart

**Section title**

> Quickstart

**Body**

```bash
npm install
npm run dev                  # dashboard on http://localhost:5173
node scripts/task.mjs --help # the CLI your agent (or you) drives
```

**Under the block**

> Point your AI agent at the Claude skill and it takes it from there.

---

## Privacy

**Section title**

> Where your data lives

**Body**

> On your machine, in your repo. Not out of principle — we simply don't have a
> server to send it to. Deleting your account is `rm -rf`. GDPR compliant by
> design; the design being that we never had your data.

---

## Open source

**Section title**

> Free, and actually free

**Body**

> MIT licensed. No pricing page, no seats, no "contact sales." We don't have a
> customer success team to schedule an onboarding call — we don't have
> customers. It's free.

**CTA**

> Star it on GitHub · Read the guide

---

## Footer

> Roadmapped — project management as flat files. MIT © Rémi Courtillon.
>
> Made with an AI agent that proofreads this site and thinks it's too salesy.
