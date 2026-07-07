# Spec — Économie radicale de tokens : l'app porte le contexte, l'agent consomme

**Date** : 2026-07-07 · **Statut** : DRAFT — à approuver par Rémi AVANT toute exécution
**Demande** : Rémi (carte blanche) · **Données** : dogfooding intégral de cette session
(45+ tâches livrées en pilotant Roadmaped avec Roadmaped).

## Constat mesuré (session du 2026-07-07)

| Poste | Coût actuel (≈ tokens) | Cause |
|---|---|---|
| Bootstrap session | ~2 200 (SKILL.md injecté) + ~4 500 (3 références lues) | tout est chargé même pour une session de routine |
| Micro-changement (fix 1 ligne) | ~600-900 | même cérémonie qu'une feature : detail long, start, done consigné |
| Ticket standard (créer + exécuter + consigner) | ~900-1 400 | detail ~250, show verbeux (~350), done ~250 |
| Navigation des liens | ~250-450 par `show` en cascade | `liées: #6` sans titre ni statut → shows supplémentaires |
| Exploration évitée quand les refs sont bonnes | 0 (sinon 3 000-10 000) | LE point fort actuel — à outiller, pas à changer |

**Principe directeur** (le « ponytail » du projet) : *tout ce que l'app peut savoir,
l'agent ne doit jamais le déduire.* Le tri des priorités (nextQueue) a montré la voie —
on généralise.

## Décisions

### 1. Skill scindé : noyau minimal + références à la demande

- **SKILL.md ≤ 50 lignes** : boussole (5 lignes), le cycle (`take` → travail → `done`),
  les commandes en une ligne chacune, les interdits condensés, et un ROUTEUR de
  références : « décomposer une spec → `references/planning.md` ; premier setup →
  `setup.md` ; éditer un YAML à la main → `formats.md` ; déléguer à des subagents →
  `delegation.md` ».
- **Règle d'or anti-token, écrite dans le noyau** : pour `next/take/start/done/add/quick`,
  n'ouvrir AUCUNE référence — le CLI est autoportant (`--help` et messages d'erreur
  guident). Les références ne se lisent que sur déclencheur explicite du routeur.
- `workflows.md` éclaté en `planning.md` (idée→spec→tâches) et `delegation.md`
  (subagents, revues) ; `formats.md` et `setup.md` inchangés sur le fond.
- Gain visé : bootstrap routine ~6 700 → **~900 tokens** (noyau seul).

### 2. CLI machine-first : `take`, `brief`, sorties denses et autoportantes

- **`take [--team t]`** : `next` + `start` + brief complet EN UNE COMMANDE — la commande
  d'ouverture de session type. Économise 2 allers-retours et un `show`.
- **`brief <id>`** : le brief d'exécution (équivalent CLI du « Copier le brief agent ») :
  titre, stage, team, detail, refs, **deps et links avec titres + statuts inline**,
  rappel de la consigne `done`. Zéro navigation en cascade.
- **`show`** : les lignes `dépend de` / `liées` affichent `#id titre (statut)`.
- **`list`** : format actuel conservé (déjà dense) ; `--json` ALLÉGÉ par défaut
  (id, title, status, team, stage, size — sans detail/consignation) ; `--json-full`
  pour l'intégral. Périmètre : `--json` est consommé par nos scripts/UI → vérifier
  les 2 call-sites avant de changer.
- **Erreurs auto-documentées** : toute erreur de flag imprime l'usage exact de la
  commande fautive (généraliser ce que fait déjà `--depends-on`).

### 3. Mini-tickets (`kind: quick`) — la moitié de la cérémonie en moins

- **Schéma** : champ optionnel `kind: task | quick` (absent = `task`, rétrocompat
  totale — aucun YAML existant ne change). Un quick : titre + team + stage suffisent ;
  detail/refs/deps/links facultatifs ; PAS de spec exigée ; au `done`, **outcome
  requis mais verification facultative** (pour un fix d'une ligne, l'outcome EST la
  vérification). Validation : quick interdit en size L (garde-fou : si c'est gros,
  c'est un ticket).
- **CLI** : `quick "<titre>" --team <t> [--stage <s>]` (stage par défaut : le premier
  stage open — Build aujourd'hui) ; `--start` enchaîne le start. Cycle complet visé :
  `quick "fix chevron" --team design --start` puis `done <id> --outcome "…"` —
  **2 commandes, ~120 tokens** contre ~700 aujourd'hui.
- **UI** : dans le Backlog, zone « Mini » compacte au-dessus de « À faire » — lignes
  ultra-denses (glyphe, id, titre, team), création inline (titre + team) dans
  l'en-tête de la zone. Les quick sont comptés dans les compteurs et le radar, mais
  ABSENTS du Graphe de la roadmap (bruit) ; visibles dans les colonnes.
- La file `next`/`take` sert les quick comme les tasks (même ordre stage+ancienneté).

### 4. Anti-exploration outillé (le contexte vit dans le ticket)

- `done` d'une `task` (pas quick) **sans refs → avertissement** non bloquant : « ticket
  sans refs = le prochain lecteur explorera » (discipline rendue visible, pas punitive).
- `brief` devient LA porte d'entrée d'exécution officielle du skill (remplace
  show --json dans les instructions de délégation).

### 5. Mesure avant/après (preuve, pas promesse)

- Scénario scripté rejoué avant/après (bootstrap + 1 ticket standard + 1 quick +
  1 navigation de liens), coût compté en ≈tokens (chars/4), consigné en tête de ce doc
  à la livraison. Cible globale : **−70 % sur la routine**.

## Hors périmètre (explicitement)

Serveur MCP dédié (piste future intéressante, hors sujet ici) ; compression des YAML
existants ; toute rupture de compat du schéma (kind est ADDITIF) ; le contenu des
références (seul le découpage change) ; caching côté agent.

## Critères de fini globaux

1. SKILL.md ≤ 50 lignes ; une session de routine ne lit aucune référence (vérifié en
   rejouant le cycle take→done dans un sandbox avec le nouveau skill).
2. `take` et `brief` livrent tout le contexte d'exécution en un appel (deps/links
   titrés) ; plus aucun `show` en cascade nécessaire.
3. Cycle quick complet en 2 commandes, YAML relu (kind, outcome sans verification
   accepté au done pour un quick uniquement).
4. UI : zone Mini fonctionnelle (création inline, done rapide), quick absents du Graphe.
5. Mesure avant/après publiée dans ce doc ; tests + build verts ; guide et skill alignés.
