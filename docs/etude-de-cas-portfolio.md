# Roadmapped : l'outil de gestion de projet qui a tenu son propre backlog, 316 tâches closes en 8 jours

Création d'un gestionnaire de projet flat-file piloté par agent IA : 321 tâches auto-gérées, 512 commits, 8 jours.

## Les chiffres

| Indicateur | Valeur |
|---|---|
| Durée de développement | 8 jours (7 au 14 juillet 2026) |
| Tâches gérées par l'outil lui-même | 321, dont 316 terminées (98 %) |
| Commits | 512, soit 64 par jour en moyenne |
| Tests automatisés | 599, répartis sur 41 fichiers |
| Code applicatif | 19 227 lignes de TypeScript |
| Releases publiées | 5, dont 3 correctives après le lancement |
| Nœuds du knowledge graph embarqué | 1 844 |
| Infrastructure serveur | 0 (fichiers YAML versionnés dans le repo) |

## L'essentiel

Roadmapped est un outil de gestion de projet open source où les tâches sont des fichiers YAML dans le repo, pilotés par un agent IA via une CLI, une skill Claude et un serveur MCP. Je l'ai conçu et construit seul en 8 jours, en binôme avec un agent Claude, pour les développeurs qui travaillent avec des agents. Le produit s'est géré lui-même pendant sa construction : ses 321 tâches sont l'historique réel du projet. Publié sur npm et GitHub, licence MIT.

## Un agent IA ne peut pas cliquer dans Jira, mais il lit des fichiers

Les outils de gestion de projet vivent hors du repo : un compte, une synchronisation, un onglet de plus. Quand un agent IA écrit une part croissante du code, ça ne tient plus : l'agent ne peut pas cliquer dans une interface SaaS, et le contexte projet reste hors de sa portée. Chez moi, le résultat était concret : le suivi n'était pas tenu, les décisions se perdaient entre le code et l'outil.

Les solutions existantes exigent une API et un compte, ou bien, côté fichiers TODO, n'offrent aucune structure qu'un agent puisse exploiter de façon fiable. Il manquait un outil qui vive là où l'agent travaille déjà.

## Les fichiers sont la base de données, git est le journal d'audit

Le pari : tout mettre dans le repo. Les tâches sont des fichiers YAML sous `docs/tasks/`, répartis en 9 types fixes, avec une priorité calculée plutôt que triée à la main. La suppression de compte, c'est `rm -rf`.

J'ai choisi de ne pas construire de serveur, de compte ni de base de données. Le coût est réel : pas de collaboration temps réel, pas de vues croisées entre plusieurs repos. Chaque pièce d'infrastructure ajoutée aurait éloigné l'outil de son utilisateur principal, l'agent, qui ne sait rien faire de mieux que lire et écrire des fichiers. Autre renoncement : pas d'édition libre des YAML, toute écriture passe par la CLI, qui valide le format.

## 512 commits en 8 jours, chacun rattaché à une tâche de l'outil lui-même

Stack : TypeScript, React et Vite pour le dashboard, Node pour la CLI et le serveur MCP. L'architecture tient en trois règles : la CLI est la seule interface d'écriture, le dashboard ne fait que lire, et un hook git refuse tout commit qui n'est pas rattaché à une tâche en cours.

Côté interactions : pour l'édition dans le dashboard, j'ai rejeté le pattern icône-crayon et le remplacement lecture-vers-input au clic. Les champs sont des inputs permanents camouflés en texte (composants Base UI) ; l'édition est directe, sans état intermédiaire ni saut de mise en page.

Le workflow IA, en trois couches. Accéléré : l'agent a écrit l'essentiel des 19 227 lignes et des 599 tests, d'où les 64 commits par jour. Rendu possible : le knowledge graph de 1 844 nœuds et les 5 animations image par image de la mascotte pixel art, hors de portée en solo sur 8 jours. Arbitré : j'ai rejeté des patterns d'édition proposés, relu chaque décision produit, et posé le garde-fou central, le commit refusé sans tâche consignée.

L'impasse réelle : la distribution. Le 9 juillet, j'ai retiré npm pour ne distribuer que via GitHub. Deux jours plus tard, je l'ai réintroduit avec publication automatique par CI, parce que le modèle GitHub seul cassait la détection de mise à jour d'une partie des installations. Le pivot est documenté dans le backlog.

## Une CLI, un dashboard local et un serveur MCP, installés en une commande

`npx roadmapped` couvre la création, la planification et la clôture des tâches. Le dashboard local affiche la roadmap et l'avancement, calculés depuis les fichiers. La skill Claude et le serveur MCP permettent à un agent de gérer le projet en langage naturel, knowledge graph compris. Distribution : npm et GitHub, licence MIT, auto-update intégré. Le produit est en usage réel au sens propre : c'est lui qui gère son propre repo depuis le deuxième jour de développement.

## Trois releases correctives en trois jours, et une dette assumée dans le backlog

Les versions 0.2.1 à 0.2.3 sont sorties dans les trois jours suivant le lancement : liens externes corrigés, puis un bouton « installer et redémarrer » mort après auto-update, à double cause (un conflit 409 et un port perdu au redémarrage). Une dette reste ouverte et publique : les installations via le registre npm ne détectent pas encore les mises à jour (tâche #337).

Trois leçons. Un garde-fou outillé tient mieux qu'une discipline : le commit refusé sans tâche a fait ce qu'aucune bonne résolution n'avait fait. Un agent multiplie la vélocité seulement si la boucle de consignation suit, sinon il multiplie le désordre. Le dogfooding intégral sert de test d'intégration : chaque bug d'usage devenait un ticket dans l'outil.

Le backlog reste ouvert, et c'est lui qui décide de la suite.

*Repo : [github.com/5e1y/roadmapped](https://github.com/5e1y/roadmapped) · Site : [roadmapped.dev](https://roadmapped.dev)*
