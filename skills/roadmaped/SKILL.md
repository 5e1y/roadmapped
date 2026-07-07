---
name: roadmaped
description: Gestion de projet Roadmaped — utiliser dès qu'il faut créer, planifier, exécuter ou consigner du travail dans ce repo (tâches, specs, roadmaps, jalons, documentation), quand l'utilisateur dit « on enchaîne sur la roadmap », « crée les tâches », « planifie X », ou à la PREMIÈRE utilisation dans un repo (phase de setup obligatoire).
---

# Roadmaped — le projet piloté par fichiers

## Boussole

Des fichiers YAML/markdown plats sous `docs/tasks/` sont la SEULE source de vérité (pas de plan parallèle). 8 stages fixes et immuables (`01-idea` → `08-mature` = les jalons, une colonne du dashboard chacun). Toute tâche active porte une `team` obligatoire (enum fixe). Le CLI `node scripts/task.mjs <commande>` est ta SEULE interface d'écriture — jamais d'édition manuelle d'un YAML que le CLI couvre.

## Échelle de décision — stop au premier barreau qui tient

1. Ce changement mérite-t-il seulement d'exister ? Sinon ne crée rien.
2. Un `quick` suffit-il (fix isolé, taille S, pas de decisions à trancher) ? → `quick`, done avec `--outcome` seul.
3. Sinon une tâche seule suffit-elle ? → `add`, cycle normal.
4. Sinon (multi-tâches, choix d'archi à trancher) : spec d'abord, PUIS les tâches (`references/planning.md`).

## Le cycle

`take [--team t]` (prend + démarre + brief en 1 appel) → travailler (`detail` + `refs`) → vérifier l'artefact RÉEL (pas juste le typecheck) → `done <id> --commit <sha> --outcome "…" --verification "…"` (un `quick` : `--outcome` seul suffit).

## Les commandes (une ligne chacune)

- `take [--team t] [--json]` — next + start + brief, LA commande d'ouverture de session.
- `brief <id>` — contexte d'exécution complet et dense (deps/liées titrées, refs, rappel `done`).
- `next [--count N] [--team t] [--json]` — la file de travail à CONSOMMER telle quelle.
- `quick "<titre>" --team <t> [--stage s] [--start] [--json]` — mini-ticket, cérémonie minimale.
- `add --section <stage> --title <t> --team <t> [--detail d] [--refs a,b] [--depends-on 1,2] [--json]` — créer une tâche.
- `start <id>` — todo → in_progress.
- `done <id> [--commit sha] [--outcome o] [--verification v] [--release r]` — consigner la livraison.
- `update <id> [--champ valeur ...]` — patch générique (`"null"` pour vider un champ).
- `archive <id>` — done → `_archive/<stage>/`.
- `list [--section s] [--status s] [--team t] [--archive] [--json]` — lister.
- `show <id> [--json]` — détail complet d'une tâche.
- `validate` — revalide tout `docs/tasks/` (obligatoire après toute édition manuelle).
- `roadmap [--json]` — vue jalons/progression, disponible/verrouillé.

## Règle d'or anti-token

Pour `take`/`brief`/`next`/`quick`/`add`/`start`/`done` : n'ouvre AUCUNE référence — le CLI est autoportant (`--help` et les messages d'erreur guident). Consomme la file servie par `next`/`take` telle quelle, ne RECALCULE jamais la priorité en relisant le backlog.

## Interdits

- ❌ Éditer un YAML à la main quand le CLI couvre l'opération, ou toucher `_meta.yaml`/l'archive/réutiliser un id.
- ❌ Démarrer une tâche verrouillée ou contourner une dépendance sans accord explicite.
- ❌ `done` sans `--outcome` honnête (et `--verification` réellement exécutée pour un `task`) — jamais « ça devrait marcher ».
- ❌ Créer un 9e stage, renommer un stage, ou écrire un statut/size hors enum.
- ❌ Coder du non-trivial (barreau 4) sans spec approuvée d'abord.
- ❌ Créer un fichier de plan markdown parallèle — un plan, ce sont des tâches chaînées par `dependsOn`.

## Routeur — n'ouvre une référence QUE sur ce déclencheur précis

Décomposer une spec / planifier → `references/planning.md` · premier setup d'un repo (`docs/tasks/_meta.yaml` absent) → `references/setup.md` · éditer un YAML à la main (sous-tâches, cas non couverts) → `references/formats.md` · déléguer à des subagents → `references/delegation.md`.
