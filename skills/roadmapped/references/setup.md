# Roadmapped — phase de setup (première utilisation dans un repo)

Objectif : quand Roadmapped vient d'être installé, l'agent prend en main le projet — il **récupère tout ce qui existe** (docs, plans, roadmaps en prose, TODO, specs) et le **convertit au format Roadmapped**, avec l'accord de l'utilisateur sur le mapping. À la fin, `docs/tasks/` est la seule source de vérité du travail à faire.

## 0. Détection et chemins

La racine hôte = le repo courant : le CLI remonte depuis le cwd jusqu'au premier dossier portant `roadmapped.config.json` (ou `.git`), et y résout `tasksDir`/`docsDir` (défauts `docs/tasks`, `docs`, relatifs à cette racine). Vérifier que la config pointe au bon endroit AVANT toute commande, sinon le CLI travaillera au mauvais endroit.

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
- **Sort des anciens fichiers** : proposer (au choix de l'utilisateur) de les laisser intacts avec une note d'en-tête « ⚠️ Remplacé par docs/tasks/ (Roadmapped) », ou de les déplacer dans `docs/_imported/`. Ne JAMAIS supprimer sans accord explicite.

## 3. Initialisation (écriture, dans cet ordre)

1. `npx roadmapped init` — pose TOUTE la plomberie en un geste, idempotent : `roadmapped.config.json`, le squelette `docs/tasks/` (`_meta.yaml` nextId: 1 + les 8 stages canoniques avec leurs `_section.yaml`), le skill dans `.claude/skills/roadmapped/`, l'entrée MCP dans `.mcp.json`, un hook `SessionStart` dans `.claude/settings.json` (lance `sitrep` à l'ouverture de chaque session — l'état du monde est injecté d'emblée, #122), et le hook guard git (chaîné à un pre-commit existant, jamais écrasé). Il ne touche JAMAIS un `docs/tasks/` déjà peuplé ni une config existante.
2. Les 8 stages sont posés par `init`, immuables, toujours les mêmes, dans le même ordre — ce n'est PAS une proposition à l'utilisateur (leurs titres/notes canoniques : tableau `references/formats.md`).
3. `npx roadmapped validate` → doit passer AVANT d'ajouter la moindre tâche (les 8 stages présents et vides valident déjà).
4. Créer les tâches **via le CLI uniquement** (`add --section <stage> --team <team> ...`), dans l'ordre des dépendances (un `--depends-on` ne peut citer qu'un id déjà créé). `--team` est requis à chaque `add` — pas de tâche sans team. Poser `--refs`, `--tags`, `--size`, `--depends-on` dès la création. `--source user` pour ce qui vient des écrits de l'utilisateur, `ai` pour ce que tu déduis.
5. Appliquer le sort convenu des anciens fichiers.
6. `validate` final + `npx roadmapped roadmap` et `list` pour montrer le résultat à l'utilisateur.

## 4. Vérification de fin de setup

- `validate` → OK sans erreur (8 stages actifs, toute tâche active a une team).
- `next` → renvoie une vraie première tâche sensée (c'est le test d'usage : « par quoi je commence ? »).
- Dashboard : proposer à l'utilisateur `npx roadmapped dashboard` (dans le repo Roadmapped lui-même : `npm run dev`) pour voir son backlog et sa roadmap.
- Résumer : N tâches réparties sur les 8 stages (= jalons), par team, N dépendances, ce qui a été importé d'où, ce qui a été laissé de côté et pourquoi.
