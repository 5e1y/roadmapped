# Audit de performance — juillet 2026

Contexte : issue d'un user sur PC 8 Go RAM + HDD lent (« fuite mémoire ou soucis CPU »).
Méthode : lecture de code ligne à ligne + mesures locales non destructives (machine d'audit :
Apple Silicon, cache disque chaud — les chiffres « cible » sont extrapolés ×3–5 CPU et
avec pénalité de seek HDD ~5–10 ms/fichier à froid).

**Verdict d'entrée : la fuite mémoire n'est PAS démontrée.** Aucune structure serveur ne
croît sans borne (SSE nettoyé, ring buffer borné, pending vidé). Ce que le user perçoit
est très probablement du **churn I/O + CPU répété** : chaque requête `/api/tree` et chaque
tick SSE relisent et re-parsent l'intégralité de `docs/tasks/` — trois fois.

Données de terrain (mesurées sur ce repo) :

| Donnée | Valeur |
|---|---|
| Fichiers YAML sous `docs/tasks/` | **351** (341 tâches + `_section`/`_meta`), 1,4 Mo |
| `treeWithErrors()` (1 appel) | **40–60 ms** warm ici → ~150–300 ms warm sur la cible, **2–4 s à froid HDD** (351 seeks) |
| Payload JSON `/api/tree` | **634 Ko** (stringify serveur + parse client à chaque resync) |
| Bundle | `dist/assets/index-*.js` : **1,4 Mo** (316 Ko gzip), CSS 36 Ko — un seul chunk |
| `graphify-out/graph.json` | **2,5 Mo**, 2 420 nœuds / 4 062 arêtes (le « 869 » du ticket a ×2,8) |
| `.roadmapped-usage.jsonl` | 15,8 Ko / 247 lignes (~64 o/entrée) |

---

## 1. Budget cible — ce que « ne rien peser » veut dire concrètement

- **Idle = zéro** : 0 tick CPU, 0 lecture disque, 0 allocation quand rien ne change.
  *(État actuel : TENU — voir zones saines.)*
- **1 écriture = 1 lecture** : une mutation ou un signal SSE ne devrait provoquer qu'UNE
  passe de lecture/parse du corpus. *(État actuel : ~4 passes, ~1 750 parses YAML — §2.1.)*
- **Le disque n'est relu que si mtime a bougé** : cache invalidé par le watcher déjà en place.
- **Bundle initial ≤ 500 Ko brut** (le warning Vite existant) : le graphe (dagre) et la KB
  sont des vues secondaires → chargement différé.
- **Serveur < 100 Mo RSS, stable sur des jours** (l'auto-shutdown #330 borne déjà la durée de vie).

---

## 2. Findings, par impact décroissant

### 2.1 — CRITIQUE (HDD/CPU) : `/api/tree` relit 351 fichiers et parse le YAML **3×**, à chaque appel, sans cache

- **Fichiers** : `src/lib/taskWrites.ts:35-66` (`walk`/`loadFiles`/`treeWithErrors`),
  `src/lib/validate.ts:225` et `:262` (re-`yaml.load` par fichier), `src/server/api.ts:158-167`.
- **Mécanisme** (démontré) : `treeWithErrors` = `loadFiles` (readdir récursif + `statSync` +
  `readFileSync` × 351) puis `buildTaskTree(files)` (parse n°1), puis `validateAll(files)`
  qui refait `buildTaskTree(files)` (parse n°2) **et** `validateIdUniquenessAcrossFiles(files)`
  (parse n°3). Soit **~1 050 `yaml.load` par GET /api/tree**. Aucun cache, aucune
  invalidation mtime — alors que le watcher fs (#147) sait déjà exactement ce qui a changé.
- **Aggravant — les mutations** : un PATCH (`taskWrites.ts:388` + commit `:267-272`) fait
  `readTree` (passe complète) + `validateAll(loadFiles(...))` (2 parses) + `readTree` final
  (passe complète). Puis le watcher déclenche le SSE → le client refait `/api/tree`
  (3 parses de plus). **Une édition d'un champ ≈ 4 scans du dossier, ~1 400 lectures de
  fichiers, ~1 750 parses YAML.**
- **Impact cible** : mesuré 40–60 ms/appel ici ; extrapolé **150–300 ms warm** sur la
  cible, **2–4 s à froid** (HDD, 351 seeks). Pendant une session agent qui écrit toutes
  les quelques secondes, le serveur passe son temps à re-parser le même 1,4 Mo — c'est
  exactement le symptôme « soucis CPU » remonté. + 634 Ko de JSON stringifié/transféré/parsé
  côté client par resync.
- **Classement** :
  - **Quick-win 1** : `validateAll` reçoit le tree déjà construit (supprime les parses n°2/n°3) — divise le coût CPU par ~3, localisé (2 signatures).
  - **Quick-win 2** : cache module `{files, tree}` invalidé par le watcher déjà présent dans `createApiMiddleware` — supprime les relectures disque à l'identique.
  - Chantier (optionnel) : invalidation fine par fichier (le SSE porte déjà les paths).

### 2.2 — ÉLEVÉ : le client resynchronise le tree pour des changements qui ne le concernent pas

- **Fichier** : `src/state/TreeContext.tsx:102-104` vs `src/server/api.ts:272-281, 296-309`.
- **Mécanisme** (démontré) : le serveur watch **trois** racines (tasksDir, docsDir,
  `graphify-out/`) et le SSE `change` porte `paths` ; `KbContext` filtre sur
  `graph.json` (`KbContext.tsx:76-84`, correct), mais **TreeContext ignore `paths`** et
  refait un `/api/tree` complet pour n'importe quel événement. Une régénération Graphify
  (13 Mo écrits dans `graphify-out/` : graph.json, wiki/, cache/, GRAPH_REPORT.md…)
  ou une note dans `docs/` déclenche une salve de resyncs tree (debounce 80 ms = un
  broadcast par rafale, mais une régen dure des secondes → plusieurs broadcasts).
  Aggravant : tasksDir (`docs/tasks`) est **sous** docsDir (`docs`) → chaque écriture de
  tâche est vue par 2 watchers (coalescée par le debounce, bénin, mais à connaître).
- **Impact cible** : pendant `graphify update`, N × (passe complète §2.1 + 634 Ko de
  payload + re-render React global) pour zéro changement de tâches.
- **Classement** : **quick-win** — filtrer dans TreeContext comme le fait déjà KbContext
  (préfixe `paths`), ou côté serveur taguer l'événement par racine.

### 2.3 — ÉLEVÉ (boot + RAM client) : bundle unique de 1,4 Mo, zéro code-splitting, js-yaml embarqué pour rien

- **Fichiers** : `dist/assets/index-CuoiSON5.js` (1,4 Mo / 316 Ko gzip — le warning 500 Ko
  préexistant), `vite.config.ts` (aucun `manualChunks`, aucun `import()` dynamique dans `src/`),
  `src/components/SectionPanel.tsx:11` et `TaskPanel.tsx:27` (`import { TYPES } from '../lib/tasks'`).
- **Mécanisme** (démontré) : un seul chunk contenant react-dom + @base-ui + dagre + marked
  + toute la vue KB + **js-yaml** — vérifié présent dans le bundle. js-yaml n'y a rien à
  faire : le navigateur ne parse jamais de YAML ; il entre parce que `tasks.ts` fait
  `import yaml from 'js-yaml'` en tête et que des composants importent les **constantes**
  (`TYPES`, `SECTION_STATUS_LABEL`) de ce même module. Idem : le logo Graphify en PNG
  base64 inline dans `KbGraph.tsx:598` (~3,4 Ko de source).
- **Impact cible** : parse/compile JS de 1,4 Mo sur CPU lent ≈ 0,5–1 s au boot, ~15–25 Mo
  de heap JS avant le premier rendu. (Servi en localhost + cache immutable : le coût
  réseau/disque n'arrive qu'une fois par version — c'est le parse qui se répète à chaque
  ouverture d'onglet.)
- **Classement** :
  - **Quick-win** : extraire `TYPES`/constantes dans un module sans import js-yaml (~40 Ko gz gagnés, fix en 30 min).
  - **Chantier (petit)** : `import()` dynamique de la vue KB + dagre (`RoadmapGraph`) — les deux plus gros consommateurs non nécessaires au premier écran ; devrait repasser sous le warning 500 Ko.

### 2.4 — MOYEN : la KB a triplé — la sim tourne désormais sur 1 500 nœuds tronqués

- **Fichiers** : `graphify-out/graph.json` (2 420 nœuds / 4 062 arêtes, mesuré),
  `src/lib/kbFilter.ts:86` (`KB_MAX_NODES = 1500`), `src/lib/kbSim.ts`, `src/components/kbSimDriver.ts`.
- **Mécanisme** : le code et les commentaires sont calibrés « 869 nœuds » ; le graphe réel
  fait 2 420 → la troncature à 1 500 s'active (bandeau « graphe tronqué ») et la sim
  Barnes-Hut + le DOM tournent sur **1 500 `<g>` (cercle + rect + text)** pendant la phase
  de settle (~240 ticks, ~4 s). O(n log n) ≈ 16 k interactions/tick × 60 fps — absorbé sur
  machine rapide, **frames perdues plausibles-à-vérifier sur la cible** pendant les 4 s de
  génération (ensuite : 0 CPU, la sim s'endort — démontré, cf. §3).
- **Impact** : transitoire (ouverture de l'onglet KB uniquement) ; pas de fuite.
- **Classement** : chantier léger si confirmé au profiling — baisser `KB_MAX_NODES` ou
  indexer le budget sur `navigator.hardwareConcurrency` ; le pipeline reduced-motion
  (layout figé) existe déjà comme sortie de secours.

### 2.5 — MOYEN : `/api/kb` relit et re-normalise 2,5 Mo à chaque requête

- **Fichier** : `src/server/kb.ts:135-148`.
- **Mécanisme** (démontré) : `readFileSync` 2,5 Mo + `JSON.parse` + `normalizeGraph` +
  re-`JSON.stringify` dans la réponse, sans cache mtime. Parse mesuré 5,8 ms ici
  (~30–50 ms cible) ; à froid sur HDD, +50–100 ms d'I/O.
- **Impact** : appelé 1× par onglet au montage (`KbProvider` — le fetch part même si
  l'utilisateur n'ouvre jamais la KB) + 1× par régénération du graphe. Fréquence faible →
  pas critique, mais 3 onglets = 3 × 2,5 Mo lus/parsés/stringifiés.
- **Classement** : quick-win (cache `{mtime, payload}` module — 10 lignes) ; différer le
  fetch au premier affichage KB est aussi un quick-win.

### 2.6 — FAIBLE : deux EventSource par onglet, et le compteur d'auto-shutdown compte des connexions

- **Fichiers** : `src/state/TreeContext.tsx:99-105` + `src/state/KbContext.tsx:72-86`
  (2 connexions `/api/events` par onglet) ; `src/server/api.ts:324-331` + `serve.ts:150-159`.
- **Mécanisme** (démontré) : chaque onglet ouvre 2 SSE ; `onClientCountChange(clients.size)`
  nommé `openTabs` vaut donc 2× le nombre d'onglets. Pas de fuite (les deux sont retirés au
  close) ; 2 keep-alive/25 s au lieu d'1 ; l'auto-shutdown reste correct (seuil `> 0`).
- **Classement** : quick-win cosmétique — partager une seule EventSource via un petit
  module d'abonnement.

### 2.7 — FAIBLE : `.roadmapped-usage.jsonl` append sans rotation

- **Fichier** : `src/lib/usageLog.ts:18-25` (+ POST `/api/usage` à chaque changement de vue,
  `App.tsx:156-162`).
- **Mécanisme** (démontré) : append-only, aucune rotation. Mesuré : 15,8 Ko / 247 lignes
  après ~2 semaines — **croissance réelle mais ~1 Ko/jour**. Sur la cible ce n'est pas le
  problème du user (il faudrait des années pour peser).
- **Classement** : quick-win « hygiène » — tronquer aux N dernières lignes quand le fichier
  dépasse ~1 Mo, ou documenter la suppression libre (gitignoré).

### 2.8 — FAIBLE / plausible-à-vérifier : watchers `fs.watch` jamais fermés

- **Fichier** : `src/server/api.ts:296-309` — les `FSWatcher` créés dans
  `createApiMiddleware` ne sont ni stockés ni `close()`.
- **Mécanisme** : durée de vie = process → **pas une fuite en prod** (`serve.ts` crée le
  middleware une fois). En dev Vite seulement, un redémarrage de config ré-exécute
  `configureServer` → watchers potentiellement doublés dans le même process
  (plausible-à-vérifier ; n'affecte pas l'utilisateur final).
- **Classement** : quick-win de propreté (garder les handles, les fermer sur close serveur).

### 2.9 — FAIBLE : re-renders non mémoïsés sur resync

- **Fichiers** : `src/components/Backlog.tsx` / `TaskRow.tsx` (aucun `memo`/`useMemo`,
  vérifié par grep), `RoadmapGraph.tsx:311-337` (le hover `setFocusKey` re-rend toutes les
  cartes — sans re-layout, cf. §3).
- **Mécanisme** : chaque resync SSE remplace `tree` → toute la liste (341 lignes) est
  réconciliée ; pas de virtualisation. React réconcilie sans re-créer le DOM → coût
  ~10–30 ms/resync ici, ×3–5 sur la cible. Perceptible seulement combiné à §2.1/§2.2
  (salves de resyncs).
- **Classement** : chantier léger (memo sur TaskRow d'abord ; virtualisation seulement si
  les backlogs dépassent ~1 000 tâches — pas le cas).

---

## 3. Zones SAINES (vérifiées ligne à ligne — à ne pas « réparer »)

- **SSE sans fuite** : `api.ts:327-331` — sur `close`, `clearInterval(keepAlive)` +
  `clients.delete(res)` + notification du compteur. Le Set ne croît pas.
- **Broadcast borné** : `pending` (Set de paths) vidé à chaque broadcast, debounce 80 ms
  (#147) qui coalesce les salves d'écriture (`api.ts:270-281`).
- **Ring buffer d'activité borné** : `LiveActivity.tsx:101` — `slice(0, 200)`, plafond
  assumé (spec V1 §4). Toasts plafonnés (limit 5).
- **La sim KB ne tourne JAMAIS en fond** : alpha decay → `settled` → la boucle rAF ne se
  réarme pas (`kbSimDriver.ts:155`) ; `driver.stop()` au démontage (`KbGraph.tsx:254`) ;
  `KbView` n'est monté que si vue Docs + mode « Knowledge base » (`DocsView.tsx:117-123`,
  `App.tsx:22-25` démonte les autres vues). Onglet KB fermé = 0 rAF, démontré.
- **Rendu KB hors React** (#308/#316/#317) : la boucle rAF écrit directement les
  `transform` des `<g>` et 2 `<path>` agrégés pour 4 062 arêtes — React ne réconcilie
  jamais la scène à 60 fps ; entrée staggered (90 + 110/8 ticks) pour ne pas saturer la
  1re frame ; hover coalescé par rAF (`KbGraph.tsx:137-152`) ; labels sans
  `getComputedTextLength` (pas de layout thrash) ; troncature défensive `KB_MAX_NODES`.
- **Dagre mémoïsé** : `graphLayout.ts:39-49` WeakMap par identité d'input + input stable
  par `useMemo` (`RoadmapGraph.tsx:294-307`) — le layout ne recalcule qu'à une écriture ou
  un toggle, **jamais au hover/zoom/pan** (le pan/zoom est un transform CSS).
- **Pré-chauffage KB ciblé** : `warmKbLayout` seulement sous prefers-reduced-motion
  (`KbContext.tsx:67-70`) — pas de calcul de 550 ms pour ceux qui ne l'utiliseront pas.
- **Boot serveur léger** : `checkUpdate` (git ls-remote) **asynchrone hors chemin de
  rendu**, 1× au boot (`api.ts:257-262`) ; `ensureNotesSetup` best-effort ; assets hashés
  servis avec `immutable` (`serve.ts:52-55`) — un seul parse réseau/disque par version.
- **Auto-shutdown** (#330) : le serveur s'arrête 5 s après la fermeture du dernier onglet —
  pas de zombie qui pèserait des jours sur la machine du user.
- **Params sim bornés** : tout override localStorage passe par `sanitizeKbSimOverrides`
  (clamp aux `KB_SIM_LIMITS`) — pas de sim dégénérée possible.
- **Watch de Vite dev correctement exclu** de tasksDir/docsDir (`vite.config.ts`) — pas de
  full-reload par écriture d'agent.

---

## 4. Priorisation

**Quick-wins (6)** — ordre de rentabilité :

| # | Fix | Gain estimé (cible 8 Go/HDD) |
|---|---|---|
| 1 | §2.1a — `validateAll` réutilise le tree construit (supprime 2 parses/appel) | CPU `/api/tree` ÷3 (~300 ms → ~100 ms warm) |
| 2 | §2.1b — cache `{files, tree}` invalidé par le watcher existant | 0 lecture disque à l'identique ; froid HDD 2–4 s → 1 seule fois |
| 3 | §2.2 — TreeContext filtre `paths` (comme KbContext) | plus aucun resync tree pendant `graphify update` / édition de docs |
| 4 | §2.3a — sortir `TYPES` de `tasks.ts` (js-yaml hors bundle) | −40 Ko gz, −~110 Ko de parse JS au boot |
| 5 | §2.5 — cache mtime sur `/api/kb` + fetch différé au 1er affichage KB | −2,5 Mo lus/parsés par onglet qui n'ouvre pas la KB |
| 6 | §2.7 — rotation/troncature de `.roadmapped-usage.jsonl` | hygiène (croissance ~1 Ko/j, non urgente) |

**Chantiers (3)** :

| # | Chantier | Portée |
|---|---|---|
| A | §2.3b — code-splitting : `import()` de la vue KB et de dagre | repasse sous le warning 500 Ko ; boot allégé |
| B | §2.9 — memo `TaskRow`/`GraphCard` (virtualisation : non nécessaire à 341 tâches) | resyncs moins chers côté client |
| C | §2.4 — budget KB adaptatif (le graphe a ×2,8 depuis le calibrage « 869 ») | settle KB fluide sur machine lente ; à profiler avant |

Non-findings assumés : pas de fuite mémoire serveur identifiée ; l'idle est réellement à
zéro (aucun timer de polling, aucune boucle) ; les watchers §2.8 et le double EventSource
§2.6 sont de la propreté, pas des urgences.
