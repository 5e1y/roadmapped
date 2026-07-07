# Roadmaped — formats canoniques

Tout écart à ces formats est rejeté par la validation (`task.mjs validate`, relancée automatiquement après chaque écriture CLI/API, avec rollback).

## Arborescence

`docs/tasks/` contient **exactement les 8 stages canoniques** ci-dessous — la séquence
universelle d'un lancement de produit. Aucun autre dossier de section n'est admis :
`validate` rejette un 9e dossier, un slug non canonique, ou un stage manquant.

| Dossier | Titre canonique | Esprit (note par défaut à l'init) |
|---|---|---|
| `01-idea` | Idea Stage | L'idée initiale, sa validation, le problème/la cible. |
| `02-initial` | Initial Stage | Nom, repo, structure juridique — l'existence du projet. |
| `03-identity` | Identity Stage | Marque, domaine, présence sociale, positionnement. |
| `04-build` | Build Stage | Construire le produit ET ses fondations business (site, emails, comptabilité). |
| `05-gtm` | GTM Stage | Go-to-market : contenu, outbound, acquisition payante. |
| `06-launch` | Launch Stage | Lancer : produit, site, moteur de contenu, qualification. |
| `07-scale` | Scale Stage | Monitoring, SEO, communauté, deals, billing, support. |
| `08-mature` | Mature Stage | Referral, legal & compliance, intégrations avancées. |

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — compteur global, monotone, JAMAIS édité à la main
├── _roadmaps.yaml              # optionnel — roadmaps + jalons ordonnés
├── 01-idea/                    # stage canonique, créé au setup — jamais créé/renommé à la main
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # une tâche = un fichier
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # dossier JUMEAU homonyme = sous-tâches de 02-<slug>.yaml
│       └── 01-<slug>.yaml
├── 02-initial/
├── 03-identity/
├── 04-build/
├── 05-gtm/
├── 06-launch/
├── 07-scale/
├── 08-mature/
└── _archive/
    └── 01-idea/                # miroir du stage d'origine, tâches livrées
```

Un stage vide (aucune tâche) reste présent — il s'affiche estompé dans le dashboard,
il ne disparaît jamais.

## Tâche — schéma complet, ordre des champs CANONIQUE

```yaml
id: 42                    # alloué par le CLI depuis _meta.yaml — jamais choisi à la main
code: B3                  # optionnel, code court humain (null sinon)
title: "Titre de la tâche"
status: todo              # todo | in_progress | done — RIEN d'autre
tags: [bug, perf]         # libres, [] si aucun
size: M                   # S | M | L | null
team: engineering         # marketing | sales | support | operations | finance | legal | engineering | design — REQUIS, enum stricte
detail: |
  Le QUOI et le POURQUOI, les pièges connus, la définition de fini.
refs:                     # fichiers pertinents : code (chemin:ligne) ET documentation
  - src/lib/foo.ts:120
  - docs/specs/2026-07-07-ma-feature.md
  - docs/ARCHITECTURE.md
links: []                 # ids d'autres tâches liées (contexte, pas ordre)
dependsOn: [12, 45]       # ids PRÉREQUIS — la tâche est verrouillée tant qu'ils ne sont pas done
milestone: null           # avancé (cf. § _roadmaps.yaml) — laisser null en usage normal
source: ai                # user | ai — qui a créé la tâche
createdAt: "2026-07-07"
completedAt: null         # posé automatiquement au passage à done
commit: null              # sha du commit de livraison (consigné par done --commit)
outcome: null             # CE QUI A ÉTÉ LIVRÉ, une phrase orientée utilisateur (done --outcome) — matière à changelog
verification: null        # COMMENT l'artefact a été vérifié (done --verification)
release: null             # version de release si applicable
```

Invariants appliqués : ids uniques globalement (archive comprise) ; chaque id de `dependsOn` existe ; pas d'auto-dépendance ; graphe `dependsOn` acyclique ; `milestone` déclaré dans `_roadmaps.yaml` ; une dépendance vers une tâche archivée compte comme satisfaite (done de fait) ; `team` présente et ∈ l'enum sur toute tâche active, sous-tâches comprises (l'archive n'est pas re-validée — les tâches archivées avant le refactor stages+teams gardent leur ancien schéma tel quel).

## Stage — `_section.yaml`

```yaml
title: "Idea Stage"
status: open              # open | done | dormant | abandoned
note: "L'idée initiale, sa validation, le problème/la cible."   # ou null — pré-rempli à l'init avec l'esprit du stage
```

`title` est **verrouillé** par la validation : il doit être exactement le titre canonique du stage (tableau ci-dessus). `status` et `note` restent libres — un stage traversé se marque `done`, `note` s'enrichit avec le temps (best practices, contexte propre au projet).

**Il n'y a pas de commande « créer une section »** : ni CLI, ni API, ni édition manuelle. Les 8 stages sont créés une fois pour toutes à l'init du setup (`references/setup.md`) et sont immuables — on ne les renomme ni ne les ajoute ni ne les supprime jamais. Le préfixe `NN` donne l'ordre d'affichage (déjà fixé par la séquence idea→mature).

## Roadmap

**La vue Roadmap du dashboard = les 8 stages du backlog** (une colonne par stage, dans l'ordre idea→mature, stage vide estompé). L'état d'une tâche (fait / disponible / verrouillé) est **calculé** depuis `status` + `dependsOn` — jamais stocké. Il n'y a rien à créer : classer chaque tâche dans le bon stage ET poser ses `dependsOn`, c'est construire la roadmap.

### `_roadmaps.yaml` (avancé, optionnel — non affiché par le dashboard)

Regroupements de jalons nommés, encore supportés par la validation et `task.mjs roadmap` :

```yaml
roadmaps:
  - slug: launch
    title: "Lancement produit"
    milestones:
      - { slug: socle, title: "Socle" }
      - { slug: beta,  title: "Beta" }
```

Slugs de jalons uniques globalement ; le champ `milestone` d'une tâche doit référencer un slug déclaré. Ne t'en sers pas sauf demande explicite de l'utilisateur.

## Spec — `docs/specs/AAAA-MM-JJ-<sujet>.md`

Markdown libre mais toujours : contexte/objectif, décisions prises (et alternatives écartées), périmètre ET hors-périmètre explicites, critères de fini. Une spec est validée par l'utilisateur AVANT la création des tâches qui la référencent.

## Sous-tâches

Dossier jumeau homonyme du fichier de tâche (voir arborescence). Le CLI ne les crée pas directement : créer la tâche via `add` dans la section (l'id est alloué proprement), puis **`mv`** (pas `git mv` — le fichier vient d'être créé, il est untracked et `git mv` échoue) le fichier dans le dossier jumeau, puis `validate`. Ne JAMAIS consommer `nextId` à la main. Le statut du parent n'est jamais recalculé depuis ses sous-tâches (décision délibérée).

## Archive

`task.mjs archive <id>` déplace le fichier (+ dossier jumeau) vers `_archive/<section>/`. Exige `status: done` — rien d'autre : `completedAt` est garanti (posé automatiquement au passage à done), mais `commit`/`outcome`/`verification` ne le sont que si le `done` les a fournis. Consigne-les TOUJOURS avant d'archiver. On ne modifie jamais l'archive.
