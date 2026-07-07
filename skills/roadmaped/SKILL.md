---
name: roadmaped
description: Gestion de projet Roadmaped — utiliser dès qu'il faut créer, planifier, exécuter ou consigner du travail dans ce repo (tâches, specs, roadmaps, jalons, documentation), quand l'utilisateur dit « on enchaîne sur la roadmap », « crée les tâches », « planifie X », ou à la PREMIÈRE utilisation dans un repo (phase de setup obligatoire).
---

# Roadmaped — le projet piloté par fichiers

Roadmaped transforme le repo en base de gestion de projet : **des fichiers YAML/markdown plats sont la seule source de vérité**, un CLI est ta porte d'entrée d'agent, un dashboard web local (`npm run dev` dans le dossier Roadmaped) est celle de l'humain. Tu n'inventes jamais un format : tout est spécifié dans `references/formats.md`.

## Boussole

| Objet | Où | C'est quoi |
|---|---|---|
| Tâche | `docs/tasks/<NN-section>/<NN-slug>.yaml` | L'unité de travail. Statut, dépendances, consignation. |
| Section | `docs/tasks/<NN-section>/_section.yaml` | Groupe thématique de tâches, priorité = préfixe numérique. **Les sections SONT les jalons** : la vue Roadmap du dashboard affiche une colonne par section, l'état fait/disponible/verrouillé est calculé depuis `status` + `dependsOn`. |
| Spec | `docs/specs/AAAA-MM-JJ-<sujet>.md` | Le design validé d'une feature, AVANT de créer ses tâches. |
| Doc | `docs/**/*.md` | La connaissance du projet. Chaque tâche s'y raccroche via `refs`. |
| Archive | `docs/tasks/_archive/<section>/` | Journal des tâches livrées. On n'y écrit jamais à la main. |

**Il n'y a plus de fichiers « plan »** : un plan d'implémentation = des tâches chaînées par `dependsOn` (l'ordre), regroupées en sections (la destination). Le détail d'implémentation vit dans le champ `detail` de chaque tâche + la spec en `refs`.

**Chemins** : le CLI résout `docs/tasks/` et `docs/` via `roadmaped.config.json` à la racine du dossier Roadmaped (défauts `../docs/tasks`, `../docs`). Si Roadmaped n'est pas installé à côté de `docs/`, ajuster ce fichier AVANT le setup.

## Première utilisation dans un repo → SETUP OBLIGATOIRE

Si `docs/tasks/_meta.yaml` n'existe pas, STOP : lis `references/setup.md` et exécute la phase de prise en main (inventaire de l'existant — README, ROADMAP, TODO, plans, specs, docs — puis conversion au format Roadmaped, avec validation de l'utilisateur sur le mapping). Ne crée JAMAIS une tâche isolée dans un repo non initialisé.

## Le CLI — ta seule interface d'écriture

Toutes les commandes depuis la racine du repo (adapter `scripts/` à l'emplacement d'installation de Roadmaped) :

```
node scripts/task.mjs next                    # LA prochaine tâche à faire (jamais une verrouillée)
node scripts/task.mjs show <id> [--json]      # détail d'une tâche
node scripts/task.mjs list [--section S] [--status todo] [--archive] [--json]
node scripts/task.mjs roadmap [--json]        # jalons, progression, disponible/verrouillé
node scripts/task.mjs add --section <dir> --title "..." [--detail "..."] [--tags a,b]
     [--size S|M|L] [--zone z] [--code C1] [--refs f1,f2] [--links 3,4] [--depends-on 12,45]
node scripts/task.mjs start <id>              # todo → in_progress
node scripts/task.mjs done <id> --commit <sha> --verification "..." [--release v1.2]
node scripts/task.mjs update <id> [--title ...] [--status ...] [--depends-on 12,45] ["null" pour vider]
node scripts/task.mjs archive <id>            # done → _archive/ (déplace fichier + sous-tâches)
node scripts/task.mjs validate                # revalide TOUT (obligatoire après toute édition manuelle)
```

Chaque écriture CLI revalide l'intégralité de `docs/tasks/` et **rollback** si invalide. Les ids sont alloués par `_meta.yaml` et **jamais réutilisés** — ne touche jamais `nextId` à la main.

**Édition manuelle autorisée** uniquement pour ce que le CLI ne couvre pas : créer une section (dossier `NN-slug/` + `_section.yaml`), créer des sous-tâches (dossier jumeau homonyme). TOUJOURS suivie de `validate`. Formats exacts : `references/formats.md`.

## Les workflows complets

**`references/workflows.md` est le manuel d'exploitation** — à lire dès que tu fais plus qu'une tâche isolée : ① Idée → Spec (hard-gate : zéro code avant spec approuvée), ② Spec → Tâches (la qualité du `detail`, zéro placeholder, deps = ordre réel), ③ Exécution solo ou déléguée à des subagents (revue avant `done`, fin de chantier), ④ garde-fous transverses (TDD, cause racine avant fix, preuve avant affirmation).

## Le cycle de travail d'un agent

1. **Prendre** : `next` (ou l'id demandé par l'utilisateur). Si la tâche est verrouillée (`roadmap` la montre locked), fais d'abord ses prérequis — ne contourne JAMAIS une dépendance. ⚠️ Rien ne l'empêche techniquement : `start`/`done` acceptent une tâche verrouillée sans erreur — le verrou est TA discipline.
2. **Démarrer** : `start <id>` avant la première ligne de code.
3. **Travailler** : suis `detail` + les documents en `refs`. Lis la spec référencée AVANT de coder.
4. **Vérifier l'artefact réel** (pas juste le typecheck) : le fichier produit, le pixel rendu, la commande exécutée.
5. **Consigner** : `done <id> --commit <sha> --verification "..."` — la vérification décrit CE QUI A ÉTÉ OBSERVÉ, pas « ça marche ». Le CLI accepte `done` sans ces flags : ne le fais jamais (règle d'usage, pas garde technique — `completedAt` seul est automatique).
6. **Archiver** quand l'utilisateur clôt un chantier : `archive <id>`.

## Créer du travail (feature non triviale) — détail : workflows.md §1-2

1. **Spec d'abord, HARD-GATE** : zéro code et zéro tâche avant une spec écrite, self-reviewée et approuvée par l'utilisateur (questions une par une, 2-3 approches proposées).
2. **Décompose** en 2-8 tâches : `add` avec `--depends-on` pour l'ordre réel (ce qui peut se faire en parallèle n'a PAS de dépendance entre soi), `--refs docs/specs/<la-spec>.md`. Le `detail` porte fichiers/approche/définition de fini — zéro placeholder.
3. **Jalon** : si le chantier mérite sa propre colonne dans la roadmap, crée une section dédiée (le préfixe NN place sa priorité) plutôt que de gonfler une section existante.
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
