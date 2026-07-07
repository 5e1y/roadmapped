# Roadmaped — formats canoniques

Tout écart à ces formats est rejeté par la validation (`task.mjs validate`, relancée automatiquement après chaque écriture CLI/API, avec rollback).

## Arborescence

```
docs/tasks/
├── _meta.yaml                  # { nextId: N } — compteur global, monotone, JAMAIS édité à la main
├── _roadmaps.yaml              # optionnel — roadmaps + jalons ordonnés
├── 01-<slug>/                  # une section = un dossier, préfixe = priorité (01 = plus prioritaire)
│   ├── _section.yaml
│   ├── 01-<slug>.yaml          # une tâche = un fichier
│   ├── 02-<slug>.yaml
│   └── 02-<slug>/              # dossier JUMEAU homonyme = sous-tâches de 02-<slug>.yaml
│       └── 01-<slug>.yaml
└── _archive/
    └── 01-<slug>/              # miroir de la section d'origine, tâches livrées
```

## Tâche — schéma complet, ordre des champs CANONIQUE

```yaml
id: 42                    # alloué par le CLI depuis _meta.yaml — jamais choisi à la main
code: B3                  # optionnel, code court humain (null sinon)
title: "Titre de la tâche"
status: todo              # todo | in_progress | done — RIEN d'autre
tags: [bug, perf]         # libres, [] si aucun
size: M                   # S | M | L | null
zone: store               # zone du code concernée (libre, null si non pertinent)
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
verification: null        # COMMENT l'artefact a été vérifié (done --verification)
release: null             # version de release si applicable
```

Invariants appliqués : ids uniques globalement (archive comprise) ; chaque id de `dependsOn` existe ; pas d'auto-dépendance ; graphe `dependsOn` acyclique ; `milestone` déclaré dans `_roadmaps.yaml` ; une dépendance vers une tâche archivée compte comme satisfaite (done de fait).

## Section — `_section.yaml`

```yaml
title: "Solidité — zéro perte de données"
status: open              # open | done | dormant | abandoned
note: "Contexte de la section, d'où elle vient, pourquoi elle prime."   # ou null
```

Création : `mkdir docs/tasks/NN-slug` + écrire `_section.yaml` + `task.mjs validate`. Le préfixe `NN` donne la priorité (le `next` du CLI sert la première tâche `todo` disponible de la section `open` la plus prioritaire).

## Roadmap

**La vue Roadmap du dashboard = les sections du backlog** (une colonne par section active, ordre NN). L'état d'une tâche (fait / disponible / verrouillé) est **calculé** depuis `status` + `dependsOn` — jamais stocké. Il n'y a rien à créer : organiser les sections ET les `dependsOn`, c'est construire la roadmap.

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

`task.mjs archive <id>` déplace le fichier (+ dossier jumeau) vers `_archive/<section>/`. Exige `status: done` — rien d'autre : `completedAt` est garanti (posé automatiquement au passage à done), mais `commit`/`verification` ne le sont que si le `done` les a fournis. Consigne-les TOUJOURS avant d'archiver. On ne modifie jamais l'archive.
