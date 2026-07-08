# Roadmapped — d'une idée à des tâches prêtes à exécuter

Le cycle de vie d'une feature, avant exécution : **Idée → Spec → Tâches**. Chaque étape a son gate. Le dashboard rend tout visible (backlog, roadmap, docs) — il n'y a AUCUN autre fichier de suivi à tenir.

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

Un « plan » Roadmapped = des tâches chaînées. La granularité : **une tâche = un livrable testable indépendamment**, qu'un exécuteur sans contexte peut prendre via `brief <id>` + la spec en `refs`.

**Chaque tâche choisit un stage (le QUAND) et une team (le QUI).** Le stage (`--section`, un des 8 fixes idea→mature) place la tâche dans la séquence de lancement produit — les stages SONT les jalons, pas besoin de section ou jalon dédié à créer. La team (`--team`, enum fixe) dit quelle équipe métier la porte. Les deux sont requis à la création (`add`), aucune tâche active n'en est dispensée.

**Le champ `detail` porte ce qu'un plan portait.** Pour chaque tâche :
- QUOI et POURQUOI, les fichiers exacts à créer/modifier, l'approche décidée.
- Les interfaces que les tâches voisines attendent (signatures, noms — l'exécuteur ne voit que SA tâche).
- La définition de fini : quelle commande, quel artefact observé.
- **Interdits absolus** : « TBD », « à compléter », « gérer les erreurs correctement », « comme la tâche N » sans le contenu. Si tu ne peux pas l'écrire précisément, la spec n'est pas finie — remonte.

**Ordre et parallélisme** : `--depends-on` encode l'ordre RÉEL (A doit exister pour B). Ce qui peut se faire en parallèle n'a PAS de dépendance entre soi — c'est ce que la vue Graphe montre (colonnes = stages, cartes disponibles = front de travail). Ne chaîne pas artificiellement.

**Contrôle final** : `roadmap` doit montrer un front de départ sensé (les premières tâches disponibles) et une fin claire. Sinon le découpage est faux.
