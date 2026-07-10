# Dashboard compilé — install allégée (option A : on livre le build)

**Date** : 2026-07-11 · **Statut** : APPROUVÉE (décision Rémi : « on livre le dashboard compilé »)
**Touche** : `package.json` (deps/scripts/files), `.gitignore`, `src/server/api.ts` (extraction),
un nouveau `src/server/serve.ts`, `src/lib/roadmap.ts` (scission dagre → nouveau
`src/lib/graphLayout.ts`), `bin/roadmapped.mjs` (verbe `dashboard`),
`scripts/githooks/pre-commit`, `.github/workflows/ci.yml`, `dist/` (commité).
**Ne touche PAS** : `src/lib/taskWrites.ts` (verrou `.lock` inchangé), `scripts/task.mjs`,
`scripts/mcp-server.mjs`, `vite.demo.config.ts` / `dist-demo` (build démo du site),
le contrat des routes `/api/*`, le protocole SSE, les composants React.
**Ticket** : #200 (« install trop lourde — bloquant adoption »).
**Prédécesseurs** : `2026-07-08-distribution.md` (GitHub-only), `2026-07-09-multi-repo-dashboard.md`
(sonde d'idempotence #204), fix #202 (écran blanc host-install).

## Problème

Roadmapped s'installe en dépendance git (`github:5e1y/roadmapped`, jamais npm) dans le
repo de l'utilisateur. `roadmapped dashboard` lance **Vite en mode dev** : tout le stack
front (react, react-dom, vite, @tailwindcss, @base-ui ~19 Mo, @dagrejs, trinil-react,
marked) est donc en `dependencies` et atterrit dans **chaque** repo hôte — ~109 Mo,
même pour qui ne veut que le CLI + MCP. Mesures sur le clone actuel : @base-ui 19 Mo,
react-dom 4,4 Mo, amaro 3,7 Mo, MCP SDK 5,8 Mo (+ sa pile express ~20 Mo), vite 3,2 Mo…

**Décision (Rémi, figée)** : on sépare l'« atelier de build » (notre clone de dev, Vite)
du « produit servi » (l'hôte). `vite build` produit `dist/` (1,4 Mo actuellement,
HTML + JS/CSS tree-shakés, hashés) ; le stack front passe en `devDependencies` —
npm n'installe **pas** les devDependencies d'une dépendance git — ; et
`roadmapped dashboard` démarre un **petit serveur Node autonome** (zéro dépendance,
`node:http`) qui sert `dist/` + monte l'API existante + ouvre le navigateur.

**Cible** : fermeture runtime mesurée sur le lockfile actuel = **~31 Mo / 94 paquets**
(js-yaml 1 Mo, amaro 3,7 Mo, @modelcontextprotocol/sdk 5,8 Mo + sa pile express).
Install hôte totale visée : **≤ 40 Mo** (paquet ~2,5 Mo dont dist 1,4 Mo + deps ~31 Mo),
contre ~109 Mo aujourd'hui — **−65 %**, et une install nettement plus rapide (cf. §4,
suppression du cycle `prepare`).

---

## 1. Classement des dépendances

Vérifié par traçage des imports réels de `bin/`, `scripts/` (task, mcp-server, install,
migrate, register-ts), `src/lib/` et `src/server/` :

### `dependencies` (runtime hôte) — 3 paquets, liste EXACTE

| Paquet | Pourquoi runtime |
|---|---|
| `js-yaml` | `src/lib/tasks.ts`, `validate.ts`, `taskWrites.ts`, `scripts/install.mjs`, `scripts/migrate.mjs` — cœur du modèle de données. |
| `amaro` | `scripts/register-ts.mjs` : loader strip-types pour importer nos `.ts` sous `node_modules` (Node refuse d'y stripper nativement). Requis par le CLI, le MCP **et** le nouveau serveur. **Runtime**, pas build. |
| `@modelcontextprotocol/sdk` | `scripts/mcp-server.mjs` (Server, StdioServerTransport, schemas). C'est le poids dominant (~26 Mo avec sa pile express transitive) — hors scope ici, ticket futur possible. |

### `devDependencies` (atelier de build + tests) — tout le reste

`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`,
`@base-ui/react`, `@dagrejs/dagre`, `trinil-react`, **`marked`**, plus les devDeps
actuelles (typescript, vitest, jsdom, @testing-library/*, @types/*).

### Cas tranchés explicitement

- **`marked`** → devDependency. Unique import : `src/components/Markdown.tsx` (client).
  Le serveur ne rend jamais de markdown : `/api/docs/content` renvoie le contenu **brut**,
  le rendu est côté client, donc bundlé dans `dist/`. Rien à faire côté serveur.
- **`js-yaml`** → dependency (cf. tableau — tout le CRUD tâches en dépend).
- **`@modelcontextprotocol/sdk`** → dependency (le MCP est un usage premier du paquet).
- **`amaro`** → dependency (loader **runtime** : sans lui, `roadmapped done 42` casse).
- **`@dagrejs/dagre`** → devDependency, **à condition de la scission §1bis** : aujourd'hui
  `scripts/task.mjs`, `scripts/mcp-server.mjs` et `src/server/api.ts` importent
  `src/lib/roadmap.ts` (computeAvailability, nextQueue, attachTemperatures…) dont la
  **ligne 1** importe dagre. Sans scission, dagre resterait tiré au runtime.

### 1bis. Scission `roadmap.ts` (préalable obligatoire)

Le seul consommateur de dagre dans `roadmap.ts` est `graphLayout()` (vue Graphe,
lignes ~81-135 + ses types `GraphLayout`, positions/polylignes). Extraction :

- **Nouveau** `src/lib/graphLayout.ts` : `graphLayout()` + ses types + l'import dagre.
  Importé UNIQUEMENT par le composant client de la vue Graphe (mettre à jour son import).
- `src/lib/roadmap.ts` : perd l'import dagre ligne 1 ; garde `computeAvailability`,
  `activeTasks`, `nextQueue`, `globalProgress`, `epicProgress`, `allEpics`,
  `attachTemperatures`, `temperature` (les tests `temperature.test.ts` et
  `roadmap.test.ts` continuent d'importer `./roadmap` sans changement).
- Garde-fou : `grep -rn "dagre" src/lib src/server scripts bin` ne doit plus matcher
  que `graphLayout.ts` (et les tests du graphe s'il y en a).

### `package.json` cible

```jsonc
{
  "files": [
    "bin", "scripts", "src", "skills",
    "dist",                        // ← NOUVEAU : le produit servi
    // supprimés : "index.html", "vite.config.ts", "tsconfig.json"
    //   (atelier de dev uniquement — l'hôte ne lance plus jamais Vite)
    "!**/*.test.ts", "!**/*.test.tsx", "!**/*.test.mjs",
    "!src/lib/stageFixtures.ts",
    "!src/demo"                    // fixtures démo : build:demo tourne dans le clone de dev
  ],
  "scripts": {
    "dev": "vite",
    "predev": "git config core.hooksPath scripts/githooks || true",  // ← remplace prepare (cf. §4)
    "build": "tsc -b && vite build",
    "build:demo": "tsc -b && vite build --config vite.demo.config.ts",
    "test": "vitest run",
    "validate": "node --experimental-strip-types scripts/task.mjs validate",
    "task": "node --experimental-strip-types scripts/task.mjs"
    // "prepare" SUPPRIMÉ — voir §4, c'est une pièce maîtresse de l'allègement
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "amaro": "^1.1.10",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@base-ui/react": "^1.6.0",
    "@dagrejs/dagre": "^3.0.0",
    "@tailwindcss/vite": "^4.3.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.20.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "jsdom": "^25.0.0",
    "marked": "18.0.5",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "tailwindcss": "^4.3.0",
    "trinil-react": "^1.3.9",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^2.1.9"
  }
}
```

Le reste (`bin`, `engines >=22.18`, métadonnées) est inchangé. `src/` reste publié en
entier hors démo/tests : le CLI, le MCP et le serveur importent `src/lib` + `src/server`
en `.ts` via le loader amaro (788 Ko, dont ~450 Ko de front inutile au runtime — bruit
accepté, la simplicité de « src entier » prime).

---

## 2. Le serveur autonome — `src/server/serve.ts`

Nouveau fichier **TypeScript** (cohérent avec le reste : chargé via
`scripts/register-ts.mjs`, déjà enregistré par le bin). **Zéro nouvelle dépendance** :
`node:http` nu + un mini-routeur statique maison (~40 lignes). Pas de `connect`, pas de
`sirv`, pas d'express — l'API actuelle est déjà écrite contre `(req, res, next)` nus,
la pile Connect de Vite n'apportait que le chaînage.

### 2a. Extraction de l'API hors de Vite (un seul code, deux hôtes)

`src/server/api.ts` est déjà du Node pur monté en middleware ; seul l'emballage est
Vite. Refactor :

```ts
// api.ts — NOUVELLE forme
export function createApiMiddleware(paths: RoadmappedPaths):
  (req: IncomingMessage, res: ServerResponse, next: () => void) => void
```

`createApiMiddleware` absorbe TOUT le corps actuel de `configureServer` :

1. `ensureNotesSetup(paths.docsDir, paths.root)` — ⚠️ changer `process.cwd()` en
   `paths.root` : avec Vite le cwd était forcé au repo hôte par le spawn ; en
   in-process (§5) le cwd est là où l'utilisateur a tapé la commande (potentiellement
   un sous-dossier). `paths.root` est équivalent dans l'ancien flux et correct dans
   le nouveau.
2. Le check `checkUpdate()` async au boot (#211), closure `updateStatus` — inchangé.
3. Le watcher `fs.watch(dir, {recursive:true})` sur tasksDir/docsDir + fallback Linux
   sous-dossiers — inchangé, copié tel quel.
4. Le `Set<ServerResponse>` de clients SSE, le debounce 80 ms, `broadcast` — inchangés.
5. Le handler `(req, res, next)` : route `/api/events` (SSE, keep-alive 25 s),
   `readJsonBody`, `routeApi`/`runAction`, injection `update`/`updateRepo` sur getTree —
   inchangé au byte près, seule la signature `Connect.IncomingMessage` devient
   `IncomingMessage` (`node:http`).

Le plugin Vite devient une coquille :

```ts
export function roadmappedApi(): Plugin {
  return {
    name: 'roadmapped-api',
    configureServer(server) { server.middlewares.use(createApiMiddleware(loadPaths())) },
  }
}
```

⚠️ Les imports Vite de `api.ts` (`Plugin`, `Connect`) sont **type-only** (`import type`) :
amaro/strip-types les efface, le serveur prod n'essaie donc jamais de résoudre `vite`.
Vérifier qu'aucun import **valeur** de vite ne se glisse dans `api.ts` (c'est le cas
aujourd'hui). `routeApi`/`runAction` restent exportés (tests `api.test.ts` inchangés).

`npm run dev` (notre atelier) garde Vite + HMR + le même middleware — un seul code
source pour l'API, deux hôtes.

### 2b. `serve.ts` — comportement, ligne par ligne

```ts
export async function startDashboard(opts: { open: boolean; port?: number }): Promise<void>
```

1. **Ancrage** : `const paths = loadPaths()` — honore `ROADMAPPED_ROOT` (posé par le
   bin avant l'import, cf. §5) puis `findHostRoot()`. Rien de neuf.
2. **Localiser le build** : `distDir = join(packageRoot(), 'dist')`. Si
   `dist/index.html` absent → message clair et `exit 1` :
   « dashboard build manquant (dist/). Install cassée — réinstallez roadmapped ; ou
   clone de dev — utilisez `npm run dev` (ou `npm run build`). »
3. **Middleware API** : `const api = createApiMiddleware(paths)`.
4. **Serveur** :
   ```ts
   const server = createServer((req, res) => api(req, res, () => serveStatic(req, res)))
   ```
   L'API passe d'abord (elle `next()` tout ce qui n'est pas `/api/*`), le statique ramasse
   le reste — même ordre de priorité qu'en dev.
5. **`serveStatic`** (le remplaçant des ~40 lignes que Vite offrait gratis) :
   - Méthode ≠ GET/HEAD → 405.
   - `pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)` ;
     `/` → `/index.html`.
   - **Anti-traversal** : `resolved = resolve(distDir, '.' + pathname)` ; si
     `resolved !== distDir && !resolved.startsWith(distDir + sep)` → 403. (Même
     discipline que `unsafeDocPath`.)
   - Fichier existant → `readFileSync`/stream + `Content-Type` par extension :
     `.html text/html; charset=utf-8`, `.js text/javascript`, `.css text/css`,
     `.svg image/svg+xml`, `.json application/json`, `.png image/png`,
     `.ico image/x-icon`, `.woff2 font/woff2`, `.map application/json`,
     défaut `application/octet-stream`.
   - **Cache** : sous `/assets/` (noms hashés par Rollup) →
     `Cache-Control: public, max-age=31536000, immutable` ; tout le reste (dont
     `index.html`) → `no-cache` (un upgrade du paquet doit être vu au reload).
   - **Fallback SPA** : introuvable ET le pathname ne contient pas de `.` →
     servir `dist/index.html` (200, no-cache). Introuvable avec extension → 404.
6. **Port auto-incrément** (ce que Vite offrait gratis, réimplémenté) :
   ```
   listenWithRetry(server, start = opts.port ?? 5173, max = start + 10):
     server.once('error', (e) =>
       e.code === 'EADDRINUSE' && port < max ? retry(port + 1)
       : fatal(e))
     server.listen(port, 'localhost')
   ```
   Borne **5173-5183** (11 ports). Au-delà → erreur explicite « 11 dashboards déjà
   ouverts ? Fermez-en un ou passez --port. ». Articulation avec la sonde
   d'idempotence : cf. §5 — la sonde du bin traite « MÊME repo déjà servi » (no-op) ;
   l'auto-incrément traite « port pris par un AUTRE repo/process » (on coexiste).
7. **Annonce + navigateur** :
   `console.log('roadmapped dashboard: http://localhost:PORT/  (' + basename(paths.root) + ')')`
   puis si `opts.open` : spawn détaché de `open <url>` (darwin) /
   `cmd /c start "" <url>` (win32) / `xdg-open <url>` (linux), erreurs avalées
   (l'URL est affichée de toute façon). C'était le `--open` de Vite.
8. Le process reste vivant par le handle du serveur ; Ctrl-C termine. Pas de gestion
   de signaux exotique.

**Ce qui disparaît avec Vite et pourquoi c'est correct** (les réglages de
`vite.config.ts`) :
- `server.fs.allow` (tasksDir/docsDir hors racine) : protection du serveur de FICHIERS
  de Vite. Notre statique ne sert QUE `dist/` ; les données passent par `/api/*` comme
  avant. Rien à répliquer.
- `server.watch.ignored` (anti full-reload sur écriture YAML) : c'était le watcher HMR
  de Vite. Le serveur prod n'a PAS de HMR — notre seul watcher est celui de l'API
  (SSE), qui est précisément le comportement voulu. Le bug « le panneau se ferme à la
  sauvegarde » ne peut structurellement plus se produire en prod.
- `optimizeDeps.include` / `resolve.dedupe` (#202) : cf. §6.
- `root: packageRoot()` : remplacé par `distDir = packageRoot() + '/dist'`.

---

## 3. Le build

- **Commande** : `npm run build` (`tsc -b && vite build`) — existe déjà, produit déjà
  `dist/` (1,4 Mo : `index.html` + `assets/*.js|css` hashés).
- **`base`** : défaut `'/'` — correct car notre serveur sert `dist/` à la racine du
  port, toujours. (Le `base: './'` de `vite.demo.config.ts` reste propre au bundle
  démo copié sous `/demo/` du site — ne pas confondre, ne pas toucher.)
- **`build.outDir`** : `dist` (défaut), `emptyOutDir` défaut (true, root = paquet).
- **Commité / ignoré** : retirer la ligne `dist/` de `.gitignore` (garder `dist-demo/`
  ignoré) et **commiter `dist/`**. `files` publie `dist` (§1).

### Choix (a) dist commité vs (b) build à l'install — tranché : (a)

- (b) `prepare: npm run build` est le mécanisme standard npm pour les deps git… mais
  npm installe alors **dependencies + devDependencies dans son cache** et exécute le
  build **à chaque machine/version installée** : on re-télécharge la toolchain (~150 Mo
  de cache), l'install passe de secondes à minutes, et elle casse si le build casse
  chez l'utilisateur (versions Node, réseau). C'est exactement le symptôme de #200
  déplacé dans le cache.
- (a) coûte : des artefacts en git (~1,4 Mo/rebuild, diffs illisibles) et une
  **discipline de rebuild**. Le premier est un coût accepté (repo outil, pas lib) ;
  le second est LE piège — résolu par le garde-fou triple ci-dessous.
- Rémi a dit « on livre le build » → **(a)**, assumé.

### Garde-fou anti-`dist` périmé (triple, du plus autoritaire au plus confortable)

1. **CI = source de vérité** (bloquant). La CI fait déjà `npm ci && npm run build` ;
   ajouter juste après :
   ```yaml
   - run: test -z "$(git status --porcelain dist)" || { git status --porcelain dist; echo "dist/ périmé — lancez npm run build et commitez dist/"; exit 1; }
   ```
   (`git status --porcelain` et non `git diff --exit-code` : il attrape AUSSI les
   fichiers hashés nouveaux/supprimés, pas seulement les modifiés.) Déterminisme :
   `npm ci` fige les versions via le lockfile ; les noms hashés Rollup sont
   fonction du contenu — même entrée, même sortie. `tsconfig.tsbuildinfo` est déjà
   gitignoré et n'entre pas dans dist.
2. **Pre-commit = confort** (auto-réparant). Étendre `scripts/githooks/pre-commit`
   (après le guard #100 existant) : si un fichier stagé matche le **périmètre front**
   — `index.html`, `vite.config.ts`, `package-lock.json`, `src/**` HORS `src/server/**`
   (le plugin/serveur n'entre pas dans le bundle ; `src/lib` si : partagé client/serveur)
   — alors `npm run build && git add dist`. Échappatoires : `git commit --no-verify`
   (déjà documentée) ou `SKIP_DIST=1`. Coût : quelques secondes sur les commits front
   uniquement ; la CI rattrape de toute façon un contournement.
3. **Runtime = filet** : le check `dist/index.html` de `serve.ts` (§2b.2) transforme
   une install incohérente en message actionnable au lieu d'une page blanche.

⚠️ Conséquence du retrait de `prepare` (§4) : les hooks ne sont plus câblés à
l'install du clone de dev → `predev` les câble au premier `npm run dev` (le flux
naturel d'un contributeur front). La CI reste le verrou dur. Mettre à jour
CONTRIBUTING.md (une ligne : « les hooks se câblent via npm run dev, ou manuellement
`git config core.hooksPath scripts/githooks` »).

---

## 4. Suppression de `prepare` — pièce maîtresse, pas un détail

Règle npm pour les dépendances **git** : si le paquet a un script `prepare`, npm
installe ses dependencies **ET devDependencies** dans un répertoire de cache, exécute
`prepare`, PUIS packe selon `files`. Le `prepare` actuel
(`git config core.hooksPath …`) — pourtant anodin — déclenche donc ce cycle complet à
chaque install hôte. **Garder n'importe quel `prepare` ruinerait la moitié du gain**
(téléchargement de la toolchain au pack, install lente), même avec le classement §1
parfait. Donc : `prepare` supprimé, remplacé par `predev` (§1, §3). À vérifier
empiriquement au premier test d'install (§7a) : le temps d'install doit chuter
nettement.

---

## 5. `bin/roadmapped.mjs` — verbe `dashboard`

**Préservé à l'identique** : check Node ≥ 22.18 (en tête, avant tout import .ts),
résolution `hostRoot` (`ROADMAPPED_ROOT` sinon `findHostRoot()`), `notifyIfOutdated`
(#207), parsing `--open`/`--no-open` (open par défaut), la sonde d'idempotence #204.

**Changé** :
- La résolution du binaire vite (`createRequire → vite/package.json → bin`) et le
  `spawnSync(vite --config …)` **disparaissent**, ainsi que l'erreur « vite not
  found ». À la place, **import in-process** (le loader amaro est déjà enregistré
  par le bin, pas de spawn nécessaire) :
  ```js
  process.env.ROADMAPPED_ROOT = hostRoot           // AVANT l'import : loadPaths() le lit
  const { startDashboard } = await importPkg('src/server/serve.ts')
  await startDashboard({ open: !noOpen, port: portArg })
  ```
  (`--port N` : accepté et transmis — Vite l'acceptait, on ne régresse pas ; défaut 5173.)
- **Sonde étendue en balayage** : aujourd'hui elle ne sonde que 5173 (le ponytail
  documenté dans le bin : un repo migré sur 5174 n'est pas détecté → doublon possible).
  La plage étant désormais formalisée (5173-5183, §2b.6), la sonde balaye **toute la
  plage** : fetch `/api/tree` en parallèle sur les 11 ports, timeout 500 ms chacun,
  même comparaison `body.hostRoot === hostRoot` :
  - un port répond avec NOTRE hostRoot → « already open → http://localhost:PORT/ »,
    exit 0 (no-op, garanti même si le dashboard vit sur 5174) ;
  - des ports répondent avec d'AUTRES hostRoot (ou pas la bonne forme) → on démarre,
    l'auto-incrément de `serve.ts` trouvera le premier port libre ;
  - rien ne répond → on démarre sur 5173.
  Avec `--port` explicite : sonde ce seul port.
- Texte d'usage : « launch the dashboard (Vite dev + write API) » → « launch the
  dashboard (local server + write API) ».

**Rien à changer** dans `init/upgrade/migrate/help/proxy task.mjs`, ni dans le verrou
d'écriture (`docs/tasks/.lock`, `taskWrites.ts`) — il est sous l'API, indifférent à
l'hôte HTTP.

---

## 6. Compatibilité host-install (#202) — le bug disparaît structurellement

Le fix #202 (`optimizeDeps.include` du stack React + `resolve.dedupe`) traitait un
problème **du mode dev** : root = le paquet mais résolution depuis les node_modules de
l'**hôte** → selon le hoisting de l'hôte (ex. sa propre copie de
use-sync-external-store), Vite servait du CJS brut non pré-bundlé → React ne montait
jamais (écran blanc avec index.html en 200).

En prod, le bundle est produit **au build, dans NOTRE clone de dev**, avec NOTRE
lockfile : une seule copie de React, résolution figée, tout est inliné dans
`dist/assets/*.js`. Les node_modules de l'hôte ne participent **plus jamais** à la
résolution du front — l'hôte n'a d'ailleurs plus React du tout. La classe entière de
bugs « ça dépend de ce que l'hôte hoiste » disparaît, pas seulement l'instance #202.
**C'est un argument fort pour l'option A**, à mentionner dans le commit.

Le bloc `optimizeDeps`/`dedupe` reste dans `vite.config.ts` avec son commentaire :
il ne coûte rien et documente le piège pour `npm run dev` (même si, l'hôte ne lançant
plus jamais Vite, le scénario ne concerne plus que notre atelier).

---

## 7. Critères de fini

### a) Install allégée (le but de #200)
- Dans un repo vierge : `npm install github:5e1y/roadmapped` →
  `du -sh node_modules` ≤ **40 Mo** (vs ~109 Mo avant), **aucun** react/vite/@base-ui/
  @dagrejs/trinil/marked/tailwind tiré par roadmapped (vérif :
  `npm why react` → rien, ou seulement les deps propres de l'hôte).
- `node_modules/roadmapped/dist/index.html` présent ; `index.html`, `vite.config.ts`,
  `src/demo/` absents du paquet installé.
- Temps d'install nettement réduit (plus de cycle prepare+devDeps au pack — §4).

### b) Le dashboard rend identiquement au dev
- `roadmapped dashboard` : le navigateur s'ouvre (`--no-open` respecté), l'UI est
  identique à `npm run dev` — les 4 vues (Backlog/Roadmap/Docs/Notepad), la vue Graphe
  (dagre bundlé), le rendu markdown (marked bundlé), le dark mode, le header avec le
  nom du repo.
- Reload navigateur sur une vue profonde → 200 (fallback SPA), pas de 404.

### c) Les 4 garanties re-testées
1. **Multi-repos** : dashboard repo A (5173) puis dashboard repo B → B démarre sur
   5174, les deux coexistent, chaque header montre son repo. Relancer `dashboard`
   dans A **et** dans B → « already open » avec la bonne URL les deux fois (y compris
   B sur 5174 — la sonde balaye).
2. **Écritures concurrentes** : 2 agents qui écrivent en même temps (CLI/MCP/UI) →
   verrou `.lock` respecté, zéro tâche corrompue (le code n'a pas bougé ; test de
   non-régression).
3. **Live** : modifier un YAML de tâche à la main / par agent → event SSE → l'UI se
   met à jour **sans reload** ; sauvegarder depuis le panneau ne ferme PAS le panneau
   (pas de full-reload — pas de HMR en prod, §2b).
4. **Live multi-dashboards** : la modif du point 3 apparaît sur les dashboards de
   plusieurs repos ouverts simultanément (chacun ne voyant que SES données).

### d) Garde-fous et non-régressions
- CI verte avec le check dist-frais ; un commit qui modifie `src/components/*` sans
  rebuilder dist → **CI rouge** avec le message actionnable.
- Commit local touchant le périmètre front → le hook rebuild + stage `dist/` seul.
- `npm run dev` (atelier) inchangé : HMR, API, `fs.allow`, anti-full-reload.
- CLI (`roadmapped done 42`…), MCP, `init`/`upgrade`/`migrate`, guard #100 : inchangés.
- `npm test` vert (dont `api.test.ts` sur `routeApi`/`runAction`, et les tests
  `roadmap`/`temperature` après la scission §1bis).
- Clone de dev sans build : `roadmapped dashboard` → message « dist manquant » (§2b.2),
  pas d'écran blanc ni de stacktrace.
