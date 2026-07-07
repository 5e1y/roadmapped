# Spec — Économie radicale de tokens : l'app porte le contexte, l'agent consomme

**Date** : 2026-07-07 · **Statut** : APPROUVÉE par Rémi le 2026-07-07 (carte blanche)
**Demande** : Rémi (carte blanche) · **Données** : dogfooding intégral de cette session
(45+ tâches livrées en pilotant Roadmaped avec Roadmaped).

## Mesure avant/après (livrée, #68)

Scénario « routine » rejoué dans les deux mondes, coût compté en ≈tokens
(caractères/4, arrondi à la dizaine). **AVANT** = `git show` du SKILL.md/références
d'avant le commit `dffd595` (skill noyau) + sorties réelles des commandes
d'alors (`next`/`show`/`start`/`done` séparés, cérémonie complète). **APRÈS** =
sorties réelles des commandes actuelles (`take`/`brief`/`quick`, SKILL.md noyau
seul). Détail du calcul et des commandes exécutées : voir §5.

| Poste | AVANT (≈tokens) | APRÈS (≈tokens) | Réduction |
|---|---|---|---|
| Bootstrap session (SKILL.md + 3 références → SKILL.md noyau seul) | 6 990 | 1 000 | **−85,7 %** |
| Ticket standard (`next`+`show`+`start`+`done` → `take`+`done`) | 500 | 280 | **−44,0 %** ⚠ |
| Mini-changement (`add`+`start`+`done --verification` → `quick`+`done --outcome`) | 230 | 70 | **−69,6 %** ⚠ (sous la cible) |
| Navigation de liens (ids nus → liens titrés dans `show`) | 970 | 270 | **−72,2 %** |
| **Total (somme des 4 postes)** | **8 690** | **1 620** | **−81,4 %** |

Honnêteté du chiffre : la cible de −70 % est **atteinte globalement** (−81,4 %),
mais **pas poste par poste**. Le ticket standard ne gagne que −44 % : `show 28`
(1 123 car.) et `brief 28` (1 074 car.) sont d'une densité quasi identique — le
gain de `take` vient du nombre d'allers-retours évités (3 commandes → 1), pas
d'une sortie plus courte. Le mini-changement (`quick`) est à −69,6 %, sous la
barre des −70 % visée par la spec (les deux commandes `quick`/`done` restent
elles-mêmes verbeuses : usage, confirmations). Le poste qui porte l'essentiel du
gain global est le bootstrap (85,7 %, 6 990 des 8 690 tokens AVANT) — c'est lui
qui tire le total au-dessus de la cible, pas une amélioration uniforme.

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

### 5. Mesure avant/après (preuve, pas promesse) — LIVRÉE #68

- Scénario scripté rejoué avant/après (bootstrap + 1 ticket standard + 1 quick +
  1 navigation de liens), coût compté en ≈tokens (chars/4), consigné en tête de ce doc.
  **Résultat réel : −81,4 % global** (tableau en tête de doc). Poste par poste :
  bootstrap −85,7 %, navigation de liens −72,2 %, mini-changement −69,6 %
  (sous la cible), ticket standard −44,0 % (sous la cible — le gain de `take` est
  dans le nombre d'allers-retours évités, pas dans la taille des sorties, déjà
  denses des deux côtés).

**Méthode et sources** (reproductible) :
  - AVANT SKILL.md + références : `git show dffd595~1:skills/roadmaped/SKILL.md`
    (9 199 car.) + `references/workflows.md` (6 201) + `references/formats.md`
    (7 262) + `references/setup.md` (5 289) — dernière version avant le commit
    `dffd595` (« skill noyau 50 lignes »). APRÈS : `skills/roadmaped/SKILL.md`
    actuel seul (4 008 car.).
  - Ticket standard AVANT : sortie réelle de `next` (825 car., a servi #16) +
    `show 28` (1 123 car.) + messages types `start`/`done`
    (`#28 démarrée (in_progress).` 29 car. · `#28 terminée (done).` 21 car.).
    APRÈS : `#28 démarrée.` (15 car., 1re ligne de `take`) + sortie réelle de
    `brief 28` (1 074 car.) + message type `done` (21 car.).
  - Mini-changement AVANT/APRÈS : messages types représentatifs des deux
    cérémonies (`add --detail "…"` ~380 car. de detail + réponse + `start` +
    `done --verification "…"` = 916 car. total AVANT ; `quick "…" --team … --start`
    + réponses + `done --outcome "…"` = 290 car. total APRÈS).
  - Navigation de liens : `show 68` actuel (1 065 car., liens titrés) = coût APRÈS
    complet. AVANT = même contenu + 2 `show` supplémentaires (~1 400 car. chacun,
    moyenne observée) qu'un ancien format à ids nus aurait forcés pour identifier
    les tâches liées.

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

## Annexe — pistes v2 (inspiration ponytail, à chiffrer après la v1)

Ponytail économise en changeant le COMPORTEMENT du modèle ; Roadmaped peut économiser
en supprimant le BESOIN de savoir. Claude de base, sur un repo de cette taille, brûle
8 000-20 000 tokens par session à reconstruire le contexte (greps, lectures, historique
git). Chaque mécanisme ci-dessous remplace une catégorie d'exploration par une sortie
d'app :

1. **L'échelle de décision** (le ladder ponytail, transposé) — écrite dans le noyau du
   skill : « ce changement mérite-t-il d'exister ? → un quick ? → un task ? → une
   spec ? » Stop au premier barreau qui tient. (Formalisation de la v1.)
2. **Extraits de refs dans `brief`** : une ref → le brief joint les ~10 lignes autour
   (l'app lit le fichier AU MOMENT DU SERVE — le contenu est toujours le code actuel).
   Une lecture complète (~2 500 tokens) devient un extrait (~100). Le plus gros
   gisement. ⚠ Risque identifié (Rémi) : l'ANCRE peut dériver (la ligne 120 ne pointe
   plus le bon symbole après un refactor voisin) → deux parades obligatoires :
   (a) ancrage par SYMBOLE (`fichier#nextQueue`, résolu par grep au serve — les `:ligne`
   restent permis mais documentés fragiles) ; (b) drapeau de fraîcheur : si le fichier
   a été modifié APRÈS la création du ticket (un `git log -1 -- fichier`), l'extrait
   est servi avec « ⚠ modifié depuis la création du ticket » — confiance vérifiée,
   jamais aveugle. Le drapeau vaut pour TOUTES les refs, extraits ou pas.
3. **`sitrep`** : l'état du monde en ~30 lignes (done du jour, in_progress, 3 prochaines,
   validate) — remplace la relecture du backlog en début de session (~1 200 → ~150).
4. **`done` auto-contextué** : l'app remplit `commit` (HEAD) et SUGGÈRE les refs depuis
   le diff — l'agent confirme au lieu de lire git.
5. **Le ledger de dette = les quick eux-mêmes** : un raccourci assumé se trace en quick
   taggé `#debt` avec l'outcome qui nomme le plafond (l'équivalent des commentaires
   `ponytail:` — mais requêtable : `list --tag debt`).
6. **Serveur MCP** (déjà noté hors périmètre) : les commandes deviennent des tools aux
   schémas auto-documentés — plus de bash à formater, plus de sorties parasites, et le
   schéma de tool REMPLACE la doc du CLI dans le contexte.

Cible v2 cumulée : une session Roadmaped coûte MOINS cher que la même session sur un
repo nu — l'outil de gestion de projet devient un économiseur net de tokens.

## Annexe 2 — modèle de coût réel d'un agent (pour arbitrer les implémentations)

1. **Écrire ≈ 5× lire, et RÉFLÉCHIR est facturé comme écrire** (raisonnement = sortie
   invisible, non réutilisée d'un tour à l'autre) → toute décision pré-calculée par
   l'app supprime la classe de tokens la plus chère.
2. **Lire est un loyer, pas un prix** : le contexte est retransmis à chaque tour ;
   une sortie CLI de 1 200 tokens se repaie × tours restants → les sorties denses
   rapportent bien plus que leur économie apparente. Le token le moins cher est
   celui qui n'entre jamais dans le contexte.
3. **Chaque appel d'outil retransmet toute la conversation** → réduire les
   allers-retours (take = 1 commande au lieu de 3) est le levier le plus violent.
4. **Le cache aime la stabilité de préfixe** (~10× moins cher) → noyau de skill
   STRICTEMENT stable : aucun contenu dynamique, aucune date générée.

Hiérarchie de rentabilité : allers-retours > taille des sorties > lectures >
réflexion pré-calculée > stabilité cache.
