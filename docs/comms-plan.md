# Plan de communication — lancement open source de Roadmapped

**Statut : plan de travail (relu sous l'angle voix, #19).** Ton, canaux et prérequis sont
arrêtés ; les **objectifs chiffrés** (§Objectifs) restent des cibles à calibrer selon le
signal réel du J0 — pas des engagements. Domaine acquis : **roadmapped.work** (Cloudflare).

## Ton

Tout contenu de ce plan applique **docs/tone-of-voice.md** (direct, pince-sans-rire,
jamais négatif, transparence désarmante, anti-marketing assumé). Les angles ci-dessous
donnent le QUOI ; le guide de ton donne le COMMENT. En cas de doute : plus sec, plus
factuel, la chute à la fin.

## Positionnement du message

Une phrase, déclinée partout : **« Votre repo devient votre outil de gestion de projet —
piloté par votre agent IA, sans SaaS, sans base de données. »**

Trois preuves à l'appui, dans cet ordre :
1. **Agent-first, vraiment** : un CLI + un skill Claude qui savent créer specs, tâches et
   dépendances au bon format — et consigner ce qu'ils livrent (outcome, vérification,
   commit). L'app a été construite en se pilotant elle-même (dogfooding intégral, l'archive
   du repo en est la preuve publique).
2. **Fichiers plats** : YAML/markdown dans le repo, diffables, versionnés avec le code,
   éditables à la main. Zéro compte, zéro serveur distant, zéro lock-in.
3. **La roadmap qui raconte un lancement** : 8 stages fixes (Idea → Mature), états
   calculés (fait/disponible/verrouillé), dépendances façon arbre d'achievements.

Angle émotionnel pour les canaux founder : « j'ai construit l'outil avec l'outil, et mon
agent IA est le premier utilisateur ».

## Canaux et angles (J0 = jour du lancement coordonné)

| Canal | Angle | Langue | Quand |
|---|---|---|---|
| **Show HN** (Hacker News) | Local-first, no-SaaS, flat files ; le README technique fait le travail. Titre proposé : « Show HN: Roadmapped – project management as flat files in your repo, built for AI agents ». Premier commentaire : architecture (validation+rollback, ids immuables, états calculés), et l'histoire du dogfooding. | EN | J0 matin (16h-17h CET = matin US) |
| **Product Hunt** | Fiche produit : tagline « Your repo is already your project management tool » (alignée hero README/site), galerie = captures des 3 vues + GIF du cycle agent (next → start → done). | EN | J0 (00h01 PT) |
| **LinkedIn** (compte Rémi) | Récit founder FR : « j'ai lancé un outil open source en le pilotant avec lui-même » — le méta-récit, les leçons, le lien repo. Version EN en commentaire ou post séparé J+1. | FR puis EN | J0 midi |
| **Reddit r/ClaudeAI** | Le skill Claude : démo du cycle agent complet, setup en premier commentaire. | EN | J0 |
| **Reddit r/SideProject + r/opensource** | Le projet et sa licence MIT ; angle « construit en public par un agent ». | EN | J+1 (étaler pour éviter le cross-post spam) |
| **X/Twitter** | Thread : 1 idée par tweet, GIF du graphe de dépendances en ouverture. | EN | J0 |
| **Discord/forums Anthropic** | Partage skill + retour d'expérience workflow agent. | EN | J+1 |

Règle : chaque canal a SA formulation (pas de copier-coller cross-canal) ; les contenus
exacts sont le livrable de la tâche #20.

## Prérequis au J0 (bloquants, cf. dépendances des tâches)

Repo GitHub public avec CI verte et README à jour (#13, README fait #11) · site déployé sur
**roadmapped.work** via Cloudflare Pages (#18 — repo site branché par Rémi) · skill publié
sur le marketplace (#15) · captures/GIF frais du dashboard poli (dépend de #134, capture
obsolète) · ce plan approuvé.

## Objectifs mesurables à J+7 (proposition à calibrer)

- 200+ stars GitHub (signal HN réussi ; <50 = le message n'a pas pris)
- 30+ installs du skill (métrique marketplace si disponible, sinon proxy : clones du repo)
- 1 000+ visiteurs uniques sur le site (Plausible)
- 10+ issues/discussions ouvertes par des tiers (le vrai signal d'adoption)
- 3+ retours qualitatifs exploitables convertis en tâches backlog

## Règles de réponse aux commentaires (48 premières heures)

- Répondre à TOUT commentaire substantiel en <2h pendant les 48h (HN surtout : la
  conversation fait le ranking).
- Critique technique fondée → remercier, convertir en tâche backlog, répondre avec l'id
  de la tâche créée (la transparence EST le produit).
- Demande de feature → « c'est trackable dans Roadmapped » + lien vers le backlog public.
- Jamais de défensive ; ton factuel, montrer le fichier/le commit plutôt qu'affirmer.
- Rémi porte les réponses founder (LinkedIn, HN) ; les réponses techniques peuvent être
  préparées en draft par l'agent.

## Bilan J+7 (à remplir après le lancement — définition de fini de #21)

_Métriques réelles vs objectifs, enseignements, décisions pour la suite._
