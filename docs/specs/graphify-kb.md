# Spec — Intégration PROFONDE de Graphify dans Roadmapped

Date : 2026-07-11 · Statut : proposition (décisions ouvertes en §9)
Cap (Rémi, verbatim) : « embarquer Python si c'est pas trop lourd, que Graphify
fasse partie de l'install de Roadmapped, que l'init de Roadmapped ait une étape
en plus d'init Graphify, que les tickets embarquent les liens Graphify. Que tout
soit lié. »

Ce n'est PAS un viewer optionnel : Graphify devient une **couche de connaissance
livrée à tous**. Quatre chantiers : (1) Python dans l'install, (2) étape Graphify
dans `roadmapped init`, (3) tickets ⇄ graphe, (4) plan par phases.

Contrainte : seul fichier écrit = ce spec. Lecture seule côté `src/`. Pas de code
de prod.

---

## 1. Verdict Graphify — l'essentiel vérifié (sources lues)

Sources : repo `Graphify-Labs/graphify` (canonique ; `safishamsi/graphify` y
redirige), PyPI `graphifyy` 0.9.12, `skill.md`, `__main__.py`, `detect.py`,
`export.py`, `serve.py`, échantillon réel `worked/httpx/graph.json`.

- **Nature** : skill d'assistant IA + lib Python. Le binaire `graphify` n'est
  PAS un générateur (sous-commandes : `install`, `hook`, `benchmark` — vérifié
  `__main__.py`). La pipeline (`/graphify <path>`, `query`, `--update`) est
  **orchestrée par l'agent** suivant `skill.md`, qui appelle les modules Python.
- **Deux étages** : **code** = Tree-sitter AST **local, déterministe, sans
  LLM, sans clé API** ; **docs `.md`/PDF/images** = extraction sémantique faite
  par des **sous-agents de la session Claude** (pas de clé à fournir). Cache
  SHA256, `--update` incrémental.
- **Sortie** : `graphify-out/graph.json` = **node-link NetworkX standard**
  (vérifié) — `nodes[{id,label,file_type,source_file,source_location,community}]`,
  `links[{source,target,relation,confidence:EXTRACTED|INFERRED|AMBIGUOUS,weight}]`.
  Plus `graph.html` (visu vis.js, DA navy étrangère), `GRAPH_REPORT.md`, exports
  optionnels. Interrogation : skill, **MCP stdio** (`graphify.serve` : query_graph,
  get_neighbors, shortest_path…), ou JSON direct (notre porte d'entrée).
- **Licence MIT**. 82,2 k ⭐, v0.9.12 (2026-07-10), très actif mais **pré-1.0**.

### ⚠️ Correction structurante n°1 — Graphify n'indexe PAS les `.yaml`
`detect.py` : `CODE_EXTENSIONS` (py/ts/js/go/rs/…) et `DOC_EXTENSIONS`
(`.md .txt .rst`) — **ni `.yaml` ni `.yml`**. Donc **les tickets `docs/tasks/*.yaml`
ne deviennent PAS des nœuds** en lançant Graphify sur le repo. La prémisse
« chaque ticket est déjà un nœud » est fausse par défaut. → Le liage ticket⇄graphe
NE peut PAS reposer là-dessus. Il reposera sur le champ **`refs`** des tickets
(§4), joint au `source_file` des nœuds — **côté Roadmapped, dérivé, zéro saisie**.

### ⚠️ Correction structurante n°2 — le dashboard lit, l'agent génère
Aucune commande shell « génère le graphe » : la part docs exige des sous-agents
de session Claude. Le dashboard est un **lecteur** de `graph.json` ; la
génération est un acte d'agent (`/graphify`) ou une passe **code-only** relançable
en sous-processus (AST pur, sans LLM — cf. §3.3).

---

## 2. Chantier 1 — Python dans l'install : VERDICT

**Question de Rémi : « si c'est pas trop lourd ».** Réponse chiffrée.

### 2.1 Poids réel (wheels PyPI mesurés)
Install BASE de `graphifyy` (extras Leiden/pdf/mcp EXCLUS) :

| Paquet | Download |
|---|---|
| graphifyy | 1,1 Mo |
| networkx | 2,1 Mo |
| numpy | ~16 Mo |
| rapidfuzz | ~2 Mo |
| tree-sitter (core) + ~24 grammaires (py/ts/go/rs/java/c/cpp/rb…) | ~7 Mo |
| **Total téléchargé** | **~28 Mo** |
| **Sur disque installé** | **~80–120 Mo** (numpy domine) |

- **Leiden = piège à éviter.** L'extra clustering `graspologic` (5,2 Mo lui-même)
  tire scipy + scikit-learn + gensim + umap-learn + statsmodels + matplotlib →
  **200 Mo+**. **On ne l'installe PAS** : Graphify retombe sur la détection de
  communautés NetworkX (greedy modularity) / `python-louvain` (0,2 Mo, pur
  Python). Le champ `community` reste peuplé, qualité légèrement moindre. Décidé.
- **Prérequis système** : Python ≥ 3.10 (wheels manylinux/macos/win dispos → pas
  de compilateur requis). Temps d'install : ~15–40 s selon réseau.

### 2.2 Les trois options
- **(a) Bundler un runtime Python dans le paquet npm — RÉDHIBITOIRE.**
  Un CPython autonome (python-build-standalone) = ~30–50 Mo compressé **par
  plateforme** × 3 (mac/linux/win) + les libs. Le paquet Roadmapped (~30 Mo,
  Node-only) serait multiplié par 5–10 et gagnerait une matrice de build par OS.
  Contre la promesse frontalement. **Rejeté.**
- **(b) DÉTECTER Python ≥ 3.10 présent, puis installer graphifyy dans un
  environnement ISOLÉ — RETENU.** Les ~28 Mo vont dans la machine de
  l'utilisateur (pas dans le paquet npm, qui reste inchangé). Opt-in à l'init,
  fetch réseau unique, dégradation propre si Python absent.
- **(c) `graph.json` fourni / MCP distant** : hors sujet (pas de génération
  locale, pas de « tout est lié »). Écarté.

### 2.3 Le chemin le plus léger (ponytail)
Installer dans un **environnement isolé**, PAS dans le site-packages global de
l'utilisateur (ne pas polluer son Python). Ordre de préférence, premier trouvé
gagne :
1. **`uv tool install graphifyy`** — recommandé par Graphify, isolé, ultra-rapide,
   `uv` de plus en plus courant chez les devs IA ;
2. **`pipx install graphifyy`** — isolé, standard ;
3. **venv dédié** : `python3 -m venv ~/.roadmapped/py && …/py/bin/pip install
   graphifyy` — le graphe est ensuite lancé via ce python-là (chemin mémorisé
   dans `roadmapped.config.json`, clé `pythonBin`).

`graphify install` (copie le skill dans `~/.claude/skills/`) est lancé ensuite —
il rend le skill `/graphify` dispo à l'agent, cohérent avec l'esprit
« driven by your AI agent ».

### 2.4 Verdict net + honnêteté sur la promesse
**PAS trop lourd → GO sur (b), sans l'extra Leiden, dans un env isolé.**
Ce que ça écorne, dit franchement :
- La promesse « Node ≥ 22.18, ~30 Mo, pas de serveur, github/npm » **tient pour
  le CŒUR** : le paquet npm ne bouge pas, l'app tourne sans Python.
- Elle gagne **un prérequis OPTIONNEL** : Python ≥ 3.10 + ~28 Mo installés chez
  l'utilisateur (hors paquet), pour la SEULE couche Knowledge base. Sans Python,
  Roadmapped fonctionne à l'identique, KB en moins (empty state pédagogique).
- Formulation assumée : *« Roadmapped est Node-only. La Knowledge base est une
  couche optionnelle propulsée par Graphify (Python) — Roadmapped la détecte et
  l'installe pour vous si Python est là, et s'en passe proprement sinon. »*

---

## 3. Architecture d'ensemble

```
  agent Claude Code + skill /graphify        roadmapped init (chantier 2)
  ─────────────────────────────────          ────────────────────────────
  /graphify .  [--update]                     détecte python3 ≥3.10
     tree-sitter (code, local)                uv/pipx install graphifyy
     sous-agents (docs .md)                   graphify install
        │                                     (consentement) 1ʳᵉ génération
        ▼                                              │
  graphify-out/graph.json  ◄───────────────────────────┘
        │
        ▼   GET /api/kb        ┌─ src/lib/kbLink.ts : JOINTURE refs⇄source_file
  src/server/kb.ts  ──────────┤  (dérive ticket⇄nœud, zéro champ YAML)
        │                      └─────────────────────────────────────────────
        ├──► sous-onglet Docs « Knowledge base » : KbGraph.tsx (SVG, useZoomPan)
        └──► TaskPanel : voisinage KB d'un ticket (chantier 3)
```

- **Zéro dépendance npm nouvelle** : layout maison, pas de lib de graphe.
- `graph.json` reste à `graphify-out/graph.json` (défaut Graphify — ne pas se
  battre contre l'outil ; surtout pas sous `docs/`, sinon `GRAPH_REPORT.md`/`wiki/`
  polluent l'arbre Docs). Chemin configurable `kbGraph` dans la config.

### 3.1 Serveur `src/server/kb.ts` (miroir de `docs.ts`)
```ts
export interface KbGraph {
  generatedAt: string | null   // mtime ISO de graph.json
  nodes: KbNode[]              // {id,label,fileType,sourceFile,sourceLocation,community,rationale?}
  edges: KbEdge[]              // {source,target,relation,confidence,weight}
  stats: { nodes:number; edges:number; communities:number }
}
export function readKbGraph(root, kbPath):
  | { ok:true; graph:KbGraph } | { ok:true; graph:null }   // absent = normal
  | { ok:false; status:400|422; error:string }             // traversal / JSON cassé
```
Normalisation **défensive** (schéma pré-1.0) : `links` OU `edges`, `source`/`target`
objet ou id, champs inconnus ignorés, `community` absent → −1. Un test fixture
fige le contrat toléré.

Route : `GET /api/kb` (+ `GET /api/kb/node/:id` phase 3 pour le voisinage d'un
nœud). Watch SSE sur `graph.json` greffé sur le watcher existant (#147) →
resync live après régénération.

### 3.2 Rendu (pas dagre, pas d'iframe — condensé)
- **Pas dagre** (layout en couches, inadapté à un graphe non-dirigé dense), **pas
  l'iframe `graph.html`** (DA étrangère, invisible en dark mode).
- **`src/lib/kbLayout.ts`** : force-directed pur déterministe (seed = hash d'ids,
  itérations bornées, gravité par communauté), mémoïsé WeakMap — précédent
  `layoutTagGraph` (#146). **`useZoomPan` réutilisé tel quel.**
- **`KbGraph.tsx`** : SVG façon `TagGraph` (pastilles ∝ degré, labels HTML
  seuillés par degré), arêtes `EXTRACTED` pleines / `INFERRED`+`AMBIGUOUS`
  pointillées (l'audit trail rendu visible), **monochrome + accent** (communauté =
  filtre, pas teinte). Survol = voisinage accent, reste atténué (idiome
  RoadmapGraph). Garde-fou : > ~1 500 nœuds → sous-graphe des plus hauts degrés
  + bandeau « tronqué, filtre pour zoomer ».

### 3.3 `roadmapped kb` (CLI, phase 3) — doctor + refresh code-only
PAS un générateur : (1) vérifie `python3 ≥3.10` + `graphifyy` importable (sinon
imprime les instructions, exit 0) ; (2) si `graph.json` existe, relance la passe
**AST pure** (`graphify.extract`+`build`+`cluster`+`export.to_json` via le python
isolé) — déterministe, sans LLM, resynchronise la part code ; la part docs reste
celle du dernier passage d'agent (cache). Jamais bloquant.

---

## 4. Chantier 3 — Tickets ⇄ Graphe : « tout est lié », DÉRIVÉ

### 4.1 Le pivot : `refs` (déjà dans le schéma tâche)
Vérifié dans `src/lib/tasks.ts` : `TaskNode.refs: string[]` — des **chemins
repo-relatifs** vers le code/doc que le ticket touche, avec ancre optionnelle
(`src/lib/roadmap.ts#nextQueue` ou `:123`, parsés par `refExtract.parseRef`).
C'est EXACTEMENT la clé de jointure avec le `source_file` des nœuds Graphify.

**Décision : liage 100 % DÉRIVÉ, aucun champ nouveau dans le YAML.**
- Pas de `kbLinks`. Ajouter un champ = saisie manuelle, dérive, casse potentielle
  de la validation. Le ticket cite déjà ses fichiers via `refs` (et `dependsOn`
  pour les autres tickets) — on JOINT, on ne redéclare pas.
- Schéma tâche **intact** → validation intacte, rétrocompat totale. Un ticket sans
  `refs` a simplement un voisinage KB vide (dégradation naturelle).

### 4.2 `src/lib/kbLink.ts` (nouveau, pur, testé) — la jointure
```ts
// Index construit une fois par (tree, graph) :
//   fileOfRef(ref)      = parseRef(ref).path          (ancre ignorée pour le match fichier)
//   nodesByFile: Map<sourceFile, KbNode[]>            (depuis graph.json)
//   ticketNode(taskId)  → { direct: KbNode[],         nœuds dont source_file ∈ refs du ticket
//                           neighbors: KbNode[] }      voisins (1 saut) de ces nœuds
//   ticketsByNode: Map<nodeId, taskId[]>              index inverse
```
- **Ticket → KB** : pour chaque `ref` du ticket, `nodesByFile.get(path)` → nœuds
  « directs » (le fichier cité) ; leur voisinage à 1 saut (via `edges`) → nœuds
  « connectés » (ce que ce fichier importe/appelle/cite). C'est le voisinage KB
  du ticket, sans une ligne de YAML.
- **KB → Tickets** : `ticketsByNode` répond « quels tickets touchent ce nœud ».
- **Anti-bruit** : matching par chemin exact normalisé POSIX (mêmes conventions
  que `docs.ts`), ancre `#symbol`/`:line` servant seulement à surligner la ligne
  dans le panneau, pas au match.

### 4.3 UI (i) — Voisinage KB dans le TaskPanel
Nouvelle section du `TaskPanel` (sous les refs, idiome des sections existantes),
alimentée par `GET /api/kb` + `kbLink` :
- **« Connected in the knowledge base »** : liste compacte des nœuds directs +
  voisins, groupés par `fileType` (code / document), chacun cliquable.
- Clic sur un nœud **code** → `reveal` (ouvre le fichier à `source_location`,
  route `/api/reveal` existante) ; nœud **document `.md`** → `OPEN_DOC_EVENT`
  (ouvre le doc dans le sous-onglet Documents — la boucle KB→Docs déjà en place).
- Affiché seulement si `graph.json` existe ET le ticket a des refs matchées ;
  sinon la section est absente (pas d'encart vide). Confiance des arêtes
  (`INFERRED`) en italique/pointillé, cohérent avec le graphe.

### 4.4 UI (ii) — Tickets liés depuis un nœud du graphe
Dans l'inspecteur de nœud (SidePanel, mode kb) : **« Tickets touching this »** =
`ticketsByNode.get(id)` → chips `#id titre` cliquables (ouvrent le TaskPanel via
`openTask`, API existante). Un nœud code devient ainsi une porte vers le travail
qui le concerne — « tout est lié » dans les deux sens.

### 4.5 UI (iii) — surbrillance croisée (phase 4, bonus)
Dans le graphe kb : filtre « n'afficher que les nœuds touchés par des tickets
ouverts » (toggle FilterMenu) → une carte du repo pondérée par le travail en
cours. Réutilise `computeAvailability`/statuts déjà calculés côté tree.

---

## 5. Chantier 2 — Étape Graphify dans `roadmapped init`

Vérifié dans `scripts/install.mjs` : `runInit` enchaîne des étapes idempotentes
(`ensureConfig`, `ensureSkeleton`, `copySkill`, `mergeMcpEntry`,
`ensureSessionHook`, `ensureClaudeMd`, `installGuardHook`). On ajoute une étape
**`ensureGraphify(hostRoot, log)`**, sur le même moule.

### 5.1 Ce qu'elle fait (idempotente, dégradée, jamais bloquante)
1. **Détecte** `python3 --version` ≥ 3.10 (et `uv`/`pipx` dispo). Absent/trop
   vieux → log clair (« Knowledge base : Python ≥ 3.10 introuvable — étape
   sautée. Installez Python puis relancez `roadmapped upgrade` pour l'activer »),
   `return`. **init continue** — la KB est optionnelle.
2. **Vérifie si graphifyy est déjà là** (`<pybin> -c "import graphify"`) → si oui,
   ne réinstalle pas (idempotence).
3. **Installe** via le chemin le plus léger dispo (uv → pipx → venv dédié, §2.3),
   SANS extra Leiden. Mémorise `pythonBin` dans `roadmapped.config.json` si venv.
4. **`graphify install`** (skill `/graphify` dispo à l'agent) + option
   `graphify claude install` (déclare le skill dans le CLAUDE.md du repo, idiome
   déjà utilisé par `ensureClaudeMd`).
5. **`.gitignore`** : ajoute `graphify-out/` (artefact dérivé au diff énorme ;
   même idiome que le gitignore de `docs/notes/`). Décision §9.1 si on committe
   `graph.json` seul.

### 5.2 Consentement — ce qu'elle NE fait PAS sans accord
- **N'installe pas silencieusement** ~28 Mo + ne lance pas de sous-agents (qui
  coûtent des tokens). L'install de graphifyy et surtout la **1ʳᵉ génération**
  sont derrière un **consentement explicite** :
  - init interactif (TTY) : prompt « Installer la Knowledge base (Graphify,
    Python, ~28 Mo) ? [o/N] », puis « Générer le graphe maintenant ? (lance
    l'agent /graphify, consomme des tokens) [o/N] ».
  - non-interactif / CI : **skip par défaut** ; drapeau opt-in `roadmapped init
    --with-kb` pour installer, et la génération reste toujours un `/graphify`
    manuel (jamais auto en CI).
- La **génération** n'est jamais faite par `install.mjs` lui-même (pas d'agent en
  contexte) : l'étape imprime l'invite `/graphify .` ou, si acceptée en TTY,
  écrit un marqueur que le SessionStart hook / le sitrep proposera à l'agent.

### 5.3 Les trois voies d'install (plugin / npm / github)
- **npm/github** (`roadmapped init`) : l'étape `ensureGraphify` s'exécute dans le
  flow décrit. `upgrade` la **re-tente** (re-détecte Python, réinstalle le skill
  si manquant) — jamais destructif, comme les autres étapes tool-owned.
- **plugin** : même `runInit`. Rien de spécifique (Python vit hors du plugin).
- Dans les trois cas : Python absent = étape sautée proprement, reste de l'init
  identique.

---

## 6. UI — placement (b) confirmé

Sous-onglet de la Vue Docs, toggle **« Documents / Knowledge base »**, copie
ligne à ligne du segmented Columns/Graph de `RoadmapView` (état de session, non
persisté ; `meta` du ViewHeader = chemin du doc en mode documents, `n nodes ·
m edges · générée il y a X` en mode kb). Le liage profond **ne justifie pas** un
tab de premier niveau : la KB reste une lentille sur la connaissance du repo
(comme Graph l'est sur les mêmes tâches). Le liage tickets vit dans le TaskPanel
et l'inspecteur de nœud — pas besoin de promouvoir la KB en 5ᵉ objet. Empty
state pédagogique inchangé (instructions `/graphify`, lien Graphify externe).

Découpage : `DocsView` garde shell + toggle ; corps kb dans `KbView.tsx`
(`useKbGraph` calqué sur `useDocsTree`) → `KbGraph.tsx`. Section voisinage dans
`TaskPanel.tsx`. Inspecteur de nœud dans `SidePanel`.

---

## 7. Plan par phases (version profonde)

### Phase 1 — SLICE MINIMAL livrable (~1,5 j)
Le plus petit « tout est lié » utile, sur un graphe **généré à la main**
(`/graphify .`), sans toucher à l'install :
- `src/server/kb.ts` (+ route `/api/kb`) + normalisation défensive + tests.
- Clé config `kbGraph` (défaut `graphify-out/graph.json`) dans `paths.ts`.
- Toggle « Documents / Knowledge base » + `useKbGraph` + `KbView` (empty/error/
  loading) + `kbLayout.ts` (+ tests purs) + `KbGraph.tsx` (zoom/pan, voisinage).
- **`src/lib/kbLink.ts`** (jointure refs⇄source_file, pur, testé) +
  **section voisinage KB dans le TaskPanel** (chantier 3.i) — la fonctionnalité
  qui rend le liage tangible dès le premier livrable.
- Dogfood : générer la KB de Roadmapped lui-même, mesurer la taille réelle.
- Risque : schéma Graphify pré-1.0 (borné par kb.ts + fixture) ; taille du graphe
  (cap d'affichage). Effort surtout front (layout + rendu).

### Phase 2 — Liage bidirectionnel complet (~1 j)
- Inspecteur de nœud (SidePanel) + « Tickets touching this » (chantier 3.ii).
- Recherche client (filtre/surlignage/fit) + filtres communauté/type/inferred.
- Watch SSE sur graph.json + staleness chip (mtime < doc le plus récent).
- Risque : perf sur gros graphe, faux positifs de match (chemins) — mitigé par
  normalisation POSIX stricte.

### Phase 3 — Graphify DANS l'install (~1,5 j)
- `ensureGraphify` dans `install.mjs` (détection Python, uv/pipx/venv, `graphify
  install`, gitignore) + consentement TTY + `--with-kb` + tests idempotence.
- `roadmapped kb` (doctor + refresh AST code-only en sous-processus python isolé).
- README/guide.md : section Knowledge base + la mention honnête (§2.4).
- Risque : hétérogénéité des environnements Python (uv absent, PATH, venv) —
  d'où l'ordre de repli et le « jamais bloquant ». C'est la phase la plus
  exposée aux machines réelles → la mettre APRÈS un viewer déjà utile.

### Phase 4 — Plus tard, si l'usage le réclame
- Filtre « nœuds touchés par tickets ouverts » (3.iii), hulls de communautés,
  mini-carte, hook git post-commit auto-refresh. Attendre le besoin réel.

**Ordre voulu** : viewer + liage TaskPanel (valeur immédiate, graphe manuel) →
liage inverse → puis l'install Python (le plus risqué, une fois la valeur prouvée).

---

## 8. Ce que ça ne sera pas (ponytail)

- Pas de runtime Python bundlé, pas d'extra Leiden (200 Mo), pas de wrapper Node
  de Tree-sitter, pas de réécriture de Graphify. Python absent = KB absente,
  proprement.
- **Pas de champ `kbLinks` dans le YAML** : le liage est dérivé de `refs`. Zéro
  saisie, schéma et validation intacts.
- Pas d'iframe `graph.html`, pas de vis.js/d3/cytoscape : SVG maison + briques
  testées (useZoomPan, idiomes TagGraph/RoadmapGraph).
- Pas de génération ni de query LLM dans le dashboard, pas d'install Python
  silencieuse ni de génération auto en CI.
- **Fallback si Rémi renonce à Graphify** : graphe de liens inter-documents
  (`[x](y.md)` + `refs` des tickets, ~100 lignes Node, zéro dépendance) sous le
  même toggle — utile, mais sans code↔docs ni communautés. Filet, pas équivalent.

---

## 9. Décisions qui restent à Rémi

1. **Git** : `graphify-out/` entièrement gitignoré (reco), ou committer
   `graph.json` seul (KB partagée post-clone, diffs lourds assumés) ?
2. **Environnement Python** : imposer un ordre (uv → pipx → venv, reco) ou forcer
   un seul mécanisme ? Accepte-t-on d'écrire `pythonBin` dans la config si venv ?
3. **Consentement génération** : prompt TTY à l'init (reco) suffit, ou opt-out
   plus fort (ne jamais rien lancer, l'agent seul décide via le skill) ?
4. **Périmètre du premier `/graphify`** : repo entier (reco : code + docs, c'est
   le liage riche) ou `docs/` seul ?
5. **Confirmer (b)** sous-onglet Docs + libellé (« Documents / Knowledge base »
   ou « Docs / KB » plus court quand le header porte recherche + filtres).
6. **Ordre des phases** : valider « viewer + liage AVANT l'install Python » (reco
   — dérisque), ou Rémi veut l'install Python dès le premier livrable ?
