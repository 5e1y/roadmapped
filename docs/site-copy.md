# Site copy — Roadmapped landing

**Status: copy source of truth for the marketing site. The site itself lives in a
separate repo (`roadmapped-site`, deployed via Cloudflare Pages) — this doc is the copy
it renders, not a page in this repo.
Language: EN. Voice: [docs/tone-of-voice.md](./tone-of-voice.md), applied to the letter.**

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

> Get started — `npx github:5e1y/roadmapped init`

**Under the CTA**

> Straight from GitHub. Nothing to publish, nothing to sign up for. There's no step 2. We checked.

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
   > One folder per type — nine of them (bug, feature, chore, design, legal,
   > business, and the rest). Every task is a YAML file you can diff, review, and
   > blame — because it is one. Full CRUD from the dashboard or the CLI.

2. **Priority is a temperature, not a deadline**
   > No dates to lie about, no stages to pretend you're in. Each task runs a
   > temperature that rises with age and with how much it blocks — so `next`
   > hands your agent the thing that actually matters, computed, every time.

3. **Roadmap with nothing to drift**
   > `done` / `available` / `locked` are computed from the dependency graph on
   > every read, never stored. There's no second copy to fall out of sync,
   > because there's no second copy.

4. **Agent-first, by design**
   > A CLI (`npx roadmapped`) and a Claude skill so your agent creates specs,
   > tasks and dependencies in the correct schema — and records what it ships
   > with more discipline than most of us manage. Every write goes through one
   > validator; on error it rolls back; ids are never reused. Git is the audit log.

5. **A local app, not a tab you log into**
   > The dashboard is a small server that runs from your repo and serves a
   > pre-built app — it updates live as your agent writes, no reload. Installing
   > it pulls ~30 MB, not a front-end toolchain. Light and dark, because your
   > eyes.

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
> The dashboard isn't hosted anywhere. `npx roadmapped dashboard` starts a small
> server on your machine that serves a pre-built app and watches your files —
> your agent records a task from the CLI, and the open dashboard reflects it
> live, no refresh. Run it in two repos at once; each takes its own port. Close
> the tab and nothing phones home, because there's nowhere to phone.
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
> that records every task it ships. The done backlog is the changelog. The
> commit history is the proof. If you want to know whether the workflow holds
> up, don't take our word for it — read the backlog.

---

## Quickstart

**Section title**

> Quickstart

**Body**

```bash
npx --yes github:5e1y/roadmapped init   # scaffold docs/tasks/ + the Claude skill + git guard
npm install                             # pull it in — the dashboard ships pre-built, so this is light
npx roadmapped dashboard                # open it in your browser
```

**Under the block**

> Needs Node ≥ 22.18 and a `package.json`. That's the whole list. Point your AI
> agent at the Claude skill and it takes it from there.

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
