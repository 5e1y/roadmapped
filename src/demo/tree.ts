import { buildTaskTree, type TaskFileMap, type TaskTree } from '../lib/tasks'

/*
 * Le backlog DÉMO (#148) — celui qui s'affiche sur roadmapped.work.
 *
 * Quatrième mur assumé : ces tickets sont les étapes (à peine romancées) de la
 * construction de la homepage qui les affiche. Le format est le VRAI format —
 * des fichiers YAML passés dans le VRAI parseur (buildTaskTree) et couverts par
 * la VRAIE validation (tree.test.ts). Si le schéma évolue, la démo casse en CI,
 * pas en production chez un visiteur.
 *
 * La v1 rejetée de la homepage (#8) reste dans le backlog, done. Transparence
 * désarmante : c'est arrivé, c'est consigné, c'est le produit qui fonctionne.
 */

const section = (title: string, note: string): string =>
  `title: "${title}"\nstatus: "open"\nnote: "${note}"\n`

export const DEMO_FILES: TaskFileMap = {
  'docs/tasks/_meta.yaml': 'nextId: 18\n',

  'docs/tasks/_epics.yaml': `epics:
  - slug: "homepage"
    title: "The homepage you are reading"
`,

  // ------------------------------------------------------------ stages (8, canoniques)
  'docs/tasks/01-idea/_section.yaml': section('Idea Stage', "L'idée initiale, sa validation, le problème/la cible."),
  'docs/tasks/02-initial/_section.yaml': section('Initial Stage', "Nom, repo, structure juridique — l'existence du projet."),
  'docs/tasks/03-identity/_section.yaml': section('Identity Stage', 'Marque, domaine, présence sociale, positionnement.'),
  'docs/tasks/04-build/_section.yaml': section('Build Stage', 'Construire le produit ET ses fondations business (site, emails, comptabilité).'),
  'docs/tasks/05-gtm/_section.yaml': section('GTM Stage', 'Go-to-market : contenu, outbound, acquisition payante.'),
  'docs/tasks/06-launch/_section.yaml': section('Launch Stage', 'Lancer : produit, site, moteur de contenu, qualification.'),
  'docs/tasks/07-scale/_section.yaml': section('Scale Stage', 'Monitoring, SEO, communauté, deals, billing, support.'),
  'docs/tasks/08-mature/_section.yaml': section('Mature Stage', 'Referral, legal & compliance, intégrations avancées.'),

  // ------------------------------------------------------------ 01-idea
  'docs/tasks/01-idea/01-the-demo-should-be-the-product.yaml': `id: 1
title: "The demo should be the product"
status: "done"
tags:
  - "site"
size: "M"
team: "design"
detail: "Options considered for the hero: a video (goes stale), screenshots (lie by omission), a hand-built imitation (see #8, RIP). Decision: embed the real dashboard, showing the backlog that built the page. This ticket is in that backlog. You see the problem."
refs: []
links: []
dependsOn: []
epic: "homepage"
source: "user"
createdAt: "2026-06-12T09:14:31"
startedAt: "2026-06-12T09:30:02"
completedAt: "2026-06-13"
commit: "b41c07d"
outcome: "The hero demo is the app. The app is showing you this decision being made."
verification: "you're looking at it"
release: null
`,

  // ------------------------------------------------------------ 02-initial
  'docs/tasks/02-initial/01-name-check-roadmapped-work.yaml': `id: 2
kind: "quick"
title: "Name check: roadmapped.work"
status: "done"
tags:
  - "site"
size: "S"
team: "operations"
detail: null
refs: []
links: []
dependsOn: []
epic: "homepage"
source: "user"
createdAt: "2026-06-12T11:02:47"
completedAt: "2026-06-12"
commit: null
outcome: "The domain was available. That is the entire story of this ticket."
verification: null
release: null
`,

  // ------------------------------------------------------------ 03-identity
  'docs/tasks/03-identity/01-copy-that-survives-the-tone-of-voice.yaml': `id: 3
title: "Copy that survives the tone-of-voice doc"
status: "done"
tags:
  - "site"
  - "copy"
size: "M"
team: "marketing"
detail: "House rules: direct, deadpan, never negative, no marketing voice. Every headline gets re-read by the agent against the doc before it ships."
refs:
  - "docs/tone-of-voice.md"
links: []
dependsOn:
  - 1
epic: "homepage"
source: "user"
createdAt: "2026-06-14T10:05:12"
startedAt: "2026-06-14T10:21:44"
completedAt: "2026-06-16"
commit: "0d9e4f1"
outcome: "Four rewrites. The document won."
verification: "agent re-read it — “almost not salesy”"
release: null
`,

  'docs/tasks/03-identity/02-monochrome-plus-one-blue.yaml': `id: 4
title: "Monochrome + one blue, both themes"
status: "done"
tags:
  - "site"
  - "design"
size: "S"
team: "design"
detail: "One accent color, used rarely enough to mean something. Light and dark via prefers-color-scheme — no toggle to maintain, the OS already has one."
refs:
  - "design.md"
links: []
dependsOn:
  - 1
epic: "homepage"
source: "ai"
createdAt: "2026-06-14T14:40:09"
startedAt: "2026-06-15T09:02:18"
completedAt: "2026-06-15"
commit: "c41d2aa"
outcome: "One blue. It does a lot of work."
verification: "toggle your OS theme"
release: null
`,

  // ------------------------------------------------------------ 04-build
  'docs/tasks/04-build/01-columns-view.yaml': `id: 5
title: "Columns view"
status: "done"
tags:
  - "dashboard"
size: "M"
team: "engineering"
detail: "Three columns, zero drag-and-drop. The agent moves the cards by editing YAML; you review the diff. A board you cannot fidget with is a board that tells the truth."
refs:
  - "src/components/TaskColumns.tsx"
links: []
dependsOn:
  - 1
epic: "homepage"
source: "ai"
createdAt: "2026-06-17T08:55:33"
startedAt: "2026-06-17T09:10:20"
completedAt: "2026-06-18"
commit: "7c25a3e"
outcome: "Three columns, no drag-and-drop, on purpose."
verification: "you're looking at it"
release: null
`,

  'docs/tasks/04-build/02-dependency-graph-view.yaml': `id: 6
title: "Dependency graph view"
status: "done"
tags:
  - "dashboard"
size: "M"
team: "engineering"
detail: "dependsOn is already a graph; drawing it is the honest part. Dagre lays it out, SVG renders it, done/available/locked states are computed on every read — never stored."
refs:
  - "src/components/RoadmapGraph.tsx"
links: []
dependsOn:
  - 5
epic: "homepage"
source: "ai"
createdAt: "2026-06-18T10:12:05"
startedAt: "2026-06-18T11:00:41"
completedAt: "2026-06-20"
commit: "e8f21b6"
outcome: "The Roadmap tab up there. Same data, different shape."
verification: "it's the other tab"
release: null
`,

  'docs/tasks/04-build/03-task-panel-on-click.yaml': `id: 7
title: "Task panel on click"
status: "done"
tags:
  - "dashboard"
size: "S"
team: "engineering"
detail: null
refs:
  - "src/components/TaskPanel.tsx"
links: []
dependsOn:
  - 5
epic: "homepage"
source: "ai"
createdAt: "2026-06-19T15:22:58"
startedAt: "2026-06-20T09:31:12"
completedAt: "2026-06-21"
commit: "51adc90"
outcome: "You clicked, it opened."
verification: "this panel"
release: null
`,

  'docs/tasks/04-build/05-demo-mode-static-tree.yaml': `id: 9
title: "Demo mode — static tree, polite refusals"
status: "done"
tags:
  - "site"
  - "demo"
size: "M"
team: "engineering"
detail: "The dashboard you are using right now: the backlog is baked into the bundle at build time, and every attempt to save is declined with an apology. Same components, same parser, same validator as the real app — minus the part where anything happens."
refs:
  - "src/demo/tree.ts"
  - "src/demo/api.ts"
links: []
dependsOn:
  - 5
  - 6
  - 7
epic: "homepage"
source: "ai"
createdAt: "2026-07-02T09:47:26"
startedAt: "2026-07-02T10:15:03"
completedAt: "2026-07-06"
commit: "a90cc31"
outcome: "A read-only build of the app with this backlog inside it."
verification: "try editing anything"
release: null
`,

  'docs/tasks/04-build/06-embed-the-real-dashboard.yaml': `id: 10
title: "Embed the real dashboard in the homepage"
status: "in_progress"
tags:
  - "site"
  - "demo"
size: "L"
team: "engineering"
detail: "v1 imitated the dashboard by hand (RIP #8). It was almost right, which is the worst kind of wrong. v2 stops pretending: build the actual app with the demo tree baked in, put it in an iframe, full width. If you can read this ticket, it is working."
refs:
  - "src/demo/main.tsx"
links:
  - 8
dependsOn:
  - 9
epic: "homepage"
source: "user"
createdAt: "2026-07-05T08:30:14"
startedAt: "2026-07-07T09:02:55"
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  'docs/tasks/04-build/07-kill-the-horizontal-scroll.yaml': `id: 11
kind: "quick"
title: "Kill the horizontal scroll on mobile"
status: "done"
tags:
  - "site"
  - "a11y"
size: "S"
team: "engineering"
detail: null
refs: []
links: []
dependsOn: []
epic: "homepage"
source: "ai"
createdAt: "2026-07-06T16:08:42"
completedAt: "2026-07-06"
commit: "4f7d21c"
outcome: "The demo scrolls inside its own frame now, like it always should have."
verification: null
release: null
`,

  // ------------------------------------------------------------ 05-gtm
  'docs/tasks/05-gtm/01-launch-post.yaml': `id: 12
title: "Launch post"
status: "todo"
tags:
  - "content"
size: "M"
team: "marketing"
detail: "Working title: “Your repo is already your project management tool.” The post is mostly written — it is this backlog, narrated."
refs: []
links: []
dependsOn:
  - 10
epic: "homepage"
source: "user"
createdAt: "2026-07-06T11:20:37"
startedAt: null
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  'docs/tasks/05-gtm/02-post-it-then-do-not-refresh.yaml': `id: 13
title: "Post it, then don't refresh the analytics for one hour"
status: "todo"
tags:
  - "content"
size: "S"
team: "marketing"
detail: "The hard part is the second half."
refs: []
links: []
dependsOn:
  - 12
  - 15
epic: "homepage"
source: "user"
createdAt: "2026-07-06T11:23:51"
startedAt: null
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  // ------------------------------------------------------------ 06-launch
  'docs/tasks/06-launch/01-deploy-to-cloudflare-pages.yaml': `id: 14
title: "Deploy to Cloudflare Pages"
status: "done"
tags:
  - "site"
size: "S"
team: "operations"
detail: "Static files, no build step on the far side. The deploy instructions fit in four lines and one of them is a joke."
refs:
  - "wrangler.jsonc"
links: []
dependsOn:
  - 3
  - 4
epic: "homepage"
source: "ai"
createdAt: "2026-06-28T09:12:44"
startedAt: "2026-06-28T09:40:31"
completedAt: "2026-06-28"
commit: "3fe6a12"
outcome: "npx wrangler deploy. There is no step 2."
verification: "you're looking at the deployment"
release: null
`,

  'docs/tasks/06-launch/02-homepage-v2-live.yaml': `id: 15
kind: "milestone"
title: "Homepage v2 live"
status: "todo"
tags:
  - "site"
size: null
team: "engineering"
detail: "The real dashboard, embedded, in production. Unlocks when #10 lands."
refs: []
links: []
dependsOn:
  - 10
  - 14
epic: "homepage"
source: "user"
createdAt: "2026-07-05T08:35:29"
startedAt: null
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  // ------------------------------------------------------------ 07-scale
  'docs/tasks/07-scale/01-answer-the-first-github-issue.yaml': `id: 16
title: "Answer the first GitHub issue"
status: "todo"
tags: []
size: "S"
team: "support"
detail: "Within a day, like a shop that answers its own phone."
refs: []
links: []
dependsOn:
  - 15
epic: "homepage"
source: "user"
createdAt: "2026-07-06T11:31:08"
startedAt: null
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  // ------------------------------------------------------------ 08-mature
  'docs/tasks/08-mature/01-still-no-database.yaml': `id: 17
title: "Still no database"
status: "todo"
tags: []
size: "S"
team: "engineering"
detail: "Recurring ticket. Someone suggests one; we decline; the ticket closes itself. Your data stays a folder of files you can read without us."
refs: []
links: []
dependsOn:
  - 15
epic: "homepage"
source: "user"
createdAt: "2026-07-06T11:34:26"
startedAt: null
completedAt: null
commit: null
outcome: null
verification: null
release: null
`,

  // La v1 rejetée : done, consignée, jamais cachée — le backlog est le changelog.
  'docs/tasks/04-build/04-homepage-v1-hand-built-imitation.yaml': `id: 8
title: "Homepage v1 — a hand-built imitation of the dashboard"
status: "done"
tags:
  - "site"
size: "L"
team: "engineering"
detail: "Rebuild the dashboard in vanilla JS for the hero: columns, graph, task panel, agent pane. 288 lines of very sincere JavaScript."
refs: []
links:
  - 10
dependsOn: []
epic: "homepage"
source: "ai"
createdAt: "2026-06-22T09:18:40"
startedAt: "2026-06-22T09:44:07"
completedAt: "2026-06-27"
commit: "9b30f77"
outcome: "A faithful-ish replica. It was almost right, which is the worst kind of wrong: the graph diverged, the scroll broke, and the agent pane looked like part of the app. Rejected in review, replaced by the real thing (#10). Kept here because the backlog is the changelog, including this part."
verification: "rejected — see #10"
release: null
`,
}

/** L'arbre démo, construit par le VRAI parseur. Une seule fois par session. */
let cached: TaskTree | null = null
export function demoTree(): TaskTree {
  if (!cached) cached = buildTaskTree(DEMO_FILES)
  return cached
}
