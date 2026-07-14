# Roadmapped : le gestionnaire de projet qui a tenu son propre backlog, 317 tâches closes en 8 jours

Création d'un gestionnaire de projet flat-file pour agents IA : 4 vues, 30 composants, 322 tâches auto-gérées en 8 jours.

## Les chiffres

| Indicateur | Valeur |
|---|---|
| Durée de développement | 8 jours (7 au 14 juillet 2026) |
| Tâches gérées par l'outil lui-même | 322, dont 317 terminées (98 %) |
| Vues du dashboard | 4 : backlog, roadmap, docs, bloc-notes |
| Composants React construits | 30 |
| Interfaces d'accès | 3 : CLI (19 commandes), dashboard, serveur MCP (17 outils) |
| Types de tâches, fixes par design | 9 |
| Releases publiées | 5, dont 3 correctives après le lancement |
| Commits · tests automatisés | 514 · 598 |
| Infrastructure serveur | 0 (fichiers YAML versionnés dans le repo) |

## L'essentiel

Roadmapped est un outil de gestion de projet open source où les tâches sont des fichiers YAML dans le repo, pilotés par un agent IA via une CLI, un dashboard local et un serveur MCP. Je l'ai conçu et construit seul en 8 jours, en binôme avec un agent Claude, pour les développeurs qui travaillent avec des agents. Le produit s'est géré lui-même pendant sa construction : ses 322 tâches sont l'historique réel du projet. Publié sur npm et GitHub, licence MIT.

## Un agent IA ne peut pas cliquer dans Jira, mais il lit des fichiers

Les outils de gestion de projet vivent hors du repo : un compte, une synchronisation, un onglet de plus. Quand un agent IA écrit une part croissante du code, ça ne tient plus : l'agent ne peut pas cliquer dans une interface SaaS. Chez moi, le résultat était concret : le suivi n'était pas tenu, les décisions se perdaient entre le code et l'outil.

Les solutions existantes exigent une API et un compte, ou bien, côté fichiers TODO, n'offrent aucune structure exploitable par un agent. Il manquait un outil qui vive là où l'agent travaille déjà.

## Les fichiers sont la base de données, git est le journal d'audit

Le pari : tout mettre dans le repo. Les tâches sont des fichiers YAML sous `docs/tasks/`, la suppression de compte c'est `rm -rf`. J'ai choisi de ne pas construire de serveur, de compte ni de base de données. Le coût est réel : pas de collaboration temps réel, pas de vues croisées entre repos. Mais chaque pièce d'infrastructure aurait éloigné l'outil de son utilisateur principal, l'agent, qui ne sait rien faire de mieux que lire et écrire des fichiers.

Deuxième renoncement : pas de champs libres. 9 types de tâches fixes, non renommables, et une priorité calculée (une « température » : blocages en aval, âge, chaleur du type) plutôt que triée à la main. Un agent n'arbitre bien que dans un cadre fermé.

## Éditer sans jamais basculer : des inputs permanents camouflés en texte

L'architecture de l'information découle des 9 types : le backlog est une vue en 9 colonnes fixes, une par nature de travail, et le détail d'une tâche s'ouvre en panneau latéral, sans navigation, pour garder les colonnes sous les yeux. La roadmap est un graphe de dépendances (layout automatique, zoom, surlignage amont-aval au survol) : la priorité étant calculée, la vue montre les chaînes de blocage plutôt qu'un classement. Les docs du repo et un bloc-notes complètent les 4 vues.

Pour l'édition, j'ai rejeté deux patterns : l'icône crayon et le remplacement lecture-vers-input au clic, qui créent un état intermédiaire et un saut de mise en page. À la place, chaque champ est un input permanent camouflé en texte (composants Base UI) : titre, détail, notes s'éditent là où ils se lisent, avec un état « enregistré » discret et un état d'erreur si l'écriture échoue. Le bloc-notes pousse la logique jusqu'au bout : un clic dans le vide crée une note, l'éditeur est ouvert en permanence.

L'identité tient dans une mascotte, un oiseau pixel-art de 16 × 12 pixels en 4 couleurs, animé image par image sur canvas et figé si le système demande une réduction des animations. Un mode démo en lecture seule, à données embarquées, sert de visite du produit sur le site.

## L'agent a écrit l'essentiel du code, le garde-fou a écrit l'histoire

Stack : TypeScript, React et Vite pour le dashboard, Node pour la CLI et le serveur MCP. Le workflow IA, en trois couches. Accéléré : l'agent a écrit l'essentiel du code et des 598 tests, d'où 64 commits par jour. Rendu possible : le knowledge graph embarqué de 1 844 nœuds et les animations de la mascotte, hors de portée en solo sur 8 jours. Arbitré : j'ai rejeté les patterns d'édition proposés, relu chaque décision produit, et posé le garde-fou central, un hook git qui refuse tout commit non rattaché à une tâche en cours.

L'impasse réelle : la distribution. Le 9 juillet, j'ai retiré npm pour ne distribuer que via GitHub. Deux jours plus tard, je l'ai réintroduit avec publication automatique par CI, parce que le modèle GitHub seul cassait la détection de mise à jour d'une partie des installations.

## Trois releases correctives en trois jours, et une dette assumée

Les versions 0.2.1 à 0.2.3 sont sorties dans les trois jours suivant le lancement, dont un correctif pour un bouton « installer et redémarrer » mort après auto-update. Une dette reste ouverte et publique : les installations via le registre npm ne détectent pas encore les mises à jour.

Trois leçons. Un garde-fou outillé tient mieux qu'une discipline : le commit refusé sans tâche a fait ce qu'aucune bonne résolution n'avait fait. Un cadre fermé (types fixes, priorité calculée, écriture par CLI seulement) rend un agent fiable là où un outil flexible le rend bavard. Le dogfooding intégral sert de test d'intégration : chaque bug d'usage devenait un ticket dans l'outil.

Le backlog reste ouvert, et c'est lui qui décide de la suite.

*Repo : [github.com/5e1y/roadmapped](https://github.com/5e1y/roadmapped) · Site : [roadmapped.dev](https://roadmapped.dev)*
