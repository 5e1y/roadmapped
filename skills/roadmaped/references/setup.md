# Roadmaped — phase de setup (première utilisation dans un repo)

Objectif : quand Roadmaped vient d'être installé, l'agent prend en main le projet — il **récupère tout ce qui existe** (docs, plans, roadmaps en prose, TODO, specs) et le **convertit au format Roadmaped**, avec l'accord de l'utilisateur sur le mapping. À la fin, `docs/tasks/` est la seule source de vérité du travail à faire.

## 0. Détection et chemins

Vérifier `roadmaped.config.json` à la racine du dossier Roadmaped : `tasksDir`/`docsDir` doivent pointer vers le bon endroit du repo hôte (défauts `../docs/tasks`, `../docs`). L'ajuster AVANT toute commande, sinon le CLI travaillera au mauvais endroit.

Setup requis si `docs/tasks/_meta.yaml` n'existe pas. S'il existe, le repo est déjà initialisé — ne refais JAMAIS le setup (tu écraserais l'état réel).

## 1. Inventaire (lecture seule, AVANT toute écriture)

Balayer et lister ce qui existe :
- **Vision/backlog en prose** : `README*`, `ROADMAP*`, `TODO*`, `BACKLOG*`, `NOTES*`, issues exportées.
- **Plans** : tout markdown à cases à cocher (`- [ ]`), dossiers `plans/`, `docs/plans/`.
- **Specs/designs** : `docs/specs/`, `specs/`, RFC, ADR.
- **Documentation** : tout `docs/**/*.md` (et wiki embarqué) — elle ne sera PAS convertie, elle sera **référencée**.
- **Le code lui-même** et l'organisation de l'équipe : donnent des indices pour déduire la `team` naturelle de chaque tâche (qui la porterait).

## 2. Proposition de mapping (validation utilisateur OBLIGATOIRE)

Présenter en prose compacte, et attendre l'accord avant d'écrire :
- **Stages** : il n'y a rien à proposer — les 8 stages canoniques (`01-idea` → `08-mature`, voir `references/formats.md`) sont fixes et créés tels quels. Le travail consiste à **mapper** l'existant vers eux : si l'inventaire évoque des phases/versions (« v1 », « beta », « phase 2 », des sections de ROADMAP.md…), fais correspondre chacune au stage du cycle de lancement produit qui lui ressemble le plus (une v1 orientée construction → `04-build` ; un lancement coordonné → `06-launch` ; etc.), au lieu de créer une nouvelle section.
- **Tâches** : chaque item ouvert (case non cochée, bullet TODO, phrase « il faudrait ») → une tâche, déposée dans le stage mappé. Les items COCHÉS/finis ne sont PAS importés (l'histoire reste dans les vieux fichiers) — sauf pour `01-idea`/`02-initial` qui peuvent naître `done` avec 2-3 tâches rétroactives si ça raconte l'histoire vraie du projet.
- **Team** : chaque tâche importée reçoit une `team` (enum fixe : `marketing | sales | support | operations | finance | legal | engineering | design`), déduite du contenu (qui ferait ce travail dans l'équipe). Aucune tâche active ne reste sans team — c'est un champ obligatoire, pas une déduction optionnelle.
- **Dépendances** : les étapes ordonnées d'un même plan → chaîne `dependsOn` ; ce qui est indépendant reste sans dépendance (parallélisable).
- **Roadmap** : les 8 stages SONT les jalons (la vue Roadmap = une colonne par stage, dans l'ordre idea→mature, stage vide estompé). Rien à créer ni ordonner : le mapping ci-dessus suffit.
- **Docs** : pour chaque tâche, le doc existant pertinent à mettre en `refs`. Signaler les chantiers importants SANS doc — la doc à écrire devient une tâche ou une partie du `detail`.
- **Sort des anciens fichiers** : proposer (au choix de l'utilisateur) de les laisser intacts avec une note d'en-tête « ⚠️ Remplacé par docs/tasks/ (Roadmaped) », ou de les déplacer dans `docs/_imported/`. Ne JAMAIS supprimer sans accord explicite.

## 3. Initialisation (écriture, dans cet ordre)

1. `mkdir -p docs/tasks && echo "nextId: 1" > docs/tasks/_meta.yaml`
2. Créer les 8 stages canoniques, immuables : pour chacun, `mkdir docs/tasks/NN-slug` + `_section.yaml` avec le `title` canonique exact et la `note` d'esprit du stage par défaut (tableau `references/formats.md`). Ce n'est PAS une proposition à l'utilisateur — les 8 stages sont toujours les mêmes, dans le même ordre.
3. `node scripts/task.mjs validate` → doit passer AVANT d'ajouter la moindre tâche (les 8 stages présents et vides valident déjà).
4. Créer les tâches **via le CLI uniquement** (`add --section <stage> --team <team> ...`), dans l'ordre des dépendances (un `--depends-on` ne peut citer qu'un id déjà créé). `--team` est requis à chaque `add` — pas de tâche sans team. Poser `--refs`, `--tags`, `--size`, `--depends-on` dès la création. `--source user` pour ce qui vient des écrits de l'utilisateur, `ai` pour ce que tu déduis.
5. Appliquer le sort convenu des anciens fichiers.
6. `validate` final + `node scripts/task.mjs roadmap` et `list` pour montrer le résultat à l'utilisateur.

## 4. Vérification de fin de setup

- `validate` → OK sans erreur (8 stages actifs, toute tâche active a une team).
- `next` → renvoie une vraie première tâche sensée (c'est le test d'usage : « par quoi je commence ? »).
- Dashboard : proposer à l'utilisateur `npm run dev` pour voir son backlog et sa roadmap.
- Résumer : N tâches réparties sur les 8 stages (= jalons), par team, N dépendances, ce qui a été importé d'où, ce qui a été laissé de côté et pourquoi.
