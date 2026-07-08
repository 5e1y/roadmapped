# Spec — Distribution et installation : paquet npm `roadmapped` + `npx roadmapped init`, orchestré par le skill

**Date** : 2026-07-08 · **Statut** : DRAFT — en attente de relecture Rémi
**Prédécesseur** : `2026-07-07-roadmaped-v2-design.md` (phase 4 « mécanisme d'installation », différée) · **Ticket** : #12
**Voisins** : `#121` (init *riche* : questionnaire, migration, CLAUDE.md — le CONTENU de l'init) · `#14` (préparer le skill pour distribution) · `#123` (valider dans un repo hôte réel)

## Problème (constaté dans le code)

Roadmapped ne se **dogfoode** aujourd'hui que sur lui-même : app, CLI, `docs/tasks/`, config et skill vivent tous à la racine de ce dépôt (`ls` racine → `scripts/`, `src/`, `skills/roadmapped/`, `roadmapped.config.json`, `docs/tasks/`). L'usage final est l'inverse : un repo hôte avec SON code, où Roadmapped n'est qu'un sous-ensemble greffé. Trois hypothèses « repo == racine » cassent à l'installation :

1. **Le paquet n'est pas publiable.** `package.json` porte `"private": true`, aucun champ `bin`, aucun champ `files`. Rien ne sort de ce dépôt aujourd'hui.
2. **La résolution de racine pointe sur le paquet, pas sur l'hôte.** `src/lib/paths.ts` : `dashboardRoot()` remonte de deux niveaux depuis `src/lib/` et `loadPaths()` lit la config *là* — soit `node_modules/roadmapped/` une fois installé, pas la racine du repo hôte. Le défaut `tasksDir: '../docs/tasks'` (relatif à ce dossier) enverrait le CLI écrire dans `node_modules/…/docs/tasks`. Le CLI et le serveur MCP travailleraient au mauvais endroit.
3. **Les chemins CLI du skill sont codés en dur sur ce dépôt.** `SKILL.md` (l.10), `references/setup.md` (l.35, 38) et `references/delegation.md` (l.12) disent `node scripts/task.mjs <cmd>` — un chemin qui n'existe pas à la racine d'un repo hôte (le binaire vit dans `node_modules/roadmapped/scripts/`). Le ticket #14 note la même dette (le SKILL.md historique disait même `dashboard/scripts/task.mjs`).

Le hook git (`scripts/githooks/pre-commit` → `node scripts/task.mjs guard`, câblé par le script `prepare` via `core.hooksPath scripts/githooks`) et le serveur MCP (`.mcp.json` → `node scripts/mcp-server.mjs`) souffrent du même chemin-en-dur.

## Décision (tranchée par Rémi — rappel en tête)

**LES DEUX.** Un paquet npm publié **`roadmapped`** avec un **bin `init`**, ET un **skill Claude** qui l'orchestre. Le skill est le **point d'entrée côté agent** ; il **délègue** l'install et l'upgrade au binaire `npx roadmapped init` / `npx roadmapped upgrade` sous le capot. Le skill décide *quand* et *pourquoi* installer ; le bin fait la **plomberie** (copie de fichiers, config, hook, MCP). Nom du paquet et du futur repo GitHub : **Roadmapped** (deux p) ; rétrocompat en lecture de `roadmaped.config.json` (un p), déjà en place dans `loadPaths()`.

Ce que la spec ne rouvre pas : le fait d'avoir un paquet npm + un bin + un skill (tranché). Le *contenu* de l'init (questionnaire, migration des artefacts, CLAUDE.md) appartient à **#121** — ici on ne spécifie que le **mécanisme**.

## Conception

### 1. Le paquet npm `roadmapped` — ce qu'il embarque

Retirer `"private": true`, ajouter `bin`, `files`, `engines` à `package.json` :

```jsonc
{
  "name": "roadmapped",
  "bin": { "roadmapped": "bin/roadmapped.mjs" },
  "files": ["bin", "scripts", "src", "skills", "index.html", "vite.config.ts", "tsconfig.json"],
  "engines": { "node": ">=22.18" }
}
```

Contenu publié (le `files` ci-dessus) :

- **`bin/roadmapped.mjs`** (nouveau) — le dispatcher, seul point d'entrée du paquet (voir §2).
- **`scripts/`** — `task.mjs` (CLI), `mcp-server.mjs` (serveur MCP), `githooks/pre-commit` (le guard).
- **`src/`** — la source du dashboard ET `src/lib/` (le noyau `taskWrites`/`roadmap`/`render`/`paths`/`tasks`/`validate` importé par le CLI, le MCP et le plugin Vite). L'API d'écriture EST un plugin Vite (`configureServer`, cf. spec V2) : lancer le dashboard = lancer Vite en dev sur la source, d'où la présence de `src/`, `index.html`, `vite.config.ts`.
- **`skills/roadmapped/`** — la charge utile copiée dans le repo hôte à l'init (SKILL.md + `references/`).

Node ≥ 22.18 : le CLI et le MCP importent des `.ts` via le strip-types natif (`import … from '../src/lib/paths.ts'` dans `mcp-server.mjs`) — pas d'étape de build à la publication, on ship les `.ts` bruts, cohérent avec l'existant (`npm run dev`/`task` reposent déjà dessus). Contrepartie en Risques.

### 2. `bin/roadmapped.mjs` — le dispatcher (unifie CLI + install)

Un seul binaire, trois familles de verbes :

- `roadmapped init` → scaffolding dans le repo hôte (§3).
- `roadmapped upgrade` → mise à jour non destructive (§4).
- `roadmapped dashboard` → lance Vite (dev) depuis le paquet, servant l'API d'écriture, chdir'é sur le repo hôte.
- **tout autre verbe** (`next`, `take`, `done`, `add`, `validate`, `guard`, …) → **proxy transparent** vers `scripts/task.mjs`, résolu à l'intérieur du paquet. C'est ce qui rend le CLI **portable** : `npx roadmapped done 42` marche dans n'importe quel repo, sans chemin en dur.

Conséquence pour le skill : partout où il disait `node scripts/task.mjs <cmd>`, il dit désormais **`roadmapped <cmd>`** (résolu via `node_modules/.bin/` dans le repo hôte, et aussi dans ce dépôt une fois le paquet lié). Le serveur MCP reste la surface préférée de l'agent ; `roadmapped <cmd>` est la forme portable de secours. Dans ce dépôt (self-host), `node scripts/task.mjs` et `npm run task` continuent de marcher inchangés.

### 3. `npx roadmapped init` — plomberie, jamais de contenu

Emplacement : **pas de sous-dossier `roadmapped/`.** Le code de l'outil vit dans `node_modules/roadmapped/` (npm s'en charge) ; les artefacts scaffoldés sont posés **à la racine du repo hôte**. `init`, dans l'ordre, idempotent :

1. **Détecter la racine hôte** (racine git, ou cwd) et l'installer comme dépendance : ajoute `roadmapped` en **devDependency** du `package.json` hôte (le MCP et le hook exigent une présence locale dans `node_modules/`, pas un `npx` réseau à chaque commit — cf. Risques).
2. **`roadmapped.config.json`** à la racine hôte (`{ "tasksDir": "docs/tasks", "docsDir": "docs" }`) — **créé seulement s'il est absent** ; si `roadmaped.config.json` (un p) existe, on le respecte (rétrocompat).
3. **Squelette `docs/tasks/`** : `_meta.yaml` (`nextId: 1`) + les 8 stages canoniques vides (`01-idea` → `08-mature`, chacun `_section.yaml` avec `title`/`note` canoniques). C'est de la plomberie déterministe (aucun choix), donc à la charge du bin ; `validate` passe immédiatement sur un squelette vide. Le **remplissage** (questionnaire, migration, premières tâches) reste au skill / à #121. **Ne touche jamais un `docs/tasks/` déjà peuplé** (si `_meta.yaml` existe, l'étape est sautée).
4. **Copier le skill** `skills/roadmapped/` → **`.claude/skills/roadmapped/`** (deux p) du repo hôte.
5. **Fusionner l'entrée MCP** dans `.mcp.json` hôte : serveur `roadmapped` → `node node_modules/roadmapped/scripts/mcp-server.mjs` (merge, ne réécrit pas les autres serveurs).
6. **Installer le hook guard** : écrire un `pre-commit` qui appelle `roadmapped guard`, en respectant un gestionnaire de hooks déjà présent chez l'hôte (détecter husky/lefthook/`core.hooksPath` occupé → proposer, ne pas écraser — cf. Risques).

### 4. `npx roadmapped upgrade` — additive, jamais destructive

Frontière nette entre **fichiers de l'outil** (regénérables, écrasables) et **données de l'utilisateur** (intouchables) :

- Écrasés à chaque upgrade : `.claude/skills/roadmapped/` (le skill est *tool-owned*), l'entrée `roadmapped` de `.mcp.json`, le `pre-commit` guard. Bump de la devDependency `roadmapped`.
- **Jamais touchés** : `docs/tasks/**` (la source de vérité), `roadmapped.config.json` (config utilisateur). Les nouveaux champs de schéma (`dependsOn`, `milestone`, `team`…) sont **optionnels** dans `validate.ts`/`taskWrites.ts` : la rétrocompat des tâches se fait par lecture tolérante, pas par réécriture des YAML à l'upgrade.

`upgrade` = re-jouer les étapes 4-6 de `init` + bump de version. Idempotent : le relancer ne change rien si tout est à jour.

### 5. Résolution de racine hôte (le correctif structurant)

Dissocier dans `src/lib/paths.ts` **racine du paquet** (où vit le code) et **racine du repo hôte** (où vivent config + `docs/tasks/`). `loadPaths()` doit résoudre la config et `tasksDir`/`docsDir` **depuis le repo hôte** : cwd, ou variable `ROADMAPPED_ROOT`, ou plus proche ancêtre contenant `roadmapped.config.json`/`.git`. Le défaut `tasksDir: '../docs/tasks'` (hérité de l'ancien modèle « dashboard en sous-dossier ») devient `docs/tasks`/`docs` relatif à la racine hôte. `resolvePaths(root, config)` (fonction pure, déjà testée) reste inchangée ; seul son argument `root` change de source. Nettoyer au passage le nom et le commentaire `dashboardRoot()`/« ce fichier vit dans dashboard/src/lib/ » (dette de renommage).

## Découpage en tâches d'implémentation (chaînables par `dependsOn`)

1. **Résolution de racine hôte** — dissocier racine-paquet / racine-hôte dans `paths.ts` (`loadPaths` lit la config depuis le repo hôte : cwd/`ROADMAPPED_ROOT`/ancêtre), défauts `docs/tasks`/`docs`, nettoyage `dashboardRoot`. Tests sur `resolvePaths` + un faux `node_modules/roadmapped`. *(prérequis de tout le reste côté hôte)*
2. **Packaging du paquet** — `package.json` : retirer `private`, ajouter `bin`/`files`/`engines` ; `npm pack`/`publish --dry-run` vérifie le contenu exact. *(dependsOn: 1)*
3. **`bin/roadmapped.mjs` dispatcher** — `init`/`upgrade`/`dashboard` + proxy de tous les autres verbes vers `scripts/task.mjs`. *(dependsOn: 2)*
4. **`roadmapped init`** — scaffolding §3 (config si absente, squelette 8 stages, copie skill → `.claude/skills/roadmapped/`, merge `.mcp.json`, hook guard), idempotent, ne touche jamais un `docs/tasks/` peuplé. *(dependsOn: 3)*
5. **`roadmapped upgrade`** — re-copie skill + `.mcp.json` + hook, bump version, jamais `docs/tasks/` ni la config. *(dependsOn: 4)*
6. **`roadmapped dashboard`** — lance Vite (dev, API d'écriture) depuis le paquet sur le repo hôte. *(dependsOn: 1)*
7. **Unifier les chemins CLI du skill** — `roadmapped <cmd>` dans `SKILL.md`/`setup.md`/`delegation.md` ; `setup.md` assume que `init` a posé la plomberie (squelette + config). Recouvre #14. *(dependsOn: 3)*
8. **Validation bout-en-bout dans un repo hôte vierge** — `init` → `dashboard` → cycle CLI/MCP (`add`/`next`/`start`/`done`/`archive`) → commit (guard) → `upgrade`, aucune instruction fausse. Recouvre #123/#14. *(dependsOn: 4, 5, 6, 7)*

## Risques / points ouverts

- **Node ≥ 22.18 en distribution (strip-types).** On ship des `.ts` bruts importés par les `.mjs`. Un hôte en Node < 22.18 casse au premier `roadmapped <cmd>`. Alternative : builder `src/lib/*.ts` → `.js` à la publication. *Recommandation : `engines: ">=22.18"` + fail clair si Node trop vieux, pas de build (cohérent avec l'existant). À confirmer.*
- **devDependency locale vs `npx` pur.** Le hook `pre-commit` et le serveur MCP exigent une présence dans `node_modules/` (pas de round-trip réseau à chaque commit). D'où l'install en devDependency. Confirmer que l'install locale est acceptable plutôt qu'un `npx roadmapped@latest` à la demande.
- **Hook guard vs hooks existants de l'hôte.** Un repo hôte peut déjà avoir husky/lefthook ou un `core.hooksPath` occupé. `init` doit détecter et proposer une intégration, jamais clobber. Modalité exacte à trancher (chaîner le guard ? refuser et documenter ?).
- **Skill *tool-owned* écrasé à l'upgrade.** Si un utilisateur édite `.claude/skills/roadmapped/`, `upgrade` l'écrase. Assumé (le skill appartient à l'outil) ou marqueur « ne pas éditer » en tête de fichier ?
- **Frontière `init` (plomberie) vs #121 (init riche).** Ici : `init` crée le squelette 8 stages VIDE + la config ; le skill/#121 remplit (questionnaire, migration, CLAUDE.md). Confirmer que le squelette appartient bien au bin et non au skill (setup.md serait à réécrire en conséquence — ticket 7).
- **Poids du paquet (Vite en dependency).** Le dashboard tourne en Vite dev (l'API d'écriture est un plugin `configureServer`), donc Vite + la source sont des `dependencies`, pas des `devDependencies`. Paquet plus lourd qu'un CLI seul. Acceptable pour un outil local, à acter.
