# Contenus d'annonce — lancement open source (#20)

**Statut : prêt à publier, sous réserve des deux points ci-dessous.** Applique
[docs/tone-of-voice.md](./tone-of-voice.md) à la lettre ; canaux, langues et timing
viennent de [docs/comms-plan.md](./comms-plan.md).

**Avant publication (J0) :**
1. Remplacer chaque `[GITHUB]` par l'URL réelle du repo public (inconnue à la rédaction).
2. Re-vérifier les chiffres du ledger ci-dessous (une commande chacun) — la précision
   maniaque est la voix ; un chiffre périmé la trahit.

## Ledger des chiffres (vérifiés le 2026-07-08)

| Chiffre | Valeur | Source / commande de re-vérification |
|---|---|---|
| Tests | **239** (13 fichiers) | `npx vitest run` — « Tests 239 passed » |
| Stages | **8** (Idea → Mature) | `ls docs/tasks/` (01-idea … 08-mature) |
| Tâches backlog | **131**, dont **111 done** | `find docs/tasks -name "*.yaml" -not -name "_meta.yaml" \| wc -l` · `grep -rln "status: done" docs/tasks \| wc -l` |
| Commandes CLI | **15** | `node scripts/task.mjs --help` (sitrep, take, brief, next, quick, add, start, done, update, list, show, validate, roadmap, audit, guard) |
| Tools MCP | **13** | `scripts/mcp-server.mjs` (mêmes verbes, sans audit/guard) |
| Dépendances runtime | **7** | `package.json` → `dependencies` |
| Licence | **MIT** | `LICENSE` |
| Site | **roadmapped.work** | comms-plan (Cloudflare) |

**Interdit d'usage** : toute durée de développement (« trois semaines », « deux jours ») —
l'historique git local ne permet pas de l'attester proprement. On compte, on ne chronomètre pas.

---

## 1. Show HN (EN — J0, 16h-17h CET)

### Titre (72 caractères, limite HN : 80)

```
Show HN: Roadmapped – flat-file project management, built for AI agents
```

URL soumise : `[GITHUB]` (le repo, pas le site — HN préfère la source).

### Premier commentaire (posté par Rémi immédiatement après la soumission)

```
Hi HN — Roadmapped is project management as a folder. Tasks are YAML files
under docs/tasks/, the roadmap is a dependency graph across 8 fixed stages,
docs are your existing markdown, and the dashboard is a local app that reads
all of it. There is no database: the files are the database, your git history
is the audit log, and account deletion is `rm -rf` (GDPR compliant by design).

Architecture decisions that survived contact with reality:

- One validator for every write. The dashboard and the CLI write through the
  same validation layer; on error, the change rolls back. There is no second,
  parallel schema hiding somewhere for one interface to disagree with.

- Ids are immutable and never reused. Deleting task #42 does not free #42.
  This costs almost nothing and eliminates an entire genre of "wait, which
  #42?" archaeology.

- Roadmap states (done / available / locked) are computed from the dependency
  graph on every read, never stored. Nothing drifts out of sync, because
  there is no second copy to drift.

The reason it exists: AI agents. A 14-command CLI, a Claude skill and an MCP
server let an agent pick the next unblocked task, ship it, and record the
result — outcome, verification, commit sha. A git hook refuses any commit
that isn't attached to a task. I wrote that hook; it has rejected my commits.

Dogfooding was total. Roadmapped's own backlog is managed by Roadmapped,
mostly by a Claude agent: 131 tasks as of today, 111 shipped, each recording
the commit that delivered it. The done backlog doubles as the changelog —
it's in the repo, so you can audit whether the workflow actually holds up
instead of taking my word for it.

MIT, local-only, 239 tests, 7 runtime dependencies. Happy to answer anything.
Substantive critiques get converted into tasks in the public backlog, so you
can watch me not get to them in real time.
```

---

## 2. Product Hunt (EN — J0, 00h01 PT)

**Nom** : Roadmapped

**Tagline** (49 caractères, limite PH : 60)

```
Your repo is already your project management tool
```

**Description** (fiche produit)

```
Backlog, roadmap and docs as plain YAML and markdown inside your repository —
the only source of truth. No database, no SaaS, no account. A CLI, a Claude
skill and an MCP server let your AI agent create tasks, respect dependencies,
and record what it ships; you review the diff. Open source, MIT, runs on your
machine. Deleting your data is rm -rf.
```

**Galerie** (rappel du plan, pas un livrable texte) : captures des 3 vues + GIF du
cycle agent (`take` → travail → `done`).

### Premier commentaire du maker (au lancement)

```
Hi Product Hunt — maker here.

I built a project management tool so I could stop managing my project. The
idea: your repo already contains everything a PM tool stores — work items,
priorities, history. Roadmapped just gives it a shape. Tasks are YAML files,
the roadmap is computed from dependencies across 8 fixed stages, and the
dashboard is a local app reading your folder. No server. Not out of
principle — we simply don't have one to send your data to.

The first user was never a human: it's an AI agent. Through a CLI, a Claude
skill and an MCP server, the agent picks the next unblocked task, ships it,
and records outcome, verification and commit. Roadmapped's own backlog is
managed this way — 131 tasks, 111 shipped so far, all public in the repo.

It's MIT and free. No pricing page, no seats, no "contact sales" — we don't
have a customer success team because we don't have customers.

I'll be here all day. Tell me what's broken; it becomes a task in the public
backlog, which is the closest thing I have to a roadmap promise.
```

### Deuxième commentaire du maker (à poster quelques heures plus tard, en réponse à l'activité)

```
A few numbers, since launch posts are supposed to have numbers: 239 tests,
14 CLI commands, 7 runtime dependencies, 0 databases. The most useful feature
turned out to be a git hook that refuses any commit not attached to a task.
I installed it to discipline the agent. It mostly disciplines me.
```

---

## 3. LinkedIn

### 3a. Post FR (compte Rémi — J0 midi)

```
J'ai construit un outil de gestion de projet pour éviter de gérer mon projet.

Ça s'appelle Roadmapped, c'est open source (MIT), et le principe tient en une
phrase : votre repo est déjà votre outil de gestion de projet — on a juste
ajouté l'interface. Les tâches sont des fichiers YAML dans votre dépôt, la
roadmap est calculée depuis les dépendances, la documentation est votre
dossier docs/. Pas de compte, pas de serveur, pas de base de données.
Supprimer vos données, c'est rm -rf. Le RGPD n'a rien trouvé à redire.

Le premier utilisateur n'est pas humain. C'est un agent IA, qui pilote l'outil
via un CLI et un skill Claude : il prend la prochaine tâche déverrouillée, la
livre, et consigne le résultat — outcome, vérification, commit. Un hook git
refuse tout commit sans tâche associée. Je précise que ce hook, je l'ai écrit
moi-même, et qu'il m'a déjà refusé des commits. L'outil me gère. C'était très
exactement l'inverse du plan.

Les chiffres, puisque c'est un post de lancement : 131 tâches au backlog
public, dont 111 livrées. 239 tests. 8 étapes fixes, d'Idea à Mature. Le
backlog de Roadmapped est géré par Roadmapped — l'historique du repo en
témoigne, commit par commit, avec une honnêteté que je trouve personnellement
excessive.

Je ne vais pas vous promettre une révolution de votre productivité. C'est un
dossier de fichiers. Mais c'est un dossier très bien rangé, et il est gratuit.

Lien en commentaire, comme le veut la tradition que je désapprouve et
respecte.
```

**Commentaire (le lien)**

```
Le repo : [GITHUB]
Le site : https://roadmapped.work — pas de cookie, pas de tracking, et aucune
newsletter ne vous attend au tournant.
```

### 3b. Post EN (compte Rémi — J+1, post séparé, formulation propre)

```
The first user of my project management tool has never been human.

Yesterday I open-sourced Roadmapped (link in comments — I don't make the
rules, I just resent and follow them). It turns your repository into your
project management tool: tasks as YAML files, a roadmap computed from
dependencies, docs rendered from your docs/ folder. No SaaS, no database,
no account. Your data stays on your machine — not as a privacy stance, we
just never built a server.

What I actually learned shipping it:

1. An AI agent is a better process citizen than I am. Through the CLI and
   the Claude skill, it picks the next unblocked task, ships it, and records
   outcome, verification and commit — every single time. I record things
   "later".

2. Enforcement beats intention. A git hook refuses commits not attached to a
   task. Installed to keep the agent honest. Statistically, it corrects me
   more often.

3. Transparency is cheaper than reporting. The backlog is public in the repo:
   131 tasks, 111 shipped. Nobody asks me for status updates. The folder is
   the status update.

It's MIT and free. I won't claim it will change how you work. It's a folder.
A well-organized folder, which is more than I can say for most of my ideas.
```

**Commentaire (le lien)**

```
Repo: [GITHUB] · Site: https://roadmapped.work
No newsletter is lying in wait.
```

---

## 4. X/Twitter — thread EN (J0)

**Tweet 1 — avec GIF.** *Description du GIF à produire (dépend de #134) : la vue
Roadmap, 8 colonnes Idea → Mature, graphe de dépendances visible. Une tâche passe à
`done` ; en cascade, deux tâches aval basculent de `locked` (grisé) à `available`,
sans rechargement. Boucle de ~6 secondes.*

```
Your repo is already your project management tool. We just added the
interface.

Roadmapped: backlog, roadmap and docs as flat files in your repo, driven by
your AI agent. Open source, MIT. A short thread, one fact per tweet.
```

**Tweet 2**

```
There is no database. Tasks are YAML files under docs/tasks/. The files are
the database, git history is the audit log, and rm -rf is the account
deletion flow. GDPR compliant by design.
```

**Tweet 3**

```
Roadmap states — done / available / locked — are computed from the dependency
graph on every read. Never stored. Nothing drifts out of sync, because there
is no second copy to drift.
```

**Tweet 4**

```
Task ids are immutable and never reused. Deleting #42 does not free #42.
A tiny rule that deletes an entire genre of confusion.
```

**Tweet 5**

```
Every write — dashboard or CLI — goes through the same validator. On error,
it rolls back. There is no second, parallel schema hiding somewhere waiting
to disagree.
```

**Tweet 6**

```
It's built for AI agents: a 14-command CLI, a Claude skill, an MCP server.
The agent picks the next unblocked task, ships it, and records outcome,
verification and commit. You review the diff.
```

**Tweet 7**

```
A git hook refuses any commit that isn't attached to a task. I wrote it to
keep the agent honest. It has rejected my commits more often than the
agent's.
```

**Tweet 8**

```
Dogfooding was total: Roadmapped's backlog is managed by Roadmapped, mostly
by a Claude agent. 131 tasks, 111 shipped, each with its commit. The done
backlog is the changelog. It's all in the repo.
```

**Tweet 9**

```
MIT. Free. 239 tests, 7 runtime dependencies, 0 servers.

https://roadmapped.work
[GITHUB]

It's a folder. But it's a very good folder.
```

---

## 5. Reddit

### 5a. r/ClaudeAI (EN — J0)

**Titre**

```
I gave Claude a project management skill — now a git hook refuses my commits and the agent's paperwork is better than mine
```

**Post**

```
I've been running my whole project through Claude for a while, and the part
that kept breaking wasn't the code — it was the bookkeeping. The agent would
ship something real, and the record of *what* and *why* lived in a chat
scrollback that evaporates.

So I built Roadmapped and just open-sourced it (MIT). Tasks are YAML files in
the repo, and Claude drives them through a skill + a 14-command CLI (there's
an MCP server too, same core). The cycle the skill enforces:

- `sitrep` — one call, the whole state of the project: what shipped today,
  what's in progress, the next 3 unblocked tasks.
- `take` — picks the next available task from the dependency graph, starts
  it, and returns a dense brief (deps, refs with code excerpts).
- work happens.
- `done --outcome --verification` — the agent records what it shipped, how
  it verified it, and the commit sha (auto-filled from HEAD).

Two design choices that made the difference for agent use:

1. A git hook refuses any commit not attached to a task. No "I'll log it
   later" — for the agent or for me. Mostly me, it turns out.
2. The skill has an anti-token rule: the CLI is self-describing, so the agent
   never re-reads the backlog to "re-prioritize". It consumes the queue as
   served, whether the backlog holds 10 tasks or, currently, 131.

The proof it works: Roadmapped's own backlog is managed by Roadmapped, via
Claude — 111 of 131 tasks shipped and recorded, all public in the repo.

Repo: [GITHUB] — setup in the first comment. Happy to answer questions about
the skill design; that part took more iterations than the app.
```

**Premier commentaire (setup)**

```
Setup:

    git clone [GITHUB]
    cd Roadmapped
    npm install
    npm run dev                  # dashboard on http://localhost:5173
    node scripts/task.mjs --help # the CLI the agent drives

Then point Claude (Claude Code or any agent that loads skills) at
skills/roadmapped/ — the skill handles first-run setup in your own repo,
including creating docs/tasks/. The MCP server (scripts/mcp-server.mjs)
exposes the same 14 commands as tools if you prefer that route.

Full guide: docs/guide.md in the repo.
```

### 5b. r/SideProject (EN — J+1)

**Titre**

```
I open-sourced my project management tool. Its backlog was managed by itself, mostly by an AI agent.
```

**Post**

```
Solo project, just went public, figured this sub would appreciate the
honest version.

Roadmapped turns a git repo into a project management tool: tasks are YAML
files, the roadmap is computed from dependencies, docs are your existing
markdown. No SaaS, no database, no account — the dashboard is a local app
reading your folder. It's built so an AI agent can drive it (CLI + Claude
skill + MCP server): the agent takes the next unblocked task, ships it, and
records outcome, verification and commit.

The part I'm actually proud of: the tool built itself in public. Its own
backlog is managed by it — 131 tasks, 111 shipped, every one recorded with
the commit that delivered it, all visible in the repo. When something
embarrassing broke, that's in there too. I considered cleaning the history
for launch and decided the history *is* the pitch.

It's MIT and free — no premium tier waiting behind a toggle. What it is not:
a Jira replacement for a 40-person org. It's for solo devs and small teams
who already live in their repo and don't want another tab.

Repo: [GITHUB] · Site: https://roadmapped.work

Feedback very welcome, especially the unkind kind — it gets filed as a task
in the public backlog, which is the most accountability I've ever had on a
side project.
```

### 5c. r/opensource (EN — J+1)

**Titre**

```
Roadmapped — MIT-licensed project management as flat files in your repo. No server, no telemetry, no open-core.
```

**Post**

```
Just released, sharing here because the license model is the point, not a
footnote.

Roadmapped is project management as a folder: tasks as YAML, roadmap computed
from a dependency graph, docs rendered from your docs/ directory, a local
dashboard on top. Designed for AI-agent workflows (CLI + Claude skill + MCP
server), but everything is hand-editable — the YAML is meant to be read
without the tool.

The open source part, concretely:

- MIT, the whole thing. No enterprise edition, no feature behind a license
  key, no "cloud version" that quietly becomes the real product.
- No server and no telemetry — not as a promise, as an architecture. There is
  nothing to phone home to. Your data never leaves your machine because there
  is nowhere for it to go.
- Built in public in the literal sense: the project's backlog is managed by
  the project, inside the repo. 131 tasks, 111 shipped, each recorded with
  its commit. The development history isn't a marketing asset we curated —
  it's just the repo.

239 tests, 7 runtime dependencies. Repo: [GITHUB]

I'm the sole maintainer for now, so issues and PRs land in a public backlog
you can actually watch. That's either transparency or a bus factor of one,
depending on your mood. Both, probably.
```

---

## 6. Discord / forums Anthropic (EN — J+1)

**Message (canal partage de skills / show-and-tell)**

```
Sharing a skill I've been dogfooding hard: **Roadmapped** — project
management as flat files in your repo, with Claude as the primary operator.

The skill gives the agent a full work cycle over YAML task files: `sitrep`
(project state in one call) → `take` (next unblocked task + dense brief) →
ship → `done --outcome --verification` (commit sha auto-filled). A git hook
enforces that every commit belongs to a task, and the skill has a strict
anti-token rule — the CLI is self-describing, so the agent never burns
context re-reading the backlog to second-guess priorities.

It's been managing its own development: 111 of 131 backlog tasks shipped and
recorded by the agent, all public in the repo. MIT, local-only, no server.
There's an MCP server exposing the same 14 commands if you'd rather wire it
as tools.

Repo: [GITHUB] · Site: https://roadmapped.work

Most interested in feedback on the skill design (the decision ladder and the
token rules took more iterations than the app itself). The agent that built
it reviewed this message and found it too promotional. It's been noted.
```

---

*Tâche #20 · Réponses aux commentaires : règles dans docs/comms-plan.md §Règles
de réponse (48 premières heures).*
