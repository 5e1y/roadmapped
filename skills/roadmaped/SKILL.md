---
name: roadmaped
description: Gestion de projet Roadmaped — utiliser dès qu'il faut créer, planifier, exécuter ou consigner du travail dans ce repo (tâches, specs, roadmaps, jalons, documentation), quand l'utilisateur dit « on enchaîne sur la roadmap », « crée les tâches », « planifie X », ou à la PREMIÈRE utilisation dans un repo (phase de setup obligatoire).
---

# Roadmaped — le projet piloté par fichiers

Roadmaped transforme le repo en base de gestion de projet : **des fichiers YAML/markdown plats sont la seule source de vérité**, un CLI est ta porte d'entrée d'agent, un dashboard web local (`npm run dev` dans le dossier Roadmaped) est celle de l'humain. Tu n'inventes jamais un format : tout est spécifié dans `references/formats.md`.

## Boussole

| Objet | Où | C'est quoi |
|---|---|---|
| Tâche | `docs/tasks/<NN-stage>/<NN-slug>.yaml` | L'unité de travail. Statut, dépendances, consignation. Porte un `stage` (le QUAND, via son dossier) et une `team` (le QUI, enum fixe). |
| Stage | `docs/tasks/<NN-stage>/_section.yaml` | Une des **8 sections fixes de lancement produit** (idea→mature, immuables — voir boussole ci-dessous). **Les stages SONT les jalons** : la vue Roadmap du dashboard affiche une colonne par stage, dans l'ordre, stage vide estompé ; l'état fait/disponible/verrouillé est calculé depuis `status` + `dependsOn`. |
| Spec | `docs/specs/AAAA-MM-JJ-<sujet>.md` | Le design validé d'une feature, AVANT de créer ses tâches. |
| Doc | `docs/**/*.md` | La connaissance du projet. Chaque tâche s'y raccroche via `refs`. |
| Archive | `docs/tasks/_archive/<stage>/` | Journal des tâches livrées. On n'y écrit jamais à la main. |

Les 8 stages, dans l'ordre : `01-idea` (Idea Stage) · `02-initial` (Initial Stage) ·
`03-identity` (Identity Stage) · `04-build` (Build Stage) · `05-gtm` (GTM Stage) ·
`06-launch` (Launch Stage) · `07-scale` (Scale Stage) · `08-mature` (Mature Stage).
Ils sont créés une fois pour toutes au setup et **immuables** — pas de 9e stage, pas de
renommage. Détail des formats : `references/formats.md`.

**Il n'y a plus de fichiers « plan »** : un plan d'implémentation = des tâches chaînées par `dependsOn` (l'ordre), classées dans les stages (le moment) et affectées à une team (qui la porte). Le détail d'implémentation vit dans le champ `detail` de chaque tâche + la spec en `refs`.

**Chemins** : le CLI résout `docs/tasks/` et `docs/` via `roadmaped.config.json` à la racine du dossier Roadmaped (défauts `../docs/tasks`, `../docs`). Si Roadmaped n'est pas installé à côté de `docs/`, ajuster ce fichier AVANT le setup.

## Première utilisation dans un repo → SETUP OBLIGATOIRE

Si `docs/tasks/_meta.yaml` n'existe pas, STOP : lis `references/setup.md` et exécute la phase de prise en main (inventaire de l'existant — README, ROADMAP, TODO, plans, specs, docs — puis conversion au format Roadmaped, avec validation de l'utilisateur sur le mapping). Ne crée JAMAIS une tâche isolée dans un repo non initialisé.

## Le CLI — ta seule interface d'écriture

Toutes les commandes depuis la racine du repo (adapter `scripts/` à l'emplacement d'installation de Roadmaped) :

```
node scripts/task.mjs next                    # LA prochaine tâche à faire (jamais une verrouillée)
node scripts/task.mjs show <id> [--json]      # détail d'une tâche
node scripts/task.mjs list [--section S] [--status todo] [--team engineering] [--archive] [--json]
node scripts/task.mjs roadmap [--json]        # jalons, progression, disponible/verrouillé
node scripts/task.mjs add --section <stage> --title "..." --team <team> [--detail "..."] [--tags a,b]
     [--size S|M|L] [--code C1] [--refs f1,f2] [--links 3,4] [--depends-on 12,45]
     # --team REQUIS, enum : marketing|sales|support|operations|finance|legal|engineering|design
     # --zone n'existe plus (flag inconnu)
node scripts/task.mjs start <id>              # todo → in_progress
node scripts/task.mjs done <id> --commit <sha> --outcome "..." --verification "..." [--release v1.2]
node scripts/task.mjs update <id> [--title ...] [--status ...] [--depends-on 12,45] ["null" pour vider]
node scripts/task.mjs archive <id>            # done → _archive/ (déplace fichier + sous-tâches)
node scripts/task.mjs validate                # revalide TOUT (obligatoire après toute édition manuelle)
```

Chaque écriture CLI revalide l'intégralité de `docs/tasks/` et **rollback** si invalide. Les ids sont alloués par `_meta.yaml` et **jamais réutilisés** — ne touche jamais `nextId` à la main.

**Édition manuelle autorisée** uniquement pour ce que le CLI ne couvre pas : créer des sous-tâches (dossier jumeau homonyme). TOUJOURS suivie de `validate`. Formats exacts : `references/formats.md`. **Il n'existe pas de commande « créer une section »** : les 8 stages sont créés une fois pour toutes au setup, ni le CLI ni l'API ne permettent d'en ajouter, renommer ou supprimer.

## Les workflows complets

**`references/workflows.md` est le manuel d'exploitation** — à lire dès que tu fais plus qu'une tâche isolée : ① Idée → Spec (hard-gate : zéro code avant spec approuvée), ② Spec → Tâches (la qualité du `detail`, zéro placeholder, deps = ordre réel), ③ Exécution solo ou déléguée à des subagents (revue avant `done`, fin de chantier), ④ garde-fous transverses (TDD, cause racine avant fix, preuve avant affirmation).

## Le cycle de travail d'un agent

1. **Prendre** : `next` (ou l'id demandé par l'utilisateur). La priorité (stage puis ancienneté) est CALCULÉE PAR L'APP — consomme les ids servis par `next`/`next --count N`, ne recalcule JAMAIS l'ordre en relisant le backlog (gaspillage massif de tokens). Si la tâche est verrouillée (`roadmap` la montre locked), fais d'abord ses prérequis — ne contourne JAMAIS une dépendance. ⚠️ Rien ne l'empêche techniquement : `start`/`done` acceptent une tâche verrouillée sans erreur — le verrou est TA discipline.
2. **Démarrer** : `start <id>` avant la première ligne de code.
3. **Travailler** : suis `detail` + les documents en `refs`. Lis la spec référencée AVANT de coder.
4. **Vérifier l'artefact réel** (pas juste le typecheck) : le fichier produit, le pixel rendu, la commande exécutée.
5. **Consigner** : `done <id> --commit <sha> --outcome "..." --verification "..."` — l'outcome dit CE QUI A ÉTÉ LIVRÉ en une phrase orientée utilisateur (matière à changelog), la vérification décrit CE QUI A ÉTÉ OBSERVÉ, pas « ça marche ». Le CLI accepte `done` sans ces flags : ne le fais jamais (règle d'usage, pas garde technique — `completedAt` seul est automatique).
6. **Archiver** quand l'utilisateur clôt un chantier : `archive <id>`.

## Créer du travail (feature non triviale) — détail : workflows.md §1-2

1. **Spec d'abord, HARD-GATE** : zéro code et zéro tâche avant une spec écrite, self-reviewée et approuvée par l'utilisateur (questions une par une, 2-3 approches proposées).
2. **Décompose** en 2-8 tâches : `add` avec `--depends-on` pour l'ordre réel (ce qui peut se faire en parallèle n'a PAS de dépendance entre soi), `--refs docs/specs/<la-spec>.md`. Le `detail` porte fichiers/approche/définition de fini — zéro placeholder.
3. **Stage + team** : pour chaque tâche, choisis le stage qui correspond au moment du lancement produit où elle se joue (le QUAND — `--section` parmi les 8 stages fixes) et la team qui porte le travail (le QUI — `--team`, enum fixe). Il n'y a pas de section à créer, seulement à choisir.
4. Les cycles de dépendances sont **refusés à l'écriture** — si le CLI rejette, repense l'ordre au lieu de forcer.
5. **Contrôle final** : `roadmap` doit montrer un front de départ sensé et une fin claire.

## Règle documentation — tout est ficelé

- **Toute tâche significative (size M/L, ou architecturale) DOIT référencer en `refs` le document `docs/` pertinent**, en plus de ses refs code.
- **Si aucun doc pertinent n'existe pour une tâche importante : écrire la documentation fait partie du travail.** Crée `docs/<sujet>.md` (ou complète un doc existant) au moment du `done`, et ajoute-le aux `refs` de la tâche. Un chantier important sans doc n'est pas terminé.
- Symétriquement : quand tu écris un doc, cite les ids de tâches concernés (`#12`) pour que le lien se remonte.

## Interdits

- ❌ Éditer un YAML de tâche à la main quand le CLI couvre l'opération.
- ❌ Commencer une tâche verrouillée, ou supprimer une dépendance pour se débloquer sans accord de l'utilisateur.
- ❌ Toucher `_meta.yaml`, réutiliser un id, éditer l'archive.
- ❌ Écrire un statut hors `todo|in_progress|done`, une size hors `S|M|L`.
- ❌ Terminer (`done`) sans `--verification` honnête — et sans avoir EXÉCUTÉ la vérification (pas « ça devrait marcher »).
- ❌ Créer des fichiers de plan markdown à cocher ou un ledger de progression parallèle — les plans sont des tâches `dependsOn`, le suivi est leur statut.
- ❌ Coder avant la spec approuvée ; fixer un bug sans cause racine comprise ; empiler un 4ᵉ patch sur une approche qui a raté 3 fois.
