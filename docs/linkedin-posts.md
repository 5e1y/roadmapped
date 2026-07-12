# Posts LinkedIn — banque de contenus FR (build-in-public)

**Statut : drafts prêts à publier, à relire par Rémi.** Applique `docs/tone-of-voice.md`
à la lettre (direct, pince-sans-rire, jamais négatif, transparence désarmante,
anti-marketing assumé, la chute sèche à la fin, précision maniaque des chiffres).

Ces posts viennent **après** le post de lancement J0 (déjà rédigé dans
`docs/announce-content.md` §3). Objectif : une banque à distiller au rythme d'un post
par semaine ou deux, chacun autonome, chacun un angle différent. Ne pas tout publier
d'un coup — un post LinkedIn qui respire vaut mieux qu'une rafale.

> **Chiffres à re-vérifier avant publication** (snapshot 2026-07-08) : 145 tâches au
> backlog, 139 livrées · 373 tests · 8 stages fixes. La précision est le gag — donc
> elle doit être exacte le jour J. Mettre à jour d'un `npx roadmapped sitrep` avant post.

---

## Post 1 — L'agent est un meilleur employé que moi

```
Mon outil de gestion de projet a un employé modèle. Ce n'est pas moi.

C'est un agent IA. Il prend la prochaine tâche déverrouillée, la livre, et
consigne le résultat : ce qu'il a fait, comment il l'a vérifié, le commit
associé. À chaque fois. Sans que je le lui demande.

Moi, je note les choses « plus tard ». Vous connaissez « plus tard ».

Roadmapped, c'est un dossier de fichiers YAML dans votre repo qui devient votre
outil de gestion de projet, piloté par votre agent via un CLI et un skill Claude.
Le point que je n'avais pas prévu en le construisant : l'agent respecte le
process mieux que son auteur. J'ai écrit les règles. Il les suit. Je les
contourne.

C'est vexant, et open source.
```
*Commentaire : lien repo + « le backlog est public, vous pouvez vérifier que je dis vrai ».*

---

## Post 2 — Le hook git qui me refuse des commits

```
J'ai écrit un garde-fou qui refuse tout commit non rattaché à une tâche.

Je l'ai écrit pour tenir l'agent IA honnête. Statistiquement, c'est moi qu'il
corrige le plus souvent.

Le principe de Roadmapped : chaque changement du repo = une tâche tracée. Pas
« la plupart des changements ». Chaque changement. Un hook vérifie, et si vous
committez à l'arrache, il vous arrête. Y compris quand « vous », c'est le type
qui a écrit le hook, un mardi, en pensant que cette fois c'était différent.

Ce n'est pas de la discipline. C'est de l'application. Les deux ont l'air
pareil de loin ; seule la seconde fonctionne quand personne ne regarde.

Fichiers plats, zéro serveur, MIT. Lien en commentaire.
```
*Commentaire : lien repo + `git hook` visible dans le repo.*

---

## Post 3 — Il n'y a pas de base de données

```
Roadmapped n'a pas de base de données. Ce n'est pas un oubli.

Vos tâches sont des fichiers YAML. La roadmap est calculée à la lecture depuis
les dépendances — jamais stockée, donc jamais désynchronisée. La documentation,
c'est votre dossier docs/. L'historique d'audit, c'est votre historique git.
Supprimer vos données, c'est rm -rf. Le RGPD n'a rien trouvé à redire, parce
qu'il n'y a rien à trouver.

« Mais où sont mes données ? » Chez vous. Sur votre machine. Dans votre repo.
Pas par conviction militante sur la souveraineté numérique — on n'a simplement
pas de serveur où les envoyer.

Oui, c'est un dossier de fichiers. Non, ce n'est pas une base de données.
C'est un peu le sujet.
```
*Commentaire : lien repo + site.*

---

## Post 4 — Construit en se pilotant lui-même

```
J'ai construit un outil de gestion de projet en le gérant avec lui-même.

Dès la deuxième semaine, le backlog de Roadmapped était géré par Roadmapped.
Chaque feature de l'outil a une tâche dans l'outil. « Ajouter le graphe de
dépendances » est une tâche livrée, avec son commit, dans le graphe de
dépendances. Ça devient récursif assez vite.

À l'heure où j'écris : 145 tâches au backlog, 139 livrées. L'historique du repo
raconte la construction de l'outil, commit par commit, avec une honnêteté que
je trouve personnellement excessive. Vous voulez savoir si le workflow tient la
route ? Lisez le backlog. Il est public. C'est le seul argument de vente que je
trouve honnête : la preuve est le produit.

C'est gratuit et c'est du code.
```
*Commentaire : lien direct vers le backlog du repo.*

---

## Post 5 — Ce que j'ai appris en me faisant gérer par un side project

```
Trois choses que j'ai apprises en laissant un agent IA gérer mon projet à ma
place.

1. Un agent est un meilleur citoyen du process qu'un humain. Il consigne
   l'outcome, la vérification et le commit à chaque tâche. Moi, je consigne
   « quand j'aurai le temps ».

2. L'application bat l'intention. Un hook qui refuse les commits hors-tâche fait
   plus pour la rigueur que toutes mes bonnes résolutions réunies. Les
   résolutions, on les prend le 1er janvier. Le hook, il tape toute l'année.

3. La transparence coûte moins cher que le reporting. Le backlog est public dans
   le repo. Personne ne me demande de point d'avancement — le dossier EST le
   point d'avancement.

Je ne prétends pas que ça va changer votre façon de travailler. C'est un
dossier. Mais c'est un dossier qui m'a appris trois trucs, ce qui est trois de
plus que la plupart de mes dossiers.
```
*Commentaire : lien repo.*

---

## Post 6 — L'anti-fiche produit

```
Pas de page de tarifs. Pas de « contactez le service commercial ». Pas de
plan Entreprise avec un astérisque.

Roadmapped est gratuit, sous licence MIT, et le restera — non par générosité,
mais parce que je n'ai pas de serveur à financer, donc pas de coût à répercuter,
donc rien à vous facturer. L'économie de la chose est d'un ennui total, et c'est
exactement ce que vous voulez d'un outil qui gère votre travail.

Installation : npm install. Il n'y a pas d'étape 2. On a vérifié.

Je devrais sans doute écrire ici une phrase qui vous pousse à cliquer. La voici :
c'est des fichiers YAML dans un dossier. Si ça vous parle, le lien est en
commentaire. Sinon, bonne continuation, sincèrement.
```
*Commentaire : lien repo + site.*

---

## Post 7 — Le méta-post (à garder pour plus tard)

```
Ce post est un post marketing. Je préfère vous le dire tout de suite.

Je vais vous parler d'un outil que j'ai construit, avec l'espoir à peine voilé
que vous alliez le regarder. C'est la définition d'un post marketing. La seule
différence, c'est que je vous le dis.

L'outil s'appelle Roadmapped. Il transforme votre repo en outil de gestion de
projet — fichiers plats, piloté par votre agent IA, sans SaaS. J'en ai déjà
parlé ici sous plusieurs angles, chacun soigneusement calibré pour avoir l'air
de ne pas vendre tout en vendant. Vous l'avez remarqué. Je l'ai remarqué que
vous l'aviez remarqué. On est entre adultes.

Alors voilà, sans détour : c'est bien, c'est gratuit, c'est open source, le lien
est en commentaire. Aucune newsletter ne vous attend au tournant.

Merci d'avoir lu un post qui admet être ce qu'il est. C'est plus rare que ça ne
devrait.
```
*Commentaire : lien repo + site.*

---

## Post 8 — Roadmapped × Graphify : visualiser la codebase

```
Jusqu'ici, Roadmapped vous montrait vos tâches. Maintenant, il vous montre
aussi votre code.

On a branché Graphify. Si vous ne connaissez pas : c'est un outil open source
qui dessine la carte d'un repo. Quels fichiers existent, ce qu'il y a dedans,
et comment tout ça se parle. 82 000 étoiles sur GitHub. On n'allait pas le
réécrire.

Cette carte vit maintenant dans le dashboard, à côté de vos tâches. Et les deux
sont reliées : chaque ticket sait quels fichiers il concerne, et l'agent qui
prend la tâche reçoit ce plan avant de commencer. Il va droit au bon endroit au
lieu de fouiller tout le repo. Chez nous, ça fait jusqu'à 70 % de tokens
d'exploration en moins.

Rien à remplir, rien à maintenir. Le lien se calcule tout seul depuis ce que
les tickets contiennent déjà.

Vos tâches d'un côté, votre code de l'autre, un trait entre les deux. C'est une
carte. Mais c'est une très bonne carte.
```
*Commentaire : lien repo + capture de la carte (onglet Knowledge base).*
*Visuel recommandé : capture du graphe KB dans le dashboard (dark), ou split
tâches/codebase côte à côte.*
*Chiffres à re-vérifier le jour J : les étoiles Graphify (82,2 k au 2026-07-11)
et le 70 % (estimation skill, garder le « jusqu'à »).*

---

## Notes d'usage

- **Cadence** : 1 post / 1-2 semaines. L'ordre suggéré ci-dessus va du plus
  concret (l'agent, le hook) au plus méta (posts 6-7) — garder les méta pour
  quand l'audience connaît déjà l'outil.
- **Lien en commentaire** : convention LinkedIn (le lien dans le corps pénalise
  la portée). Assumé et raillé dans plusieurs posts — ne pas retirer la blague.
- **Visuel** : un post sur deux gagne à porter un visuel — capture du dashboard
  (backlog groupé + radar), ou GIF du cycle agent (next → start → done). Réutiliser
  les captures fraîches produites pour la homepage.
- **Version EN** : chaque post peut se décliner en anglais (voir le style du post
  EN J+1 dans `docs/announce-content.md` §3b). À faire post-lancement si la
  traction anglophone le justifie.
