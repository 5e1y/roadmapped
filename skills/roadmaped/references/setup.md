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
- **Le code lui-même** : la structure des dossiers source donne les `zone` naturelles.

## 2. Proposition de mapping (validation utilisateur OBLIGATOIRE)

Présenter en prose compacte, et attendre l'accord avant d'écrire :
- **Sections** proposées (3-8 max) : thèmes qui ressortent de l'inventaire, ordonnées par priorité perçue (01 = le plus urgent). Une section fourre-tout `99-vrac` est acceptable au début.
- **Tâches** : chaque item ouvert (case non cochée, bullet TODO, phrase « il faudrait ») → une tâche. Les items COCHÉS/finis ne sont PAS importés (l'histoire reste dans les vieux fichiers).
- **Dépendances** : les étapes ordonnées d'un même plan → chaîne `dependsOn` ; ce qui est indépendant reste sans dépendance (parallélisable).
- **Roadmap** : les sections SONT les jalons (la vue Roadmap = une colonne par section). Si l'existant évoque des phases/versions (« v1 », « beta », « phase 2 »), fais-en des SECTIONS ordonnées par le préfixe NN — pas un fichier à part.
- **Docs** : pour chaque tâche, le doc existant pertinent à mettre en `refs`. Signaler les chantiers importants SANS doc — la doc à écrire devient une tâche ou une partie du `detail`.
- **Sort des anciens fichiers** : proposer (au choix de l'utilisateur) de les laisser intacts avec une note d'en-tête « ⚠️ Remplacé par docs/tasks/ (Roadmaped) », ou de les déplacer dans `docs/_imported/`. Ne JAMAIS supprimer sans accord explicite.

## 3. Initialisation (écriture, dans cet ordre)

1. `mkdir -p docs/tasks && echo "nextId: 1" > docs/tasks/_meta.yaml`
2. Créer chaque section : `mkdir docs/tasks/NN-slug` + `_section.yaml` (format : `references/formats.md`).
3. `node scripts/task.mjs validate` → doit passer AVANT d'ajouter la moindre tâche.
4. Créer les tâches **via le CLI uniquement** (`add`), dans l'ordre des dépendances (un `--depends-on` ne peut citer qu'un id déjà créé). Poser `--refs`, `--tags`, `--size`, `--depends-on` dès la création. `--source user` pour ce qui vient des écrits de l'utilisateur, `ai` pour ce que tu déduis.
5. Appliquer le sort convenu des anciens fichiers.
6. `validate` final + `node scripts/task.mjs roadmap` et `list` pour montrer le résultat à l'utilisateur.

## 4. Vérification de fin de setup

- `validate` → OK sans erreur.
- `next` → renvoie une vraie première tâche sensée (c'est le test d'usage : « par quoi je commence ? »).
- Dashboard : proposer à l'utilisateur `npm run dev` pour voir son backlog et sa roadmap.
- Résumer : N sections (= jalons), N tâches, N dépendances, ce qui a été importé d'où, ce qui a été laissé de côté et pourquoi.
