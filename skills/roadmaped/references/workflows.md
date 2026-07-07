# Roadmaped — les 3 workflows (l'équivalent superpowers, dashboard en prime)

Le cycle de vie complet d'une feature : **Idée → Spec → Tâches → Exécution → Fin de branche**. Chaque étape a son gate. Le dashboard rend tout visible (backlog, roadmap, docs) — il n'y a AUCUN autre fichier de suivi à tenir.

## 1. Idée → Spec (brainstorming)

**HARD-GATE : zéro ligne de code, zéro tâche créée, avant une spec approuvée par l'utilisateur.** Même pour un projet « simple » — c'est là que les hypothèses non examinées coûtent le plus.

1. Explore d'abord le contexte réel (code, docs, tâches existantes via `list`).
2. Questions **une par une** (choix multiples de préférence) : but, contraintes, critères de fini. Jamais un mur de questions.
3. Propose **2-3 approches** avec trade-offs et ta recommandation en tête.
4. Présente le design **section par section**, validation à chaque section.
5. Écris la spec (`docs/specs/AAAA-MM-JJ-<sujet>.md`) : contexte, décisions ET alternatives écartées, périmètre / hors-périmètre explicites, critères de fini.
6. **Self-review de la spec** avant de la montrer : placeholders (« TBD », section vide) ? contradictions internes ? ambiguïté (deux lectures possibles → tranche et explicite) ? scope (un seul chantier, sinon découpe) ?
7. L'utilisateur relit et approuve LA SPEC (pas ton résumé). Ensuite seulement : les tâches.

## 2. Spec → Tâches (l'ex-writing-plans)

Un « plan » Roadmaped = des tâches chaînées. La granularité : **une tâche = un livrable testable indépendamment**, qu'un exécuteur sans contexte peut prendre via `show <id> --json` + la spec en `refs`.

**Le champ `detail` porte ce qu'un plan portait.** Pour chaque tâche :
- QUOI et POURQUOI, les fichiers exacts à créer/modifier, l'approche décidée.
- Les interfaces que les tâches voisines attendent (signatures, noms — l'exécuteur ne voit que SA tâche).
- La définition de fini : quelle commande, quel artefact observé.
- **Interdits absolus** : « TBD », « à compléter », « gérer les erreurs correctement », « comme la tâche N » sans le contenu. Si tu ne peux pas l'écrire précisément, la spec n'est pas finie — remonte.

**Ordre et parallélisme** : `--depends-on` encode l'ordre RÉEL (A doit exister pour B). Ce qui peut se faire en parallèle n'a PAS de dépendance entre soi — c'est ce que la vue Graphe montre (colonnes = sections, cartes disponibles = front de travail). Ne chaîne pas artificiellement.

**Après création** : `roadmap` doit montrer un front de départ sensé (les premières tâches disponibles) et une fin claire. Sinon le découpage est faux.

## 3. Exécution

### En solo (toi, directement)

Cycle du SKILL.md : `next` → `start` → travailler → vérifier l'artefact → `done --commit --verification`. Plus les garde-fous transverses (§4).

### Déléguée (subagents — l'ex-subagent-driven-development)

Pour un chantier multi-tâches, dispatch **un subagent frais par tâche** :
- **Brief** = la sortie de `show <id> --json` + le chemin de la spec + les interfaces des tâches voisines. Rien d'autre (pas l'historique de session).
- **JAMAIS deux implémenteurs en parallèle** sur le même working tree. Le parallélisme, c'est des tâches sans deps dans des worktrees séparés — sinon séquentiel.
- **Revue avant `done`** pour toute tâche M/L : un subagent reviewer frais, avec le diff (`git diff base..head` écrit dans un fichier, pas collé), qui rend deux verdicts — conformité à la tâche (rien de plus, rien de moins) ET qualité. Findings Critical/Important → fix → re-revue. C'est l'implémenteur (ou un fixeur) qui corrige, pas le reviewer.
- **Réception d'une revue** (dans les deux sens) : vérifier chaque finding contre le code RÉEL avant d'implémenter — jamais d'accord performatif (« tu as tout à fait raison ! »), jamais d'implémentation aveugle d'une suggestion non vérifiée.
- **Le suivi de progression = les statuts des tâches.** `in_progress` = dispatché, `done` + `verification` = revu et vérifié. Pas de fichier ledger parallèle : après une interruption, `list --status in_progress` + `git log` te remettent en selle.
- Choix de modèle : le moins puissant qui suffit (mécanique bien spécifiée → petit modèle ; intégration/jugement → moyen ; architecture/revue finale → le plus fort).

### Fin de chantier (l'ex-finishing-a-development-branch)

Quand toutes les tâches du chantier sont `done` : (1) relance la suite de tests COMPLÈTE + la vérification d'artefact — tests rouges = pas fini, point ; (2) propose à l'utilisateur exactement : **merger localement / pousser une PR / garder la branche / jeter** (jeter = confirmation explicite, jamais par défaut) ; (3) après merge, `archive` les tâches du chantier — l'archive est le changelog.

## 4. Garde-fous transverses (versions courtes des disciplines superpowers)

- **TDD** quand la tâche crée de la logique : test rouge d'abord, code minimal pour le vert, puis refactor. Du code écrit avant son test se supprime et se réécrit — il ne se « garde pas en référence ».
- **Bug rencontré → cause racine AVANT tout fix** (instrumente, lis les vrais logs/artefacts, compare avec ce qui marche). Un fix sans cause comprise est interdit. **3 fixes ratés sur la même approche → STOP, remets l'approche en cause** — n'empile jamais une 4ᵉ rustine.
- **Aucune affirmation de succès sans preuve fraîche** : identifier la commande de vérification → l'exécuter → LIRE sa sortie → seulement ensuite affirmer. « Ça devrait marcher », « probablement bon » = interdits. Le rapport d'un subagent est une revendication, pas une preuve : vérifie le diff toi-même.
- **Branche de travail** : jamais de chantier multi-commits directement sur main sans accord explicite.
