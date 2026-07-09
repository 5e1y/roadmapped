# Jalons post-launch — décision à prendre (TL;DR)

**Date** : 2026-07-09 · **Statut** : DÉCISION EN ATTENTE (Rémi) · **Tâches** : #228 (brainstorm), #229 (ce doc)
**Doc complet** : `2026-07-09-jalons-post-launch-brainstorm.md` (6 options détaillées, tradeoffs, impacts)

Ce doc est le condensé actionnable. Le brainstorm complet est à côté.

## Le constat (backlog réel, 2026-07-09)

- **`04-build` = 74 % du backlog** (157 tâches, dont 152 done) → colonne fourre-tout / cimetière de done.
- **`07-scale` et `08-mature` = 0 tâche depuis toujours** → l'« après-launch » ne capte rien.
- **`next` trie primairement par stage** (`roadmap.ts` l.258) → le modèle de jalons pilote l'ordre servi aux agents. **Toucher aux stages = toucher à l'agent-first.** C'est la contrainte cœur.

Deux problèmes distincts : **(A) lisibilité** (Build indifférencié) et **(B) sémantique** (05→08 morts post-launch).

## Les 6 options

| | Option | Traite | Casse l'immuabilité | Coût |
|---|---|---|---|---|
| **A** | Vue only : découper Build par epic (méca déjà là) | lisibilité | Non | Faible |
| **B** | Réaffecter 07/08 en **boucles permanentes** (growth / maintenance) | sémantique | Presque pas (2 titres) | Faible |
| C | Deux modes launch / operate (Now·Next·Later) | les deux | de facto | Élevé |
| D | Axe « type » (feature/bug/chore) orthogonal | partiel | en esprit | Moyen |
| E | Buckets evergreen (refonte des 8) | tout | frontal (renie la thèse) | Élevé |
| F | Stages configurables par projet | tout | suppression de la règle | Moyen→cliquet |

## Reco : **A puis B** (séquencé)

- **A** : débloque la douleur immédiate, **risque nul** (regroupement par epic déjà écrit + testé, zéro migration, `validate.ts` intact).
- **B** : point d'équilibre — redonne vie à 05→08 et vide Build de son rôle fourre-tout **sans** rouvrir « quelles/combien de colonnes ». Nombre et slugs intacts, `next` déterministe préservé ; seul coût = 2 titres canoniques.
- **Écartées** : C (dédouble l'organisation, gros dev), E (renie « outil pour lancer »), F (tue le zéro-bikeshedding). Ce sont des « au cas où on change de produit », pas des « au cas où Build est gros ». **D** gardée en réserve si B ne suffit pas.

Premier pas concret (risque croissant) : A-epics proéminent + repli des done → consigne skill « post-launch le continu naît en 07/08 » → changer les 2 titres canoniques.

## Les 3 décisions qui reviennent à Rémi

1. **Ligne rouge** — on confirme qu'on **ne rouvre pas** « combien / quelles colonnes » (⇒ E et F hors-jeu) ? Ou tu veux pouvoir reconfigurer (autre débat, à assumer explicitement) ?
2. **Frontière build ↔ scale** — après le 1er launch, le travail continu naît en 07/08 plutôt qu'en 04-build : d'accord ? Et une grosse feature neuve sur produit lancé = build (0→1 local) ou scale ?
3. **Titres de 07/08** — OK pour « Scale / Mature » → p.ex. « Growth loop / Maintenance loop » (seul point qui touche `validate.ts`) ? Ou garder les titres et ne changer que leur *note* d'esprit ?

Questions secondaires (dans le brainstorm complet) : rétro-migration des 152 done (reco : laisser l'histoire tranquille), hygiène de vue « + N terminées », l'option « deux modes » comme vision long terme.

## Suite

Aucune ligne de code ni de stage touchée tant que Rémi n'a pas tranché. Sa direction → tickets d'implémentation (A d'abord).
