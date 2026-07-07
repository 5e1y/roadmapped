# Roadmaped — Design V2 (dashboard → outil de gestion de projet local open source)

**Date** : 2026-07-07 · **Statut** : DRAFT — en attente de relecture Rémi
**Prédécesseur** : `2026-07-06-task-dashboard-design.md` (V1 lecture seule, livrée)

## Vision

Transformer `dashboard/` en **Roadmaped** : un outil open source de gestion de projet
local, mix Obsidian (base de données = fichiers YAML/markdown plats dans le repo) et
Jira/Linear light (tickets, jalons, dépendances), pensé pour les founders qui pilotent
leur projet avec un agent IA. S'installe dans n'importe quel repo ; l'agent lit/écrit
les tâches via un CLI et un skill Claude dédié ; l'humain pilote via un dashboard web
local, interactif, noir et blanc.

**Stratégie** : développement in-place dans ZineKit (option A) avec les vraies données
comme banc d'essai, extraction vers un repo dédié en phase 4. Discipline dès la phase 1 :
tout chemin (`tasksDir`, `docsDir`) passe par une config, jamais hardcodé en dur ailleurs.

**Une roadmap** = un graphe de tickets interconnectés par des dépendances, groupés en
jalons **sans dates**, façon arbre d'achievements Minecraft : on voit ce qui est faisable
maintenant, ce qui est verrouillé, ce qui est parallélisable, et quand c'est fini.

## Ce qui existe déjà (réutilisé tel quel)

- `dashboard/src/lib/tasks.ts` — parseur YAML → arbre (sections, tâches, sous-tâches, archive)
- `dashboard/src/lib/validate.ts` — invariants (statuts, unicité globale des ids, `nextId`)
- `dashboard/scripts/task.mjs` — CLI : allocation d'id via `_meta.yaml`, écriture canonique
  (`FIELD_ORDER`), validation totale + rollback après chaque écriture
- UI monochrome existante (Accordion Base UI, Chip, TaskRow, StatusGlyph)

## Architecture cible

```
roadmaped (= dashboard/ pendant les phases 1-3)
├── roadmaped.config.json    tasksDir, docsDir (défauts : ../docs/tasks, ../docs)
├── scripts/task.mjs         CLI agent (inchangé d'API, enrichi : archive, deps, milestones)
├── src/
│   ├── server/api.ts        Plugin Vite : middleware JSON /api/* → même module d'écriture
│   │                        que le CLI (taskWrites). Zéro process supplémentaire.
│   ├── lib/
│   │   ├── tasks.ts         + dependsOn, milestone ; lib/roadmap.ts (tri topo, availability)
│   │   ├── validate.ts      + refs de deps existantes, absence de cycles, jalons connus
│   │   └── taskWrites.ts    Logique d'écriture extraite de task.mjs, partagée CLI ⇄ API
│   └── components/          Shell 3 zones (voir UI)
└── skills/roadmaped/SKILL.md  Skill Claude livré avec l'outil (phase 4)
```

**Choix structurant — écriture disque** : le serveur dev Vite porte l'API d'écriture
(hook `configureServer`). Une seule commande (`npm run dev`) lance tout. Chaque mutation
passe par `taskWrites` : écrire → tout revalider → rollback si invalide (mécanique
actuelle du CLI, inchangée). Pas de base de données : **les fichiers YAML restent la
seule source de vérité**, éditables à la main, par l'agent, ou par l'UI.

## Modèle de données (ajouts au schéma V1)

### Tâche — 2 champs nouveaux, optionnels (rétrocompatible)
```yaml
dependsOn: [12, 45]     # ids de tâches prérequises (défaut [])
milestone: beta         # slug d'un jalon (défaut null)
```

### `_roadmaps.yaml` (nouveau, racine de tasksDir)
```yaml
roadmaps:
  - slug: launch
    title: "Lancement produit"
    milestones:            # ordonnés = colonnes de la vue roadmap
      - { slug: socle, title: "Socle" }
      - { slug: beta,  title: "Beta" }
```

### État calculé, jamais stocké
- `available` : `status ≠ done` **et** toutes les tâches de `dependsOn` sont `done`
- `locked` : au moins un prérequis non `done`
- Progression d'un jalon / d'une roadmap : agrégat des statuts de ses tâches
- Cohérent avec la décision V1 : le statut d'un parent n'est jamais recalculé ; ici on
  ne stocke aucun état dérivé, on le calcule au rendu.

### Invariants nouveaux (validate.ts, appliqués par CLI, API et dashboard)
- Chaque id de `dependsOn` existe (archive comprise) ; pas d'auto-dépendance
- Le graphe `dependsOn` est acyclique (tri topologique, erreur bloquante sinon)
- Chaque `milestone` référence un slug déclaré dans `_roadmaps.yaml`
- Slugs de jalons uniques globalement (tous roadmaps confondus)
- Une tâche archivée peut rester référencée en `dependsOn` (elle est `done` de fait)

## UI — shell 3 zones (noir et blanc, dense, façon Linear)

```
┌──────────┬────────────────────────────┬─────────────┐
│ Sidebar  │  Vue principale            │ Side panel  │
│ nav      │  (Backlog | Roadmap | Docs)│ détail tâche│
└──────────┴────────────────────────────┴─────────────┘
```

- **Sidebar gauche** (fixe ~220px) : logo Roadmaped, nav Backlog / Roadmap / Docs,
  liste des sections (Backlog) ou des roadmaps (Roadmap) ou l'arbre de fichiers (Docs).
- **Side panel droit** (~380px, s'ouvre au clic sur une tâche, partout dans l'app) :
  tous les champs de la tâche, **éditables en place** — titre, detail, statut, tags,
  size, zone, dependsOn (picker de tâches), milestone (select), refs, links.
  Le bouton « Copier le brief agent » (existant) y migre. Fermeture : Esc / ✕.
  → C'est LA réponse au « scroll infini » : le backlog reste une liste compacte,
  le détail vit dans le panneau latéral, jamais inline.
- **Palette** : monochrome actuelle conservée (`#171717` / `#fafafa` / filets `#e5e5e5`).
  Seule couleur tolérée : un vert discret pour `done` (comme la référence visuelle).

### Vue Backlog (évolution de l'existant)
Sections en accordéon (conservées), lignes de tâches compactes (statut, code, titre,
chips). Clic → side panel. Boutons « + tâche » par section, « + section » global.
Archive visible en bas (conservée).

### Vue Roadmap — 2 modes (toggle en haut)
1. **Colonnes** : une colonne par jalon (ordre de `_roadmaps.yaml`), toutes les tâches
   du jalon listées en cartes compactes, compteur x/y + barre de progression par
   colonne. Colonne « Sans jalon » en fin si des tâches de la roadmap n'en ont pas.
2. **Graphe (achievement)** : mêmes colonnes-jalons en arrière-plan ; à l'intérieur,
   cartes positionnées par couche topologique et reliées par des arêtes SVG en
   pointillés (coudes orthogonaux). États visuels : `done` = check vert,
   `available` = carte pleine + badge « Disponible », `locked` = carte grisée
   « Prérequis manquants ». Scroll horizontal. Layout calculé maison
   (tri topo + rangées), pas de lib de graphe, nœuds non draggables.

Sélecteur de roadmap dans la sidebar (si plusieurs). Clic sur carte → side panel
(où l'on édite `dependsOn` — pas de création d'arête au drag, YAGNI).

### Vue Docs (phase 3 — lecteur seul)
Arbre de `docsDir` dans la sidebar (dossiers repliables, `.md` uniquement), rendu
markdown dans la vue principale (lib `marked`, styles typographiques maison).
Lecture seule. Les wikilinks tâche ⇄ doc sont **différés** (V3) ; le champ `links`
existant les accueillera sans migration.

## API locale (plugin Vite, JSON, sans auth — outil local)

```
GET    /api/tree                    arbre complet (sections, tâches, roadmaps, archive)
POST   /api/tasks                   créer (id auto via _meta.yaml)
PATCH  /api/tasks/:id               modifier tout champ (dont dependsOn, milestone, status)
POST   /api/tasks/:id/archive       déplacer vers _archive/<section>/ (+ sous-dossier jumeau)
DELETE /api/tasks/:id               suppression réelle (confirmation UI ; l'id n'est jamais réalloué)
POST   /api/sections                créer un dossier NN-slug + _section.yaml
PATCH  /api/sections/:dir           titre / status / note
PUT    /api/roadmaps                réécrire _roadmaps.yaml (roadmaps + jalons)
GET    /api/docs et /api/docs/*     arbre de docsDir + contenu brut d'un .md (phase 3)
```
Toute écriture répond `{ ok } | { errors[] }` ; erreurs affichées dans l'UI (toast +
détail). Après mutation, l'UI recharge `/api/tree` (pas de state optimiste, simplicité).
Le chargement `import.meta.glob` actuel est remplacé par `GET /api/tree` (une seule
source de lecture, celle du serveur — nécessaire de toute façon pour refléter les
écritures sans rebuild).

## CLI `task.mjs` — extensions (l'interface de l'agent)

- `add`/`update` acceptent `--depends-on 12,45` et `--milestone beta`
- `archive <id>` (nouveau — remplace le `git mv` manuel)
- `roadmap [--json]` (nouveau — jalons, progression, tâches disponibles/verrouillées)
- `next` devient dépendance-aware : ne propose jamais une tâche `locked`

## Skill Claude (`skills/roadmaped/SKILL.md`, phase 4)

Enseigne à l'agent : la source de vérité (fichiers YAML, schéma exact), le réflexe
`next` → `start` → travail → `done --commit --verification`, l'interdiction d'éditer
les YAML à la main quand le CLI couvre l'opération, la consignation (verification,
commit, release), et la gestion des dépendances (ne jamais commencer une tâche
verrouillée). Copié dans `.claude/skills/roadmaped/` du repo hôte à l'installation.
Le détail (install `npx roadmaped init`, README, licence MIT) sera spécifié en phase 4.

## Phases (chacune : plan court → implémentation par subagents → vérif artefact)

1. **Socle interactif** : config paths, `taskWrites` partagé, API Vite, shell 3 zones,
   CRUD complet sections/tâches depuis l'UI (créer, éditer, archiver, supprimer).
2. **Roadmap** : schéma `dependsOn`/`milestone`/`_roadmaps.yaml`, validation (cycles),
   vue Colonnes + vue Graphe, édition des deps/jalons dans le side panel, CLI étendu.
3. **Docs** : arbre + rendu markdown (`marked`).
4. **Roadmaped open source** : renommage complet, skill Claude, README, extraction
   repo dédié + mécanisme d'installation.

## Hors périmètre (différé, décisions explicites)

- Édition markdown des docs dans l'app (l'agent écrit les docs, l'humain les lit)
- Wikilinks tâche ⇄ doc cliquables (V3 — le schéma les accueille déjà via `links`)
- Dates, Gantt, vélocité, assignation multi-utilisateurs, temps réel/websockets
- Drag & drop d'arêtes dans le graphe ; kanban (redondant avec Backlog + Colonnes)
- Recherche globale (V3)

## Tests

- `roadmap.ts` (topo, cycles, availability) et `validate.ts` étendus : tests unitaires Vitest
- `taskWrites` : tests d'intégration sur un tasksDir temporaire (création, rollback)
- API : testée à travers taskWrites (le middleware est une couche fine) ; vérification
  finale = artefact réel (créer/modifier une tâche depuis l'UI, relire le YAML sur disque)
