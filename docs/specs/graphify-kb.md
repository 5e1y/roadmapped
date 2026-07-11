# Spec — Intégration Graphify : « Knowledge base » dans la Vue Docs

Date : 2026-07-11 · Statut : proposition (décisions ouvertes en §7)
Objet : brancher Graphify (repo → knowledge graph interrogeable) comme feature
du dashboard Roadmapped, en sous-onglet de la Vue Docs (toggle
« Documents / Knowledge base », pattern Columns/Graph de la Roadmap).

---

## 1. Verdict Graphify — ce que c'est vraiment (vérifié sur les sources)

Sources lues : repo `Graphify-Labs/graphify` (le canonique — `safishamsi/graphify`
y redirige), PyPI `graphifyy`, `graphify/skill.md`, `graphify/__main__.py`,
`graphify/export.py`, `graphify/serve.py`, échantillon réel `worked/httpx/graph.json`.

**Fiche d'identité.**
- **Nature** : d'abord un **skill d'assistant IA** (Claude Code, Cursor, Codex…)
  adossé à une **lib Python** ; le binaire `graphify` n'est PAS un CLI de
  génération — vérifié dans `__main__.py`, ses seules sous-commandes sont
  `install`, `claude install`, `vscode install`, `hook install|uninstall|status`,
  `benchmark`. Toute la pipeline (`/graphify <path>`, `query`, `path`,
  `explain`, `--update`, `--watch`…) est **orchestrée par l'agent** qui suit
  `skill.md` et appelle les modules Python (`detect`, `extract`, `build`,
  `cluster`, `export`) via `python3 -c`.
- **Deux étages d'extraction** :
  - **code** : Tree-sitter AST, **déterministe et 100 % local** (py/ts/js/go/
    rs/java/c/cpp/rb/…), zéro LLM, zéro clé API ;
  - **docs/.md, PDF, images** : extraction **sémantique faite par l'agent
    lui-même** (sous-agents dispatchés par le skill) — pas de clé API à
    fournir : c'est la session Claude Code qui paie. Cache SHA256 par fichier
    (`graphify-out/cache/`), `--update` incrémental.
- **Graphe** : NetworkX en mémoire, clustering **Leiden** (graspologic,
  optionnel) → champ `community` sur chaque nœud.
- **Sortie** (dossier `graphify-out/` dans le cwd) :
  - `graph.json` — **format node-link NetworkX standard** (vérifié sur un
    échantillon réel) :
    ```json
    { "directed": false, "multigraph": false, "graph": {},
      "nodes": [{ "id": "client_baseclient", "label": "BaseClient",
                  "file_type": "code", "source_file": "raw/client.py",
                  "source_location": "L31", "community": 2 }],
      "links": [{ "source": "client", "target": "models",
                  "relation": "imports_from",
                  "confidence": "EXTRACTED",  // EXTRACTED | INFERRED | AMBIGUOUS
                  "weight": 1.0, "source_file": "…", "source_location": "L6" }] }
    ```
    `file_type ∈ code|document|paper|image` ; les nœuds de docs peuvent porter
    un attribut `rationale` (le POURQUOI des décisions).
  - `graph.html` (visu vis.js autonome, DA sombre navy — **pas la nôtre**),
    `GRAPH_REPORT.md` (god nodes, requêtes suggérées), `cache/`, exports
    optionnels GraphML/Neo4j/SVG/Obsidian/wiki.
- **Interrogation** : par l'agent (skill `query`/`path`/`explain` = traversées
  BFS/DFS du JSON) ou par **serveur MCP stdio** (`python -m graphify.serve`,
  vérifié dans `serve.py` : tools `query_graph`, `get_node`, `get_neighbors`,
  `get_community`, `god_nodes`, `graph_stats`, `shortest_path`). Le JSON est
  aussi consommable directement — c'est notre porte d'entrée.
- **Install** : `pip install graphifyy` (ou `uv tool install graphifyy` /
  `pipx`), **Python ≥ 3.10** ; `graphify install` copie le skill dans
  `~/.claude/skills/graphify/` et le déclare dans `~/.claude/CLAUDE.md`.
  Extras optionnels : `mcp`, `pdf`, `neo4j`… Un hook git post-commit est dispo
  (`graphify hook install`).
- **Licence** : **MIT** (PyPI). **Maturité** : 82,2 k ⭐ / 8,1 k forks,
  158 releases, v0.9.12 du 2026-07-10 — très actif, mais **pré-1.0** (le
  format node-link est un standard NetworkX, risque de casse faible ; les
  champs métier `relation`/`confidence`/`community` sont à nous de tolérer).

**Conséquence structurante** : il n'existe PAS de commande shell « génère le
graphe » qu'un bouton du dashboard pourrait spawner. La génération est un
acte d'agent (et c'est cohérent avec Roadmapped, « driven by your AI agent »).
Le dashboard sera donc un **lecteur** de `graph.json`, honnête sur l'absence
et la fraîcheur — pas un générateur.

---

## 2. Architecture d'intégration

### 2.1 Principe : le dashboard LIT, l'agent GÉNÈRE

```
   agent (Claude Code + skill /graphify)          dashboard roadmapped
   ────────────────────────────────────          ─────────────────────
   /graphify . [--update]                         GET /api/kb
        │  tree-sitter (code, local)                   │ lit + normalise
        │  sous-agents (docs .md)                      ▼
        ▼                                         KbGraph (SVG, useZoomPan)
   graphify-out/graph.json  ────────────────────► sous-onglet Docs
```

- **Zéro dépendance nouvelle** côté Roadmapped : ni Python dans package.json,
  ni lib de graphe (layout maison, cf. §3). Graphify n'entre JAMAIS dans
  l'arbre de deps npm — contrainte github-only respectée.
- **Dégradation propre** : pas de `graph.json` → empty state pédagogique
  (cf. §4.4). Python absent → rien à détecter côté dashboard, c'est l'agent
  qui installera au premier `/graphify` (le skill le fait lui-même, Step 1).

### 2.2 Où vit le graphe

- **Emplacement** : `graphify-out/graph.json` **à la racine du repo hôte** —
  l'emplacement par défaut de Graphify. On ne se bat pas contre l'outil
  (déplacer la sortie casserait le skill, le cache et le MCP upstream).
  Surtout PAS sous `docs/` : `GRAPH_REPORT.md` et `wiki/*.md` pollueraient
  l'arbre de la Vue Docs (docs.ts ne filtre que `notes/` à la racine).
- **Config** : clé optionnelle dans `roadmapped.config.json` :
  ```json
  { "kbGraph": "graphify-out/graph.json" }   // défaut si absente
  ```
  Résolue dans `src/lib/paths.ts` (même mécanique que `tasksDir`/`docsDir`),
  anti-traversal (chemin relatif sous root, comme `unsafeDocPath`).
- **Git** : recommandation = **gitignorer `graphify-out/`** en entier
  (`roadmapped init`/`upgrade` ajoute la ligne, comme pour `docs/notes/`).
  C'est un artefact dérivé au diff énorme (des centaines de nœuds/arêtes
  re-sérialisés). Contre-argument flat-file (« le repo cloné doit marcher »,
  précédent : `dist/` est committé pour la distribution GitHub) → si Rémi veut
  une KB partagée post-clone, committer `graph.json` SEUL et ignorer le reste
  (`cache/`, `graph.html`, `wiki/`). Décision §7.1.

### 2.3 Comment il se génère

- **Voie royale (v1)** : Rémi (ou tout agent) lance `/graphify .` dans Claude
  Code. Point. Le dashboard n'orchestre rien.
- **`roadmapped kb` (phase 3, optionnel)** : PAS un générateur — un
  **doctor + rafraîchisseur code-only** :
  1. vérifie `python3 ≥ 3.10` et `import graphify` (sinon : imprime les deux
     commandes d'install et l'invocation `/graphify`, exit 0 — informatif,
     jamais bloquant) ;
  2. si `graph.json` existe : relance la passe **AST pure**
     (`graphify.extract` + `build` + `cluster` + `export.to_json` via
     `python3 -c`, exactement ce que fait le skill en Part A — déterministe,
     sans LLM) pour resynchroniser la part code. La part docs reste celle du
     dernier passage d'agent (le cache la préserve).
  - Pas de hook git par défaut (le `graphify hook install` upstream existe
    pour qui le veut). Pas de génération depuis le dashboard (bouton qui
    spawn python = usine à gaz + minutes d'attente + sous-agents impossibles
    hors session Claude — rejeté).

### 2.4 Périmètre du corpus

Recommandation : lancer sur **la racine du repo** et laisser Graphify
détecter — il ramasse `src/` + `scripts/` (code, AST local) et `docs/*.md`
(sémantique agent). Notes :
- `docs/tasks/*.yaml` : non supporté par Graphify (pas dans les types
  détectés) et déjà couvert par la Vue Roadmap — aucun doublon à craindre.
- `node_modules`, `dist` : exclus par la détection upstream (et sinon,
  premier run = warning > 200 fichiers avec choix du sous-dossier).
- Variante docs-only (`/graphify docs/`) : graphe plus petit, purement
  conceptuel — au choix de Rémi (§7.2). Le dashboard s'en fiche : il rend ce
  que `graph.json` contient, mixte ou pas (les `file_type` deviennent un
  filtre, cf. §4.3).

---

## 3. Data flow serveur + rendu + interrogation

### 3.1 Serveur (`src/server/`)

- **Nouveau module `src/server/kb.ts`** (miroir de `docs.ts`) :
  ```ts
  export interface KbGraph {
    generatedAt: string | null      // mtime ISO de graph.json
    nodes: KbNode[]                 // { id, label, fileType, sourceFile,
                                    //   sourceLocation, community, rationale? }
    edges: KbEdge[]                 // { source, target, relation, confidence, weight }
    stats: { nodes: number; edges: number; communities: number }
  }
  export function readKbGraph(rootDir: string, kbPath: string):
    | { ok: true; graph: KbGraph }
    | { ok: true; graph: null }        // fichier absent = état normal, pas une erreur
    | { ok: false; status: 400|422; error: string }  // path traversal / JSON invalide
  ```
  Normalisation **défensive** : champs inconnus ignorés, `links` OU `edges`
  acceptés, `source`/`target` sous forme d'objet ou d'id (les deux existent
  selon les versions de NetworkX), nœuds sans `community` → `community: -1`.
  Le schéma upstream est pré-1.0 : on tolère, on ne valide pas au strict.
- **Route** : dans `routeApi` (api.ts), un seul ajout :
  `GET /api/kb` → `{ type: 'getKb' }` → `readKbGraph(paths.root, paths.kbGraph)`.
  Réponse : `{ ok: true, graph }` (graph nullable). Pas de POST : lecture seule.
- **Live (phase 2)** : un `watch(kbGraphFile)` simple ajouté à côté du watcher
  tasksDir/docsDir existant (#147) ; l'événement SSE `change` porte déjà des
  `paths` — le client KB resynchronise quand `graph.json` y figure. Un fichier
  unique : pas de récursif, pas de fallback Linux à gérer.

### 3.2 Rendu — moteur existant ou pas ?

- **`RoadmapGraph`/dagre : NON.** Dagre = layout en couches pour DAG de
  dépendances (rankdir LR). Un knowledge graph est non-dirigé, dense, avec
  communautés — dagre en ferait une nappe illisible. Les cartes-boutons de
  248 px ne passent pas non plus à 500+ nœuds.
- **`graph.html` de Graphify en iframe : NON.** DA navy/vis.js étrangère
  (violerait le monochrome + tokens, invisible en dark mode), CSP/servir un
  HTML tiers, double source de vérité. Rejeté.
- **OUI : le triptyque maison, étendu.**
  - **`src/lib/kbLayout.ts`** (nouveau, pur, testé) : force-directed
    déterministe (seed fixe = hash des ids, N itérations bornées ; attraction
    par arête pondérée `weight`, gravité par communauté pour agglomérer les
    clusters). Même contrat que `graphLayout.ts` : entrée
    `{ nodes, edges }` → `Map<id, {x,y}>` + bbox, mémoïsé par identité
    (WeakMap). ~150 lignes, zéro dépendance — `layoutTagGraph` (#146) a déjà
    posé le précédent force-directed pur dans ce repo.
  - **`useZoomPan`** réutilisé tel quel (molette vers le curseur, drag-pan,
    Fit/100 %, clavier) — c'est exactement son contrat.
  - **`KbGraph.tsx`** : rendu SVG façon `TagGraph`, pas façon cartes :
    pastilles ∝ degré, labels HTML à police fixe pour les nœuds au-dessus d'un
    seuil de degré (tous les labels à 500 nœuds = bouillie), arêtes en filets
    neutral — **`INFERRED`/`AMBIGUOUS` en pointillés** (l'audit trail
    d'honnêteté de Graphify, rendu visible), `EXTRACTED` en trait plein.
    Monochrome + accent (DA) : PAS de couleur par communauté — la communauté
    est un **filtre**, pas une teinte. Survol/sélection : voisinage en accent,
    reste atténué (idiome `graphNeighborhood`/DimVeil de RoadmapGraph).
  - **Garde-fou perf** : au-delà de ~1 500 nœuds, n'afficher par défaut que le
    sous-graphe des N nœuds de plus fort degré + bandeau « graphe tronqué,
    filtre pour zoomer » (Graphify lui-même plafonne sa visu à 5 000).

### 3.3 Interrogation dans le dashboard

- **v1 : recherche client pure.** Le graphe est en mémoire ; un input
  (idiome de l'input de recherche du Backlog) filtre sur `label` +
  `sourceFile` → surligne les hits, atténue le reste, Enter recentre (fit sur
  le sous-ensemble). Clic sur un nœud → **inspecteur** dans le `SidePanel`
  existant : label, type, communauté, `rationale` s'il existe, fichier source
  (si `.md` sous docs/ → lien `OPEN_DOC_EVENT` qui ouvre le doc dans le
  sous-onglet Documents — la boucle KB→Docs), liste des voisins cliquables.
- **Les questions en langage naturel restent l'affaire de l'agent** (skill
  `query`/MCP graphify). Le dashboard ne réimplémente PAS un moteur de
  question-réponse — séparation nette : dashboard = voir/naviguer, agent =
  interroger. (Un pont MCP `roadmapped` → graphify serait redondant : l'agent
  peut brancher le MCP graphify directement. YAGNI, cf. §7.4.)

---

## 4. UI

### 4.1 Placement : (b) sous-onglet de la Vue Docs — confirmé

Recommandation = **(b)**, la préférence de Rémi, et elle se défend seule :
1. **La KB est une lentille sur le même objet** — la connaissance du repo
   (docs + code), pas un nouvel objet métier. La Roadmap a exactement ce
   pattern : mêmes tâches, deux lentilles (Columns/Graph). « Documents /
   Knowledge base » = mêmes savoirs, deux lentilles (liste/graphe).
2. **Les tabs du haut sont un espace curé** : 4 vues = 4 objets (Backlog,
   Roadmap, Docs, Notepad). Un 5ᵉ tab « kb » diluerait la nav pour une
   feature dépendante d'un outil externe optionnel — et l'empty state d'un
   tab de premier niveau vide serait pénible en permanence pour qui n'utilise
   pas Graphify. En sous-onglet, le coût d'absence est nul.
3. **Zéro plomberie** : `nav:view` (localStorage), titre d'onglet, ViewHeader,
   MainView — rien à toucher. Le pattern segmented existe déjà, testé, connu
   des yeux de l'utilisateur.

### 4.2 Le toggle (calqué ligne à ligne sur RoadmapView)

Dans `DocsView`, même construction que RoadmapView :
```tsx
const [mode, setMode] = useState<'documents' | 'kb'>('documents')
// ViewHeader children :
<div className="flex overflow-hidden rounded-md border border-neutral-300">
  {(['documents', 'kb'] as const).map((m) => (
    <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
      className={mode === m ? 'bg-neutral-900 text-white …' : 'bg-white text-neutral-600 …'}>
      {m === 'documents' ? 'Documents' : 'Knowledge base'}
    </button>
  ))}
</div>
```
- **État de session** (useState, non persisté) — même doctrine que le mode
  Columns/Graph : un coup d'œil, pas une préférence.
- `meta` du ViewHeader : en mode documents, le chemin du doc (inchangé) ; en
  mode kb, `n nodes · m edges · générée il y a X` (relativeTime existant).
- Mode kb : le flanc gauche « Fichiers » (420 px) et la zone prose sont
  remplacés par le canvas plein (comme la Vue Graphe roadmap) ; les contrôles
  zoom épinglés en haut-droite (mêmes boutons − / Fit / 100 % / +), l'input de
  recherche dans le ViewHeader à côté du toggle.
- Découpage : `DocsView` garde le shell + toggle ; le corps kb vit dans
  `KbView.tsx` (fetch `/api/kb` via un hook `useKbGraph` calqué sur
  `useDocsTree`) → `KbGraph.tsx` (rendu pur).

### 4.3 Filtres (phase 2)

Dans le ViewHeader, réutiliser `FilterMenu` (le dropdown canonique) :
- **Communauté** (simple) — libellées par leur god node (« autour de
  BaseClient »), comptes par communauté ;
- **Type** (`code / document / paper / image`, multi) ;
- **Confiance** : toggle « inferred » (même idiome que le bouton « done » de
  RoadmapView, EyeOpen/EyeClosed) pour masquer les arêtes non-EXTRACTED.

### 4.4 Empty state (graph.json absent) — l'état le plus important

Pas d'écran muet (doctrine RoadmapView) ; centré dans la zone kb :
```
Knowledge base — pas encore générée

Le graphe se construit avec Graphify (open source, MIT) depuis
Claude Code :

  pip install graphifyy && graphify install     # une fois
  /graphify .                                   # dans Claude Code, à la racine

Le dashboard lira graphify-out/graph.json automatiquement.
[En savoir plus sur Graphify ↗]
```
- Ton : factuel, direct (tone-of-voice) ; le lien externe = idiome du bouton
  « Report an issue » (target _blank, rel noopener).
- États frères, mêmes gabarits que RoadmapView : `loadError` → « Server
  unreachable » ; JSON invalide (422) → « graph.json illisible — régénérez
  avec /graphify » + le message d'erreur en font-mono ; graphe vide (0 nœud)
  → « Graphe vide — le corpus détecté ne contenait rien d'extractible ».
- **Staleness (phase 2)** : si le mtime de `graph.json` est antérieur au doc
  le plus récent de docsDir, chip discret dans le meta : « peut-être
  obsolète — relance /graphify --update ».

---

## 5. Plan par phases

### Phase 1 — SLICE MINIMAL livrable (~1 j)
La plus petite chose utile : **voir sa KB dans le dashboard**.
- `src/server/kb.ts` (lecture + normalisation + anti-traversal) + tests
  (fixtures : node-link réel, absent, JSON cassé, edges/links).
- Route `GET /api/kb` dans `routeApi` + `runAction` + tests.
- Clé config `kbGraph` (défaut `graphify-out/graph.json`) dans paths.ts.
- Toggle « Documents / Knowledge base » dans DocsView (§4.2).
- `useKbGraph`, `KbView` (empty/error/loading states §4.4), `kbLayout.ts`
  (+ tests purs), `KbGraph.tsx` : pastilles + labels seuillés + arêtes
  pleines/pointillées, zoom/pan (useZoomPan), survol = voisinage accent.
- Lecture seule, pas de recherche, pas de filtres, pas de watch.
- `.gitignore` : `graphify-out/` ajouté par init/upgrade (selon §7.1).

### Phase 2 — Naviguer et faire confiance (~1 j)
- Recherche client (filtre + surlignage + fit).
- Inspecteur de nœud dans SidePanel ; lien `sourceFile` `.md` → ouvre le doc
  dans le sous-onglet Documents (`OPEN_DOC_EVENT`).
- Filtres communauté / type / inferred (FilterMenu).
- Watch SSE sur graph.json (resync live après régénération) + staleness chip.

### Phase 3 — CLI d'hygiène (~0,5 j, optionnel)
- `roadmapped kb` : doctor (python3/graphify présents ? graph.json présent ?
  âge ?) + refresh AST code-only en sous-processus `python3 -c`, dégradation
  en simples instructions imprimées si Python manque.
- README/guide.md : section Knowledge base.

### Phase 4 — Plus tard, si le besoin crie
- Pont MCP roadmapped→graphify (probablement jamais : le MCP graphify existe).
- Densité : hulls de communautés, mini-carte. Attendre l'usage réel.

### Risques
- **Schéma upstream pré-1.0** : format node-link = standard NetworkX (stable) ;
  nos champs métier sont normalisés défensivement (§3.1) ; un test fixture
  fige le contrat qu'on tolère. Impact borné au module kb.ts.
- **Taille du graphe** : Roadmapped lui-même ≈ quelques milliers de nœuds
  potentiels → cap d'affichage §3.2 + layout borné en itérations. À mesurer
  au premier run réel sur ce repo (fait partie de la phase 1 : générer la KB
  de Roadmapped comme dogfood).
- **Fraîcheur trompeuse** : un graphe vieux de 3 semaines a l'air vrai.
  Mitigé par `generatedAt` affiché dès la phase 1, staleness en phase 2.
- **Dérive de périmètre** (query LLM in-dashboard, génération in-app) :
  explicitement hors scope — le dashboard lit, l'agent écrit.

---

## 6. Ce que ça ne sera pas (ponytail)

- Pas de Python dans les deps npm, pas de wrapper Node de Tree-sitter, pas de
  réécriture d'un sous-ensemble de Graphify : **si Graphify est absent, la
  feature est absente, proprement.**
- Pas d'iframe `graph.html`, pas de vis.js/d3/cytoscape : SVG maison + les
  briques déjà testées (useZoomPan, idiomes TagGraph/RoadmapGraph).
- Pas de bouton « Générer » dans le dashboard.
- **Alternative minimale si Rémi renonce à Graphify** : un graphe de LIENS
  entre documents (`[x](y.md)` parsés dans docs.ts, ~100 lignes Node, zéro
  dépendance) sous le même toggle. Utile, mais sans code↔docs, sans
  communautés, sans rationale — c'est un fallback, pas un équivalent.

---

## 7. Décisions qui restent à Rémi

1. **Git** : `graphify-out/` entièrement gitignoré (reco), ou `graph.json`
   committé seul (KB partagée post-clone, diffs lourds assumés — précédent
   `dist/`) ?
2. **Périmètre du premier run** : repo entier (reco : code + docs, c'est là
   que Graphify brille) ou `docs/` seul ?
3. **Confirmer le placement (b)** et le libellé exact du toggle
   (« Documents / Knowledge base » — ou « Docs / KB » plus court dans un
   header déjà chargé en mode kb avec recherche + filtres ?).
4. **Phase 3 (`roadmapped kb`)** : la vouloir d'emblée, ou attendre de voir si
   l'empty state + `/graphify` suffisent au quotidien ?
