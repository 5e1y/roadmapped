# Roadmapped — exécution, délégation à des subagents, garde-fous

## 3. Exécution

### En solo (toi, directement)

Cycle du SKILL.md : `take`/`next` → `start` → travailler → vérifier l'artefact → `done --commit --outcome --verification`. Plus les garde-fous transverses (§4).

### Déléguée (subagents — l'ex-subagent-driven-development)

Pour un chantier multi-tâches, dispatch **un subagent frais par tâche** :
- **Brief** = la sortie de `npx roadmapped brief <id>` + le chemin de la spec + les interfaces des tâches voisines. Rien d'autre (pas l'historique de session).
- **JAMAIS deux implémenteurs en parallèle** sur le même working tree. Le parallélisme, c'est des tâches sans deps dans des worktrees séparés — sinon séquentiel.
- **Verrou vs worktrees (#83)** : le verrou de mutation (`docs/tasks/.lock`) sérialise les écritures concurrentes DANS UN SEUL arbre de travail — plusieurs agents peuvent y écrire sans collision d'ids. Il ne garantit RIEN inter-branches : deux worktrees peuvent allouer le même id, révélé au merge de `_meta.yaml` (la validation refuse l'arbre fusionné). Doctrine : le multi-agent concurrent partage un arbre (le verrou fait le travail) ; les worktrees restent des chantiers isolés qui mergent leurs tickets comme du code, conflits d'ids compris.
- **Revue avant `done`** pour toute tâche M/L : un subagent reviewer frais, avec le diff (`git diff base..head` écrit dans un fichier, pas collé), qui rend deux verdicts — conformité à la tâche (rien de plus, rien de moins) ET qualité. Findings Critical/Important → fix → re-revue. C'est l'implémenteur (ou un fixeur) qui corrige, pas le reviewer.
- **Réception d'une revue** (dans les deux sens) : vérifier chaque finding contre le code RÉEL avant d'implémenter — jamais d'accord performatif (« tu as tout à fait raison ! »), jamais d'implémentation aveugle d'une suggestion non vérifiée.
- **Le suivi de progression = les statuts des tâches.** `in_progress` = dispatché, `done` + `verification` = revu et vérifié. Pas de fichier ledger parallèle : après une interruption, `list --status in_progress` + `git log` te remettent en selle.
- Choix de modèle : le moins puissant qui suffit (mécanique bien spécifiée → petit modèle ; intégration/jugement → moyen ; architecture/revue finale → le plus fort).

### Fin de chantier (l'ex-finishing-a-development-branch)

Quand toutes les tâches du chantier sont `done` : (1) relance la suite de tests COMPLÈTE + la vérification d'artefact — tests rouges = pas fini, point ; (2) propose à l'utilisateur exactement : **merger localement / pousser une PR / garder la branche / jeter** (jeter = confirmation explicite, jamais par défaut) ; (3) après merge, vérifie que chaque tâche du chantier est `done` avec `commit`/`outcome` consignés — le backlog done est le changelog.

## 4. Garde-fous transverses (versions courtes des disciplines superpowers)

- **TDD** quand la tâche crée de la logique : test rouge d'abord, code minimal pour le vert, puis refactor. Du code écrit avant son test se supprime et se réécrit — il ne se « garde pas en référence ».
- **Bug rencontré → cause racine AVANT tout fix** (instrumente, lis les vrais logs/artefacts, compare avec ce qui marche). Un fix sans cause comprise est interdit. **3 fixes ratés sur la même approche → STOP, remets l'approche en cause** — n'empile jamais une 4ᵉ rustine.
- **Aucune affirmation de succès sans preuve fraîche** : identifier la commande de vérification → l'exécuter → LIRE sa sortie → seulement ensuite affirmer. « Ça devrait marcher », « probablement bon » = interdits. Le rapport d'un subagent est une revendication, pas une preuve : vérifie le diff toi-même.
- **Branche de travail** : jamais de chantier multi-commits directement sur main sans accord explicite.
