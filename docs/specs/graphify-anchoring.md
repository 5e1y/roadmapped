# Spec — Graphify par défaut + ancrage agent (le graphe comme couche de navigation)

Date : 2026-07-12 · Statut : proposition · Complète `docs/specs/graphify-kb.md`
(dont les mesures §2.1 et l'architecture §3–4 restent valables).
**Supersede** dans l'ancien spec : §2.2(b) (« opt-in à l'init » → **install par
défaut**), §2.3 (l'ordre uv→pipx→venv gagne un étage : **installer uv lui-même**),
§5.2 (consentement d'install → **opt-out**, le consentement ne reste que sur la
1ʳᵉ génération), §9.2/9.3 (tranchés ici).

Cap (Rémi) : Graphify n'est pas une option, c'est le **cœur** de Roadmapped — la
couche de navigation de la codebase pour tout agent qui travaille via le
framework. Le visualiseur est un gadget ; la valeur = l'agent qui interroge le
graphe **par réflexe** au lieu de grep/lire à l'aveugle. Python + Graphify
s'installent **par défaut** à `roadmapped init`.

---

## VOLET A — Install par défaut (robuste, léger)

### A.1 Le mécanisme retenu : bootstrap `uv`, chaîne à 4 étages

`uv` (Astral) fait exactement les deux choses dont on a besoin, vérifié dans la
doc officielle (docs.astral.sh/uv) :

- **Python géré** : « By default, uv will automatically download Python versions
  when needed » (`python-downloads: automatic`). Pas besoin d'un `uv python
  install` explicite : `uv tool install graphifyy` télécharge tout seul un
  CPython (builds `python-build-standalone`, désormais maintenus par Astral) si
  la machine n'a rien en ≥ 3.10. Plateformes : macOS arm64/x64, Linux
  arm64/x64 (glibc + musl), Windows x64/arm64 — toute notre matrice.
- **Env outil isolé** : `uv tool install graphifyy` = l'équivalent pipx, env
  dédié sous `~/.local/share/uv/tools/`, binaire exposé dans `~/.local/bin`.
  C'est aussi la voie **recommandée par Graphify** dans son README.
- **uv lui-même** : binaire statique unique, **sans dépendance**, installable
  sans root. Installeur officiel : `curl -LsSf https://astral.sh/uv/install.sh |
  sh` (macOS/Linux) / `irm https://astral.sh/uv/install.ps1 | iex` (Windows),
  cible `~/.local/bin`. **Reco Roadmapped : ne PAS piper un script distant
  depuis install.mjs** — télécharger directement l'asset GitHub Release
  (`astral-sh/uv`, nom d'asset déterministe par plateforme, ex.
  `uv-aarch64-apple-darwin.tar.gz`), **version épinglée + checksum `.sha256`
  vérifié**, décompressé dans `~/.roadmapped/bin/uv`. Même résultat, zéro
  exécution de script tiers, reproductible, et on n'écrit rien dans le PATH de
  l'utilisateur (on invoque uv par chemin absolu).

**Chaîne d'install (premier étage qui aboutit gagne) — remplace §2.3 :**

1. `uv` déjà sur le PATH → `uv tool install graphifyy` (Python auto si absent).
2. Pas de `uv` → **on l'installe** (asset GitHub épinglé → `~/.roadmapped/bin/uv`)
   → étage 1 avec ce binaire.
3. uv KO (réseau filtré vers github.com/astral.sh…) → `pipx install graphifyy`
   si pipx présent.
4. Sinon Python système ≥ 3.10 → venv dédié `~/.roadmapped/py` + `pip install
   graphifyy` (déjà codé dans `ensureGraphify`).
5. Tout a échoué (rare : offline + pas de Python) → log une ligne, statut
   `failed` mémorisé, **init réussit quand même**, `roadmapped upgrade` re-tente.
   La dégradation reste propre — mais le **défaut est « ça s'installe »**.

Dans tous les cas : chemins **absolus** mémorisés dans `roadmapped.config.json`
(`kb.graphifyBin`, `kb.pythonBin`, `kb.uvBin`) — le PATH utilisateur n'est jamais
un prérequis (un `~/.local/bin` hors PATH est un des pièges réels de
`uv tool install`/pipx ; on le contourne au lieu de le documenter).

### A.2 Tailles réelles, chiffrées (mesurées le 2026-07-12)

Assets GitHub Releases mesurés (uv 0.11.28, python-build-standalone 20260623),
env graphifyy repris des wheels mesurés dans graphify-kb.md §2.1 :

| Composant | Téléchargé | Sur disque | Quand |
|---|---|---|---|
| Binaire `uv` | 22,6–26,4 Mo selon plateforme | ~35–40 Mo (1 fichier) | seulement si uv absent |
| CPython géré (`install_only_stripped`) | 22–35 Mo | ~70–130 Mo | seulement si AUCUN Python ≥ 3.10 |
| Env `graphifyy` sans extra Leiden | ~28 Mo | ~80–120 Mo (numpy domine) | toujours |

Trois scénarios honnêtes :
- **Dev avec uv** (de plus en plus courant) : **~28 Mo** téléchargés. Le
  « ~30 Mo, rien du tout » de Rémi est exact ici.
- **Dev avec Python ≥ 3.10 mais sans uv** (cas macOS/linux typique) : ~50 Mo
  téléchargés / ~150 Mo disque.
- **Machine nue** (ni uv ni Python — surtout Windows) : **~85 Mo téléchargés /
  ~250 Mo disque**, une fois, chez l'utilisateur.

Verdict assumé : même le pire cas est **l'ordre de grandeur d'un `npm install`
de projet front**, one-shot, partagé entre tous les repos de la machine (uv,
CPython et l'env tool sont globaux, pas par-repo). Le « ~30 Mo » de Rémi est le
cas nominal, pas le pire cas — on l'assume en le disant tel quel : *« ~30 Mo
(jusqu'à ~85 Mo si ni Python ni uv ne sont présents), en une fois, hors paquet »*.

**Bundle-dans-npm vs install-à-l'init — la distinction qui compte :**
- *Bundler CPython dans le paquet npm* : ~25–46 Mo compressé **par plateforme**
  × (mac arm/x64, linux arm/x64, win) + uv + wheels → paquet ×5–10, matrice de
  build par OS. **Écarté** (déjà rejeté en §2.2a de l'ancien spec — confirmé).
- *Install à l'init via uv* (**retenu**) : **zéro octet dans le paquet npm**
  (qui reste Node-only, ~30 Mo). Tout se matérialise chez l'utilisateur au 1ᵉʳ
  `roadmapped init`, une seule fois par machine.

### A.3 Opt-out, pas opt-in — décision

L'actuel `ensureGraphify` est **prompt défaut-Non + `--with-kb`** : exactement
l'inverse du statut « cœur ». À renverser :

- **Défaut = installe**, sans prompt. L'init loggue ce qu'il fait et combien ça
  pèse (« kb: installing Graphify (~28 Mo, one-time)… ») — informer remplace
  demander.
- **Opt-out** : `roadmapped init --no-kb` + clé config `kb: false` (respectée
  par `upgrade`, pour que le refus ne soit pas re-demandé à chaque upgrade) —
  le refus est un état mémorisé, pas un prompt répété.
- **CI** : `CI=true` détecté → skip silencieux (un runner n'a pas besoin de la
  KB et ne doit pas télécharger 85 Mo). C'est le seul contexte où le défaut
  s'inverse.
- `--with-kb` reste accepté (no-op devenu défaut) pour ne pas casser les docs.

Pourquoi opt-out : le coût est borné et one-shot, l'échec est non-bloquant, et
un opt-in défaut-Non garantit statistiquement que la couche « cœur » n'existe
pas sur la majorité des installs — c'est la définition d'une option, pas d'un
cœur.

### A.4 Les vrais risques d'un install auto, et leur neutralisation

| Risque | Neutralisation |
|---|---|
| Réseau/proxy d'entreprise (github.com, astral.sh, PyPI filtrés) | uv/pip respectent `HTTP(S)_PROXY` ; chaque étage a un timeout (idiome `tryExec` déjà en place, 300 s) ; échec = étage suivant puis `failed` loggé, jamais d'init cassé |
| Offline | skip propre + message « relance `roadmapped upgrade` » (déjà le contrat) |
| Permissions | tout vit sous `~` (`~/.roadmapped`, `~/.local/share/uv`) — **jamais de sudo, jamais de site-packages système** |
| PATH | chemins absolus dans la config (A.1) — on ne dépend pas du PATH et on ne le modifie pas |
| Windows | uv est first-class Windows ; le venv fallback gère déjà `Scripts/` ; l'asset uv `.zip` se décompresse sans outil externe (zlib Node) |
| Version pinnée d'uv qui vieillit | `roadmapped upgrade` peut re-pinner ; uv sait s'auto-update (`uv self update`) mais on n'en dépend pas |
| Double install (uv déjà là via brew/cargo) | détection PATH d'abord (étage 1) — on n'installe le nôtre que s'il manque |

Contrat inchangé : `ensureGraphify` ne lève **jamais**, ne bloque **jamais**
l'init, reste idempotente (retour `'already'`), et `upgrade` re-tente.

### A.5 La 1ʳᵉ génération du graphe — comment et quand

Contrainte structurelle (graphify-kb.md correction n°2) : `install.mjs` n'a pas
d'agent — la part docs exige des sous-agents de session Claude. **La génération
est un acte d'agent ; l'install doit donc armer un déclencheur, pas générer.**

Mécanisme en trois crans, du plus tôt au filet :

1. **Phase setup (le cas nominal)** : l'init est presque toujours suivi de la
   phase setup du skill (`references/setup.md`), agent présent. L'étape 7
   existante passe de « si Graphify a été installé, propose » à : **fait partie
   du déroulé standard** — l'agent demande UNE fois (« générer le graphe
   maintenant ? sous-agents sur les docs = tokens ») et lance `/graphify .` sur
   accord. Le consentement reste sur la génération (elle coûte des tokens),
   plus sur l'install (elle n'en coûte pas).
2. **Marqueur + sitrep (le filet systémique)** : l'absence de
   `graphify-out/graph.json` **est** le marqueur — pas de fichier sentinelle à
   inventer. `sitrep` (déjà injecté à CHAQUE SessionStart par le hook #122)
   gagne une ligne d'état KB :
   - installé + pas de graphe → `KB: installed, graph not generated — propose
     «/graphify .» to the user (one-time, uses sub-agents)`.
   - graphe présent + périmé (`built_at_commit` vs HEAD, logique de `kb doctor`
     réutilisée) → `KB: stale (built at <sha>, HEAD <sha>) — run /graphify .
     --update` (code-only = zéro token LLM, cf. B.1).
   - `kb: false` (opt-out) ou `declined` → **silence total** (on ne harcèle pas
     un refus).
   L'agent voit donc l'état du graphe à l'ouverture de chaque session, sans
   acte manuel à se rappeler — le premier `sitrep` post-init pousse la
   génération même si la phase setup a été sautée.
3. **Rappel au point d'usage** : `take`/`brief` sur un graphe absent impriment
   une ligne (« no knowledge graph — run /graphify . once »), déjà l'esprit des
   messages actuels de `kb` — étendu aux commandes du cycle (cf. B.3).

Distinguer les états dans la config (`kb: 'installed' | 'declined' | 'failed'`,
posé par init/upgrade) pour que sitrep sache quand se taire.

---

## VOLET B — Ancrage profond (le vrai sujet)

### B.1 La mécanique d'économie de tokens — factuel, sources lues

**Comment ça marche.** Le graphe (`graphify-out/graph.json`, node-link NetworkX)
indexe symboles/fichiers/concepts en nœuds (`id, label, file_type, source_file,
source_location, community`) et leurs relations en arêtes typées
(`relation, confidence EXTRACTED/INFERRED/AMBIGUOUS, weight`). Pour le code,
l'extraction est **Tree-sitter AST, locale, déterministe, zéro LLM** ; pour les
docs, des sous-agents de session. Interroger le graphe = charger un **sous-graphe**
(BFS/DFS depuis 1–3 nœuds d'ancrage, budget ~4 car/token — c'est dans le
`skill.md` de Graphify) au lieu de charger des fichiers entiers. Le graphe
répond à « où vit X, qui appelle/importe X, comment A rejoint B » — la phase
**localisation/exploration** d'une tâche — en ~quelques centaines de tokens.

**Le ~70 % est-il étayé ?** Ce que disent les sources :
- README Graphify (verbatim) : *« On a mixed corpus (Karpathy repos + papers +
  images): 71.5× fewer tokens per query vs reading raw files »* — ~1,7 k tokens
  par requête graphe vs ~123 k en lecture brute, sur un corpus de 52 fichiers.
- Écho indépendant (dev.to, Medium, MindStudio, rajeevpentyala.com) : réduction
  de **70–90 % des tokens d'entrée par tour d'agent** quand l'alternative était
  de recharger des fichiers ; le « 70× » du README y est repris en le qualifiant
  de best-case sur un corpus précis.

**Verdict honnête** : le 71.5× est un chiffre de README — best-case, par
requête, corpus choisi. Le « ~70 % » de Rémi est en réalité **plus prudent que
le marketing**, et il est plausible — mais sur la **part exploration** d'une
session, pas sur la session entière : l'agent devra toujours LIRE les fichiers
qu'il modifie ; ce que le graphe supprime, c'est le grep-and-read exploratoire
(retrouver où vit un symbole, ce qui en dépend, relire les mêmes fichiers d'une
session à l'autre). Sur une session de dev réelle, l'économie totale dépend du
ratio exploration/édition — élevé sur les grosses codebases et les tâches de
compréhension, plus faible sur un fix localisé dont la `ref` pointe déjà le
fichier. À dire tel quel dans la comm : *« jusqu'à ~70 % des tokens
d'exploration »*, et le **mesurer sur Roadmapped lui-même** (ticket dédié) plutôt
que citer le benchmark d'autrui. Deux points solides au crédit de la mécanique :
la régénération code-only est **gratuite en tokens** (AST sans LLM — le coût LLM
ne concerne que les docs, une fois, en cache SHA256), et le graphe **persiste
entre sessions** (l'économie se répète, l'index ne se refait pas).

### B.2 Constats — l'état RÉEL de l'intégration (audit honnête)

1. **La plomberie de lecture est bonne et complète.** `src/server/kb.ts`
   (normalisation défensive), `src/lib/kbLink.ts` (jointure refs⇄source_file,
   pure, testée), `src/lib/kbQuery.ts` (partagé MCP/CLI), 3 outils MCP
   (`kb_neighborhood`/`kb_search`/`kb_node`), CLI `kb` 4 sous-commandes dont un
   `doctor` avec fraîcheur `built_at_commit` vs HEAD. Le graphe du repo est
   généré et committé (988 Ko). Rien à refaire là.
2. **Mais rien n'est load-bearing.** Le graphe n'est sur le chemin d'AUCUNE
   commande du cycle : `take` et `brief` (`briefText`, `src/lib/render.ts`)
   n'incluent **pas** le voisinage KB ; `sitrep` (`sitrepText`) ignore
   totalement l'état du graphe. Un agent peut dérouler cent cycles
   sitrep→take→done sans jamais toucher la KB — et c'est ce qui se passera.
3. **Le skill compte sur le réflexe — il ne l'aura pas.** UN bloc (« Know what
   a task touches », SKILL.md l.54) hors du cycle, formulé en « before working a
   non-trivial task » : une exhortation, pas une mécanique. Pire : la « Golden
   anti-token rule » (l.81) martèle « open NO reference, la CLI est
   self-contained » — l'agent optimise ses appels, et `kb_neighborhood` est
   précisément l'appel en plus qu'il économisera. La règle d'or actuelle
   **travaille contre** la KB.
4. **L'install est une option défaut-Non.** `ensureGraphify` : prompt `[y/N]`,
   skip en non-TTY, `--with-kb` opt-in. Statistiquement, la KB n'existe pas
   chez l'utilisateur type. (Volet A la renverse.)
5. **La moitié navigation de Graphify n'est pas branchée.** Le MCP natif
   (`python -m graphify.serve`, vérifié dans `serve.py` : `query_graph`,
   `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`,
   `shortest_path`) n'est enregistré nulle part — `.mcp.json` n'a que
   `roadmapped`. Nos 3 `kb_*` sont **task-centrés** (voisinage d'un ticket,
   tickets d'un nœud, recherche par label) : parfaits pour « par où j'attaque
   ce ticket », insuffisants pour NAVIGUER le code (traversée BFS/DFS, chemin
   entre deux concepts, communautés). Le skill `/graphify query` existe mais
   personne ne le rappelle au bon moment.
6. **Fraîcheur : diagnostic sans déclencheur.** `kb doctor` sait dire « stale »
   — mais seulement si on le lance. Aucun garde-fou automatique ne pousse le
   `--update`.

### B.3 Recommandations priorisées

**P0 — Servir le graphe d'office : le voisinage KB DANS `take`/`brief`.**
Le levier n°1, et il ne demande aucun réflexe : `briefText` embarque une section
« KB neighborhood » (directs + voisins 1 saut, le format compact de
`neighborhoodText` — quelques centaines de tokens) quand le graphe existe et que
la tâche a des refs matchées. L'agent qui `take` reçoit la carte AVANT d'avoir
pu grep. Graphe absent/périmé → la ligne de nudge (A.5.3). C'est la différence
entre « l'agent doit penser à demander » et « la mécanique livre » — la seule
intégration réellement load-bearing possible. (MCP `take`/`brief` héritent,
même `briefText`.)

**P0 — Volet A** (install par défaut + sitrep porteur de l'état KB) — sans
graphe présent partout, tout le reste est théorique.

**P1 — Réécrire l'ancrage dans SKILL.md : une règle, au bon endroit, sans bloat.**
- **Dans « The cycle »** (pas dans un bloc à part) : `take` → *le brief inclut le
  voisinage KB : c'est ta carte, pars de là* → work. Le cycle décrit ce qui
  arrive, pas ce qu'il faudrait faire.
- **Une règle « graph-first »** remplace le bloc actuel : *« Locating code =
  query the graph, not grep. Before any exploratory Grep/Read (“where does X
  live, what touches X, how does A reach B”), one `kb_search` / `query_graph` /
  `shortest_path`. Grep is for content the graph doesn't hold (exact strings,
  values). No graph → say so, propose `/graphify .`. »* — 3 phrases, pas un
  chapitre.
- **Amender la Golden anti-token rule** pour qu'elle porte la KB au lieu de la
  contredire : la règle interdit de RE-calculer la priorité et d'ouvrir les
  references — préciser que la navigation par le graphe est le même principe
  appliqué au code (l'index avant la lecture brute), donc requise, pas exemptée.
- **Une ligne dans « Forbidden »** : ❌ *exploratory grep/read spelunking when
  the knowledge graph is present — query it first.* Le Forbidden est la section
  que les agents respectent le mieux ; une interdiction y vaut dix conseils.
Total : ~10 lignes nettes dans SKILL.md (le bloc actuel de 7 lignes saute).

**P1 — Brancher le MCP natif de Graphify à côté du nôtre.**
Les deux couches sont complémentaires, pas concurrentes :
- `roadmapped.kb_*` = le **liage tâche⇄graphe** (voisinage d'un ticket, tickets
  d'un nœud) — ce que Graphify ne peut pas avoir. Point d'entrée du cycle.
- `graphify.*` = la **navigation de code** (query_graph BFS/DFS, get_neighbors,
  shortest_path, god_nodes, get_community, graph_stats) — traversées qu'on ne
  réimplémentera pas en Node.
Concrètement : `ensureGraphify` merge une 2ᵉ entrée dans `.mcp.json` (idiome
`mergeMcpEntry`) : `{ "graphify": { command: <kb.pythonBin|uv-tool-python>,
args: ["-m", "graphify.serve"] } }` — vérifié : `serve.py` prend le chemin du
graphe en argv (défaut `graphify-out/graph.json`, notre défaut aussi). Cohabitation
propre : préfixes distincts, descriptions qui se citent (`kb_neighborhood` :
« for free graph traversal use graphify.query_graph »). Coût : ~7 définitions
d'outils dans le contexte — accepté, c'est le cœur. Sans Python/KB, l'entrée
n'est pas écrite (pas de serveur MCP mort).

**P2 — Garde-fous de fraîcheur, au-delà du doctor.**
- La ligne sitrep « stale » (A.5.2) est le déclencheur principal — session-start,
  déjà injecté, zéro nouveau mécanisme.
- `done` : si des refs de la tâche pointent des fichiers absents du graphe
  (nouveaux fichiers), une ligne « graph doesn't know these files yet →
  /graphify . --update » dans la sortie de `done`.
- `roadmapped kb refresh` (spec §3.3, toujours pas implémenté) : la passe AST
  code-only en sous-processus Python (déterministe, zéro LLM) — permet à un hook
  ou à l'agent de resynchroniser la part code sans session de sous-agents. Le
  hook post-commit auto reste phase « si l'usage le réclame ».
- Seuil de staleness : `built_at_commit` ≠ HEAD est trop nerveux (chaque commit) ;
  nudge à partir de N commits d'écart (défaut ~10) ou dès qu'un fichier de refs
  de la tâche courante a changé depuis le build.

**P2 — Mesurer le 70 % chez nous.** Un ticket dogfood : même tâche réelle avec
et sans KB (tokens d'exploration comptés), pour remplacer le chiffre de README
par le nôtre dans le README/homepage. L'anti-marketing de Rémi mérite un chiffre
maison.

### B.4 Tickets d'implémentation proposés (à créer, ordre = priorité)

1. **KB installée par défaut à l'init (opt-out `--no-kb`)** — renverser
   `ensureGraphify` : plus de prompt, install par défaut, skip si `CI`/`kb:false`,
   états `installed/declined/failed` en config.
2. **Bootstrap uv : installer uv lui-même + Python géré** — étage 2 de la
   chaîne : asset GitHub épinglé + checksum → `~/.roadmapped/bin/uv`, chemins
   absolus (`kb.uvBin/pythonBin/graphifyBin`) en config.
3. **Voisinage KB dans `brief`/`take`** — `briefText` embarque
   `neighborhoodText` (graphe présent + refs matchées) ; nudge une ligne si
   graphe absent/stale. CLI + MCP.
4. **Ligne d'état KB dans `sitrep`** — absent → propose `/graphify .` ; stale
   (≥ N commits) → propose `--update` ; declined/opt-out → silence.
5. **SKILL.md : règle graph-first** — KB dans le cycle, règle « graphe avant
   grep », amendement de la Golden rule, ligne Forbidden ; le bloc « Know what a
   task touches » actuel saute.
6. **MCP natif Graphify dans `.mcp.json`** — `ensureGraphify` merge l'entrée
   `graphify` (`python -m graphify.serve`) quand la KB est installée ;
   descriptions croisées avec `kb_*`.
7. **`roadmapped kb refresh`** — passe AST code-only en sous-processus
   (extract+build+cluster+export via le Python isolé), jamais bloquant.
8. **Nudge `--update` dans `done`** — refs hors graphe détectées à la clôture →
   une ligne.
9. **setup.md + README/guide : narratif install-par-défaut** — étape 7 réécrite
   (génération = déroulé standard, consentement sur les tokens seulement),
   tailles honnêtes de A.2, formulation « Node-only + KB installée pour vous ».
10. **Dogfood : mesurer l'économie de tokens réelle** — même tâche avec/sans
    KB sur Roadmapped, chiffre maison pour la comm (brainstorm).
11. **`kb doctor` : seuil de staleness + exit codes** — N commits d'écart,
    codes de sortie scriptables (préalable de 4 et 8).

Dépendances : 1→2 (même zone), 3/4 indépendants mais après 11 pour le seuil ;
5 après 3 (le skill décrit ce que le brief livre déjà) ; 6 après 1.

---

## Sources

- `github.com/Graphify-Labs/graphify` — README (claim verbatim : « On a mixed
  corpus (Karpathy repos + papers + images): 71.5× fewer tokens per query vs
  reading raw files » ; ~1,7 k vs ~123 k tokens/requête, corpus 52 fichiers ;
  install reco `uv tool install graphifyy`, Python ≥ 3.10).
- `graphify/skill.md` — pipeline 9 étapes, `--update` code-only sans LLM,
  query BFS/DFS budgetée (~4 car/token), sous-agents parallèles pour les docs.
- `graphify/serve.py` — MCP stdio `python -m graphify.serve [path]`, 7 outils
  (`query_graph, get_node, get_neighbors, get_community, god_nodes, graph_stats,
  shortest_path`), défaut `graphify-out/graph.json`.
- `docs.astral.sh/uv` — « By default, uv will automatically download Python
  versions when needed » ; plateformes ; `~/.local/bin`.
- GitHub Releases mesurés le 2026-07-12 : `astral-sh/uv` 0.11.28 (22,6–26,4 Mo
  par plateforme) ; `astral-sh/python-build-standalone` 20260623
  (`install_only_stripped` 21,9–35 Mo).
- Échos indépendants du claim (70–90 %/tour, 70× qualifié de best-case) :
  dev.to (« Cut Your Claude Token Consumption By 70x »), Medium (JIN System
  Architect), MindStudio, rajeevpentyala.com.
- Repo : `scripts/install.mjs` (`ensureGraphify`), `skills/roadmapped/SKILL.md`,
  `references/setup.md`, `scripts/mcp-server.mjs`, `scripts/task.mjs`,
  `src/lib/kbLink.ts`, `src/lib/kbQuery.ts`, `src/server/kb.ts`,
  `src/lib/paths.ts`, `.mcp.json`, `graphify-out/graph.json` (988 Ko, committé).
