# Roadmapped — formats canoniques

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
├── _epics.yaml                 # optionnel — déclaration des epics (titre lisible, ordre)
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
kind: quick               # ADDITIF — absent = task (défaut). quick = mini-ticket ; milestone = JALON (cf. § Jalons)
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
epic: null                # REGROUPEMENT transverse aux stages : slug partagé par les tâches d'un même projet (ex: refonte-graphe) — cf. § Epics
source: ai                # user | ai — qui a créé la tâche
createdAt: "2026-07-07"
completedAt: null         # posé automatiquement au passage à done
commit: null              # sha du commit de livraison (consigné par done --commit)
outcome: null             # CE QUI A ÉTÉ LIVRÉ, une phrase orientée utilisateur (done --outcome) — matière à changelog
verification: null        # COMMENT l'artefact a été vérifié (done --verification)
release: null             # version de release si applicable
```

Invariants appliqués : ids uniques globalement (archive comprise) ; chaque id de `dependsOn` existe ; pas d'auto-dépendance ; graphe `dependsOn` acyclique ; `epic` est un slug (minuscules/chiffres/tirets) ou null — AUCUNE déclaration exigée ; une dépendance vers une tâche archivée compte comme satisfaite (done de fait) ; `team` présente et ∈ l'enum sur toute tâche active, sous-tâches comprises (l'archive n'est pas re-validée — les tâches archivées avant le refactor stages+teams gardent leur ancien schéma tel quel).

**Rétrocompat `milestone` (#133)** : l'ancien champ `milestone:` d'un YAML est LU comme `epic` et migre automatiquement au prochain dump ; le flag CLI `--milestone` reste un alias déprécié de `--epic`. Ne plus jamais écrire `milestone:` dans un YAML.

## Stage — `_section.yaml`

```yaml
title: "Idea Stage"
status: open              # open | done | dormant | abandoned
note: "L'idée initiale, sa validation, le problème/la cible."   # ou null — pré-rempli à l'init avec l'esprit du stage
```

`title` est **verrouillé** par la validation : il doit être exactement le titre canonique du stage (tableau ci-dessus). `status` et `note` restent libres — un stage traversé se marque `done`, `note` s'enrichit avec le temps (best practices, contexte propre au projet).

**Il n'y a pas de commande « créer une section »** : ni CLI, ni API, ni édition manuelle. Les 8 stages sont créés une fois pour toutes à l'init du setup (`references/setup.md`) et sont immuables — on ne les renomme ni ne les ajoute ni ne les supprime jamais. Le préfixe `NN` donne l'ordre d'affichage (déjà fixé par la séquence idea→mature).

## Roadmap, progression, epics, jalons

**La vue Roadmap du dashboard = les 8 stages du backlog** (une colonne par stage, dans l'ordre idea→mature, stage vide estompé). L'état d'une tâche (fait / disponible / verrouillé) est **calculé** depuis `status` + `dependsOn` — jamais stocké. Il n'y a rien à créer : classer chaque tâche dans le bon stage ET poser ses `dependsOn`, c'est construire la roadmap.

**Progression** : `sitrep` affiche une ligne `avancement: x/y (pct%)` (archive comptée done, stages abandoned/dormant exclus) ; `task.mjs roadmap` détaille l'avancement global + par epic. Compte simple de tâches, pas de pondération par size.

### Epics — le regroupement transverse (champ `epic`)

Un **epic** regroupe les tâches d'un même gros projet À TRAVERS les stages (ex. « refonte du graphe » = sa spec + ses tâches + ses fixes ultérieures). C'est un simple slug partagé (`epic: refonte-graphe`) — aucune déclaration requise (auto-découverte). Le dashboard offre un mode « grouper par epic » dans le Backlog, et le panneau de tâche édite le champ (combobox + création à la volée).

`_epics.yaml` (optionnel) déclare titre lisible et ordre :

```yaml
epics:
  - { slug: refonte-graphe, title: "Refonte du graphe" }
  - { slug: socle,          title: "Socle" }
```

Slugs uniques. **Rétrocompat** : un ancien `_roadmaps.yaml` est encore LU (ses jalons aplatis deviennent des epics) mais n'est plus écrit — l'API expose `PUT /api/epics`.

### Jalons — `kind: milestone`

Un **jalon** est une tâche-cible dont d'autres tâches dépendent : `add --kind milestone --blocks 1,2` crée le jalon ET l'ajoute aux `dependsOn` des tâches citées (`--blocks` = l'inverse ergonomique de `--depends-on`). Le verrou est la mécanique `dependsOn` STANDARD (aucune sémantique nouvelle) : tant que le jalon n'est pas done, ses dépendants sont verrouillés. Rendu distinct : glyphe **diamant** + badge « bloque N » (dashboard, N = dépendants inverses calculés). Ne pas confondre : `epic` regroupe, `kind: milestone` verrouille.

## Spec — `docs/specs/AAAA-MM-JJ-<sujet>.md`

Markdown libre mais toujours : contexte/objectif, décisions prises (et alternatives écartées), périmètre ET hors-périmètre explicites, critères de fini. Une spec est validée par l'utilisateur AVANT la création des tâches qui la référencent.

## Sous-tâches

Dossier jumeau homonyme du fichier de tâche (voir arborescence). Le CLI ne les crée pas directement : créer la tâche via `add` dans la section (l'id est alloué proprement), puis **`mv`** (pas `git mv` — le fichier vient d'être créé, il est untracked et `git mv` échoue) le fichier dans le dossier jumeau, puis `validate`. Ne JAMAIS consommer `nextId` à la main. Le statut du parent n'est jamais recalculé depuis ses sous-tâches (décision délibérée).

## Archive

`task.mjs archive <id>` déplace le fichier (+ dossier jumeau) vers `_archive/<section>/`. Exige `status: done` — rien d'autre : `completedAt` est garanti (posé automatiquement au passage à done), mais `commit`/`outcome`/`verification` ne le sont que si le `done` les a fournis. Consigne-les TOUJOURS avant d'archiver. On ne modifie jamais l'archive.
