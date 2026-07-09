# Brainstorm — Jalonner par TYPE DE TÂCHE (fusion stage + team, sans axe temporel)

**Date** : 2026-07-09 · **Statut** : BRAINSTORM (détaille la direction DÉCIDÉE, ne la re-débat pas) · **Tâche** : #230 (suite de #228)
**Auteur** : instance Fable 5, mode idéation · **Décideur** : Rémi
**Réfs lues** : `docs/specs/2026-07-09-jalons-post-launch-brainstorm.md`, `docs/specs/2026-07-07-stages-teams.md`,
`src/lib/tasks.ts`, `src/lib/validate.ts`, `src/lib/roadmap.ts`, `src/components/RoadmapColumns.tsx`, `src/components/EpicRow.tsx`

> La direction est tranchée : plus d'axe temporel, des colonnes par type de tâche, un seul axe qui
> remplace stage ET team. Ce document ne propose PAS de revenir en arrière — il fait marcher le
> modèle : le set de types, la règle de classement, la migration, le nouveau tri de `next`, et le
> nœud des epics multi-colonnes. Aucun code n'est écrit, rien n'est migré.

---

## 1. Le modèle décidé, reformulé

1. **Le TEMPS sort du modèle.** La flèche idea→mature disparaît. « Launch the app public »,
   « Go to market » ne sont pas des étapes qu'on traverse : ce sont des **EPICS** — des
   regroupements transverses de tâches, exactement comme `token-economy` ou `design-system`
   aujourd'hui. Le récit d'un lancement devient un epic parmi d'autres, pas l'ossature de l'outil.

2. **Les colonnes du dashboard = des TYPES DE TÂCHE.** Ce qui jalonne la Roadmap n'est plus
   « où en est-on », mais « de quelle nature est ce travail ».

3. **UN SEUL AXE.** Le type fusionne le stage (dossier, le « quand ») et la team (enum, le
   « qui ») en une seule chose : la **nature** du travail. Les teams disparaissent en tant qu'axe.

4. **Un type n'est PAS une team.** marketing, legal, communication, design sont des natures de
   tâche, pas des équipes : « créer un logo » est de type **design** (personne ne demande dans
   quelle équipe c'est) ; « créer des posts LinkedIn » est de type **communication**, ça ne part
   dans aucune « team Communication ». Chaque tâche porte **LE** type de sa nature dominante — un
   seul, pas de croisement à deux axes, pas de « bug marketing ».

5. **Le point dur assumé** : un epic (« lancement ») aura des tâches dans plusieurs colonnes
   (bug + feature + design + communication + legal). Le §6 est entièrement consacré à ce nœud.

Ce que ce modèle achète, dit en une phrase : les colonnes redeviennent **toutes vivantes en
permanence** (aucune colonne « fin de vie » vide, aucun cimetière `04-build` à 74 %) parce
qu'aucune colonne n'est un moment — chacune est une nature de travail qui existe du premier jour
au dernier.

---

## 2. Le jeu canonique de TYPES

### 2.1 Sanity-check de la liste de Rémi contre le backlog réel

Liste proposée : **bug, feature, brainstorm, marketing, design, communication, legal,
finance & sales** (8). Confrontée aux 213 fichiers de tâches réels (croisement stage×team + tags) :

| Travail réel observé | Couvert par la liste ? |
|---|---|
| 98 eng en `04-build` + 11 en `06-launch` : features produit | ✅ feature |
| tags `bug` (9) : régressions, écrans blancs, fix | ✅ bug |
| tags `debt` (11) + `refactor` (5) + `process` (9) + CI/deps/tooling/migrations | ❌ **trou** : ni bug (rien n'est cassé) ni feature (aucune capacité nouvelle) |
| tags `spec` (16) + brainstorms (#228, #230…) : réflexion, décisions | ✅ brainstorm |
| 59 design (logo, design system, UX, pixel-art) | ✅ design |
| 19 marketing (copy site, SEO, GTM, homepage) | ✅ marketing |
| posts, annonces, communauté GitHub, lancement coordonné | ✅ communication |
| 5 legal (CGU, RGPD, licences) | ✅ legal |
| 0 finance, 0 sales aujourd'hui — mais pricing/billing/compta viendront | ✅ finance & sales |
| 5 support (`06-launch`) : mettre en place le support, y répondre | ⚠️ ambigu (voir 2.3) |
| 1 operations : infra/déploiement | ❌ même trou que debt/refactor |

**Verdict** : la liste est bonne mais pas complète côté dev. `bug` + `feature` ne couvrent pas
~12 % du travail engineering réel (dette, refactor, tooling, CI, deps, migrations, monitoring).
Sans un type pour ça, deux dérives garanties : soit `feature` redevient le fourre-tout que
`04-build` était, soit les agents forcent des refactors en « bug » et le mot perd son sens.

### 2.2 Le set final proposé — 9 types, fixes

| Dossier | Slug | Titre | Esprit (note canonique) |
|---|---|---|---|
| `01-bug` | bug | Bugs | Quelque chose est cassé ou ne se comporte pas comme promis — produit, site, outil, peu importe la surface. |
| `02-feature` | feature | Features | Du code/du produit qui ajoute une capacité visible pour l'utilisateur. |
| `03-chore` | chore | Chores | Du code/de l'infra qui n'ajoute rien de visible : refactor, dette, deps, CI, tooling, migrations, monitoring. |
| `04-brainstorm` | brainstorm | Brainstorms | Réfléchir avant de faire : specs, recherches, benchmarks, décisions, plans. |
| `05-design` | design | Design | Artefacts visuels et d'expérience : logo, maquettes, design system, illustrations, UX. |
| `06-marketing` | marketing | Marketing | Acquérir : site, copy, SEO, campagnes, positionnement, growth. |
| `07-communication` | communication | Communication | Parler au monde : posts, annonces, newsletter, changelog public, communauté, support aux users. |
| `08-legal` | legal | Legal | Conformité et juridique : CGU, RGPD, licences, contrats, structure, dépôts. |
| `09-business` | business | Business | L'argent et les clients en direct : pricing, facturation, compta, prospection, deals, partenariats. |

Choix par rapport à la liste de Rémi, justifiés :

- **+ `chore`** — le seul ajout. Motivé chiffres en main (2.1). C'est le prix pour que `bug` et
  `feature` restent des mots honnêtes. Sans lui, le modèle échoue sur les 74 % du backlog qu'il
  est censé rendre lisibles.
- **`finance & sales` → slug `business`** — un slug, pas deux mots : `finance-sales` est laid en
  dossier, en flag CLI et en badge. « business » couvre finance, sales, pricing, partenariats,
  compta — et absorbe la part « paperasse d'entreprise » de l'ex-team operations. Si Rémi tient au
  libellé, le **titre** peut rester « Finance & Sales » avec le slug `business` (le titre canonique
  et le slug sont déjà deux choses distinctes dans `STAGES`).
- **Pas de type `support`, `ops`, `docs`, `research`, `content`** — chacun se dissout proprement :
  support→communication (répondre aux users, c'est leur parler) ou feature (construire l'outillage
  support) ; ops→chore (infra) ou business (paperasse) ; docs→feature (doc produit embarquée) ou
  communication/marketing (publiée) ; research→brainstorm ; content→marketing ou communication
  selon l'intention (règle §3). Neuf types suffisent à tout ranger sans reste ; en ajouter, c'est
  diluer.
- **L'ordre des colonnes** (`01`→`09`) est un ordre d'AFFICHAGE canonique, fixe, et RIEN d'autre :
  il n'encode aucune priorité (voir §5 — c'est crucial). Logique retenue : le code d'abord
  (bug/feature/chore, le gros volume), la pensée, le visuel, puis les natures orientées dehors.
  Rémi peut permuter, c'est cosmétique — mais une fois figé, on ne le rediscute plus.

**MECE ?** Mutuellement exclusif grâce à la règle de classement (§3, premier match gagne) ;
collectivement exhaustif : les 213 tâches réelles trouvent toutes un dossier (table §4.3), et les
8 teams actuelles se projettent toutes (engineering→bug/feature/chore/brainstorm, design→design,
marketing→marketing/communication, sales+finance→business, legal→legal, support→communication/feature,
operations→chore/business).

### 2.3 Le cas chaud assumé : support

Le support est le seul travail réel qui n'a pas de maison évidente. Position proposée : **pas de
10e type**. Construire le support (help center, email, outillage) = feature ; répondre et animer =
communication. Si l'usage prouve un jour que le volume support déborde ces deux cases, l'ajout
d'un type est une décision produit versionnée (§7) — pas une raison de gonfler le set aujourd'hui
pour 5 tâches.

---

## 3. La règle de CLASSEMENT — choisir LE type sans hésiter

### 3.1 Le principe

**Le type d'une tâche = la nature de son LIVRABLE, pas le but qu'elle sert ni la personne qui la
fait.** C'est exactement la correction de Rémi : un logo sert le marketing, mais son livrable est
un artefact visuel → design. Des posts LinkedIn servent le lancement, mais leur livrable est du
contenu publié → communication.

### 3.2 L'arbre de décision (premier match gagne — déterministe pour un agent)

1. **Quelque chose est cassé** (régression, comportement non conforme à ce qui est promis),
   quelle que soit la surface — produit, site marketing, CLI, doc → **bug**.
2. Le livrable est **un document de réflexion ou une décision** (spec, brainstorm, recherche,
   benchmark, plan stratégique) → **brainstorm**.
3. Le livrable est **un artefact visuel/UX** (logo, maquette, design system, illustration,
   pixel-art, direction artistique) → **design**.
4. Le livrable est **juridique** (CGU, privacy, licence, contrat, dépôt de marque, structure
   de la société) → **legal**.
5. Le livrable touche **l'argent ou des clients en direct** (pricing, billing côté offre, compta,
   prospection, deal, partenariat) → **business**.
6. Le livrable est **du contenu tourné vers dehors** :
   - il vise l'**acquisition durable** (page du site, copy, SEO, campagne, asset de growth) → **marketing** ;
   - il **informe ou anime** (post, annonce, newsletter, changelog public, réponse à un user,
     animation de communauté) → **communication**.
7. Sinon, c'est du code/du produit :
   - ça **ajoute une capacité visible** à l'utilisateur (doc produit embarquée comprise) → **feature** ;
   - ça n'en ajoute pas (refactor, dette, deps, CI, tooling, migration, monitoring) → **chore**.

L'ordre de l'arbre EST le tie-break : une tâche qui pourrait matcher deux règles prend la plus
haute. « Réparer le formulaire de la landing » matche 1 avant 6 → bug. « Spec du pricing » matche
2 avant 5 → brainstorm.

### 3.3 Les cas limites, traités honnêtement

| Tâche | Type | Pourquoi |
|---|---|---|
| Bug sur le site marketing | **bug** | Règle 1 avant tout : cassé = bug, la surface ne compte pas. Symétrique du logo→design de Rémi : la nature bat le but. |
| « Écrire la doc » (guide produit, README) | **feature** | Doc embarquée = capacité visible du produit (règle 7a). |
| Article de blog technique | **marketing** ou **communication** | Règle 6 : pensé pour le SEO/l'acquisition → marketing ; billet d'humeur/annonce → communication. |
| Créer un logo | **design** | Exemple canonique de Rémi (règle 3). |
| Page pricing du site | **marketing** | Copy/acquisition (règle 6a). Mais « implémenter le paiement Stripe » → feature (7a), et « définir la grille tarifaire » → business (5). |
| Créer la structure juridique | **legal** | Règle 4 (paperasse de conformité), même si le but est business. |
| Mettre en place l'email de support | **feature** | On construit une capacité (7a). Y répondre chaque semaine → communication (6b). |
| Migrer la CI vers GitHub Actions | **chore** | Rien de visible (7b). |
| Un `kind: milestone` transverse (« App publique ») | le type de son **geste final** | Un jalon vit dans une colonne comme tout le monde ; « annoncer le launch » → communication, « v1 sur les stores » → feature. La transversalité, c'est le job de l'EPIC, pas du jalon. |

La règle tient en 7 lignes ; elle va telle quelle dans `skills/roadmapped/` (formats.md) et dans
la note de chaque `_section.yaml` — un agent l'applique sans jugement esthétique.

---

## 4. Modèle de DONNÉES + MIGRATION

### 4.1 Le principe : le type EST le dossier (comme le stage aujourd'hui)

Fichiers-first inchangé dans sa mécanique : **`docs/tasks/<NN-type>/` remplace
`docs/tasks/<NN-stage>/`**, et le champ `team` **disparaît du schéma**. Aucun champ `type:` dans
le YAML : le dossier fait foi, exactement comme le stage aujourd'hui. Un seul axe, un seul
emplacement, zéro redondance à désynchroniser.

- **`tasks.ts`** : `STAGES` → `TYPES` (9 entrées `{slug, title, note}`, même forme) ; `Team`,
  `TEAMS`, `TEAM_ABBR` et le champ `team` de `TaskNode` supprimés ; `SectionNode` inchangé
  (key = `01-bug`…). Le badge de carte affiche… rien de nouveau : la colonne dit déjà le type ;
  hors Roadmap (Backlog, panneau, brief agent), un chip `bug`/`dsgn`/`comm` reprend la place du
  chip team (mêmes composants).
- **Préfixes `NN-`** : **conservés**. Toute la machinerie trie par `numericPrefix`
  (`assembleSections`, `stageOf` dans `nextQueue`, `epicAnchorStage`) ; garder le préfixe = ordre
  d'affichage déterministe sans nouvelle source de vérité, migration minimale. À assumer dans la
  doc : le numéro est un ordre d'affichage, plus une chronologie. (Alternative : dossiers nus +
  tri par index de `TYPES` — plus joli, plus de code à toucher ; je ne le recommande pas.)
- **`validate.ts`** : mêmes invariants, nouvelle constante — exactement 9 dossiers canoniques,
  titre de `_section.yaml` = titre canonique, et **rejet de `team:`** sur toute tâche active
  (précédent : la suppression stricte de `zone` en 2026-07-07 ; l'archive n'est pas re-validée et
  garde ses `team:`).
- **`_section.yaml`** : conserve `title`/`status`/`note`. Le statut `done` d'une section devient
  sans objet (un TYPE ne « se termine » jamais) — on garde l'enum tel quel (rétrocompat, et
  `dormant` reste utile : un projet sans travail legal estompe la colonne), mais le skill cesse de
  parler de « stage traversé ».
- **`_meta.yaml`, ids, epics** : **intouchés**. Les ids sont globaux et réservés à vie, `nextId`
  ne bouge pas, les slugs d'epics vivent sur les tâches et dans `_epics.yaml` — le déménagement
  des fichiers ne les concerne pas. Le champ `file` de chaque tâche est recalculé au parse.
- **CLI/MCP/API** : `--team` disparaît (erreur « flag inconnu », comme `--zone` avant lui) ;
  `--section` prend les nouveaux slugs ; alias `--type` recommandé (c'est le mot du modèle).
  `list --team` → `list --type`. Le brief agent remplace `Team :` par `Type :` (= la section).
- **Rétrocompat externe** : pour les repos utilisateurs déjà en 8 stages, prévoir une commande
  `roadmapped migrate` (le script de 4.4, industrialisé) — le validate refusera leurs dossiers du
  jour au lendemain sinon. À trancher : combien de repos existent réellement (early) ; a minima un
  message d'erreur de validate qui POINTE vers la migration.

### 4.2 Ce que devient chaque brique d'affichage

`RoadmapColumns` rend 9 colonnes au lieu de 8 (même grille, mêmes cartes, mêmes vides estompés) ;
`GlobalProgress` reste un done/total global mais son libellé cesse de dire « lancement » ; la barre
de progression d'une colonne devient « santé du type » (bugs : 3 ouverts / 47 traités — soudain
très parlante) ; le filtre team de la sidebar devient un filtre type (mêmes compteurs, même
persistance) — ou disparaît, puisque les colonnes LE montrent déjà : à trancher en design.

### 4.3 La table de migration (ancien stage × team → type)

Réalité mesurée : 213 fichiers de tâches (sous-tâches comprises ; 211 tâches de premier niveau),
187 done / 24 ouvertes. La projection est **interprétative** : la team seule ne suffit pas
(engineering se départage en bug/feature/chore/brainstorm). Mapping mécanique par défaut, puis
revue ciblée :

| Ancien (stage × team) | Vol. | Type par défaut | Raffinement mécanique (tags/kind) |
|---|---:|---|---|
| * × design | 59 | **design** | — |
| * × engineering | 124 | **feature** | tag `bug` → bug ; tags `debt`/`refactor`/`process`/`cli`/`data-model` → chore ; tags `spec`/`brainstorm` → brainstorm ; tags `docs`/`publish`/`open-source`/`github` → revue |
| * × marketing | 19 | **marketing** | tags `publish`/posts/annonces → communication (revue) |
| 06-launch × legal | 5 | **legal** | — |
| 06-launch × support | 5 | **communication** | outillage support → feature (revue) |
| 04-build × operations | 1 | **chore** | — |
| 05-gtm × marketing | 3 | **marketing** | le « lancement coordonné » → communication |

L'information de stage ne meurt pas toute : les tâches de `06-launch` reçoivent l'epic `lancement`
si elles n'en ont pas (le récit de launch continue de vivre — porté par l'epic, comme le veut le
modèle), et `01-idea`/`02-initial`/`03-identity` se dispatchent par nature (idée/validation →
brainstorm ; repo/structure → chore/legal ; brand/domaine → design/marketing).

### 4.4 Le process de migration

1. **Script jetable** (précédent : la migration stages-teams de 2026-07-07) : déplace chaque
   fichier vers son dossier-type (mapping 4.3 + raffinement tags), supprime la ligne `team:`,
   crée les 9 `_section.yaml` canoniques, déplace `_archive/` en miroir, écrit un **rapport
   diff** listant chaque tâche avec `ancien chemin → nouveau + règle appliquée`.
2. **Revue humaine ciblée** : les 24 tâches OUVERTES une par une (c'est elles que `next` servira),
   plus les lignes marquées « revue » du rapport. Les 187 done migrent mécaniquement sans
   agonie — c'est de l'histoire, masquée par défaut ; une done mal classée ne coûte rien.
3. `roadmapped validate` vert, captures/doc/skill mis à jour, un commit unique.

Coût estimé honnête : le script est trivial (déplacement + YAML), la revue des ouvertes = une
heure de Rémi, le gros du coût est dans skill + doc + site marketing (§8).

---

## 5. Le NOUVEL ordre de `next` — remplacer la flèche du temps

### 5.1 Le problème, à sa vraie taille

`nextQueue` trie aujourd'hui `a.stage - b.stage || a.id - b.id` : **le stage est LE critère
primaire** — la flèche temporelle EST la politique de priorité, gratuitement. En la supprimant, on
ne perd pas une colonne : on perd **la réponse à « quoi d'abord ? »** que l'outil servait aux
agents sans qu'aucun humain n'ait rien à prioriser. C'est le vrai risque du modèle, et un ordre de
remplacement est non négociable : `next` doit rester déterministe, calculé par l'app, consommé
bêtement par le skill.

Options examinées :

- **(a) Ordre des types** (une tâche bug avant une feature avant…) — séduisant car « gratuit »
  comme le stage, mais FAUX : le type n'encode aucune urgence (tous les bugs ne sont pas urgents,
  un brainstorm peut être la tâche la plus critique du moment). Et ça transformerait l'ordre
  cosmétique des colonnes en politique de priorité → bikeshedding maximal sur l'ordre du set.
  **Écarté.**
- **(b) FIFO pur (id croissant)** — déterministe et déjà le tie-break actuel, mais aucune main :
  une vieille tâche moisie squatte la tête de file pour toujours, et le seul remède serait de la
  supprimer/recréer. **Insuffisant seul.**
- **(c) Champ `priority` explicite** — réintroduit exactement la cérémonie que Roadmapped a
  toujours refusée : un champ de plus à poser sur CHAQUE tâche, à débattre, à laisser pourrir.
  **Écarté.**
- **(d) L'EPIC porte l'ordre** — `_epics.yaml` est déjà une liste ORDONNÉE dont l'ordre est
  préservé par `allEpics` (déclarés d'abord, dans l'ordre du fichier). Personne n'exploite cet
  ordre. En faire LA priorité : prioriser = réordonner une liste de ~10 lignes, pas noter 200
  tâches.
- **(e) `dependsOn`/milestones** — porte déjà l'ordre FIN (le graphe verrouille ce qui doit
  attendre) ; orthogonal et conservé tel quel (`computeAvailability` ne bouge pas).

### 5.2 La résolution proposée : l'ordre des epics remplace l'ordre des stages

```
nextQueue = tâches todo disponibles (inchangé), triées par :
  1. rang de l'epic de la tâche dans _epics.yaml   (epics déclarés, ordre du fichier)
  2. les epics NON déclarés après les déclarés     (ordre alphabétique du slug — déterministe)
  3. les tâches SANS epic en dernier
  4. tie-break : id croissant                       (inchangé)
```

Pourquoi c'est la bonne forme :

- **Même géométrie que l'ancien monde** : un critère primaire structurel (rang d'epic ↔ rang de
  stage) + le même tie-break (id). Le skill ne change pas de contrat : il consomme `next` sans
  recalculer. Déterminisme intact, agent-first intact.
- **La priorité redevient un geste ÉDITORIAL UNIQUE, fichiers-first** : réordonner `_epics.yaml`
  (10 lignes) au lieu de prioriser 211 tâches. C'est le pendant exact de la philosophie du
  produit : une décision, un fichier, pas un champ par objet. Et ça donne enfin un rôle de
  premier plan à un fichier qui n'était que cosmétique (titres).
- **Cohérent avec le modèle de Rémi** : si « Launch the app public » est un epic, alors « le
  launch d'abord » s'exprime en mettant cet epic en tête de liste — le récit de priorité que la
  flèche donnait revient, mais choisi au lieu d'imposé.
- **L'urgence a un chemin naturel** : un epic `hotfix` (ou n'importe quel nom) en tête de
  `_epics.yaml`, et taguer une tâche dedans la fait doubler toute la file. Pas de champ priority,
  pas de type spécial.
- **Hors-epic en dernier = une incitation saine** : le travail important vit dans un epic (ou
  verrouille via dependsOn) ; le one-off sans rattachement est par définition le moins urgent.
  Les `quick` vivent très bien là.

Coûts assumés : (1) `_epics.yaml` devient obligatoire-en-pratique pour prioriser — la migration
l'ordonne UNE fois à la main (l'epic `lancement` en tête, vraisemblablement) et le skill documente
« prioriser = réordonner ce fichier » ; (2) un epic non déclaré est servi après les déclarés —
c'est voulu (déclarer = prioriser), mais à dire clairement dans le skill ; (3) au sein d'un même
epic, l'ordre reste id croissant — si un ordre interne fin est nécessaire, `dependsOn` le fait
déjà (et c'est sa vraie sémantique).

---

## 6. L'AFFICHAGE des epics multi-colonnes — le nœud

### 6.1 Pourquoi le mécanisme actuel meurt avec le temps

L'ancrage actuel (`epicAnchorStage`) choisit « le stage du ticket non terminé le plus AMONT » —
une notion qui n'existe QUE parce que les colonnes sont ordonnées temporellement (« l'epic en est
là dans la flèche »). Avec des types, « le plus amont » ne veut rien dire : feature n'est pas
« avant » communication. Le mécanisme (`groupByEpicAnchored`, dé-dup, « n tasks here », complétion
globale) survit ; c'est **la règle d'ancrage** qui n'a plus de sémantique. Trois pistes, dans le
modèle de Rémi :

### 6.2 Piste 1 — Ancrage adapté : l'epic vit dans SA colonne majoritaire

Garder exactement l'architecture actuelle (une carte-groupe d'epic dans UNE colonne, dépliage =
tout l'epic, « n here », complétion globale), en remplaçant la règle : **ancre = la colonne qui
contient le plus de membres non terminés** (tie-break : ordre canonique des types, puis plus
petit id). Un epic 100 % done s'ancre sur sa colonne majoritaire tout court.

- ✅ Coût quasi nul : ~15 lignes dans `epicAnchorStage`, tout le reste (`groupByEpicAnchored`,
  `EpicCardGroup`, dé-dup #140-B) est réutilisé tel quel. Un epic = UNE carte, pas de répétition.
- ❌ L'ancre est **arbitraire** : l'epic « lancement » (3 communication + 2 legal + 2 feature)
  atterrit en communication — pourquoi ? Et il **saute de colonne** quand la majorité bascule au
  fil des done. La carte-groupe mélange dans une colonne « bug » des membres design et legal :
  la promesse « cette colonne = cette nature » se salit exactement là où on regarde.

### 6.3 Piste 2 — La bande d'EPICS au-dessus des colonnes (transversal affiché transversal)

Assumer la géométrie du modèle : les types sont VERTICAUX, les epics sont HORIZONTAUX. La Roadmap
gagne une **bande d'epics** en tête (une rangée de cartes horizontale, sticky) : chaque carte =
titre + complétion globale (`epicProgress`, existant) + **pastilles par type** (« 3 bug · 2 design
· 1 legal », comptées sur ses membres non-done). Cliquer une carte **filtre les 9 colonnes sur cet
epic** (re-clic = tout). Dans les colonnes, plus AUCUNE carte-groupe : des tâches à plat, chacune
chez son type — `groupByEpicAnchored` sort de la Roadmap (il reste au Backlog, où il marche bien).

- ✅ Résout le nœud **par construction** : plus d'ancrage à choisir, donc plus d'ancrage faux.
  L'epic est montré pour ce qu'il est devenu dans ce modèle : une tranche transversale.
- ✅ Rejoue le récit perdu : la bande d'epics EST la nouvelle roadmap-récit (« lancement : 14/31,
  reste 2 legal et 1 communication ») — précisément ce que Rémi troque contre la flèche.
- ✅ Réutilise beaucoup : `allEpics`, `epicProgress`, `epicStatusOf`, la barre de progression, le
  langage de chips ; le filtre = un `useState` + un `.filter()` par colonne.
- ❌ Un vrai chantier UI (nouvelle bande, densité à ~20 epics — prévoir le repli des epics done
  comme au Backlog) ; deux niveaux de lecture sur un même écran.

### 6.4 Piste 3 — Séparer les deux questions : onglet « Epics » + Board par types

Deux vues : la Roadmap actuelle devient un **Board par types** (exécution pure, tâches à plat) ;
un onglet **Epics** raconte le projet — une `EpicRow` par epic (composant existant, dépliage,
progression, renommage), dans l'ordre de `_epics.yaml` (= l'ordre de priorité du §5, joli
alignement : la vue Epics EST la file de priorité rendue lisible).

- ✅ Chaque vue répond à UNE question (« sur quoi bosser ? » / « où en sont les chantiers ? ») ;
  réutilisation maximale d'`EpicRow` ; zéro problème d'ancrage.
- ❌ Une vue de plus à maintenir ; recouvre partiellement le Backlog (qui groupe déjà par epic) ;
  et l'écran Roadmap, seul, perd toute trace des epics — il faut changer d'onglet pour le récit.

### 6.5 Recommandation

**Piste 2, en cible — livrée en deux temps via la Piste 1.** La Piste 2 est la seule qui traite le
nœud au lieu de le déplacer : dans un modèle où les colonnes sont des natures, forcer un objet
transversal DANS une colonne sera toujours faux quelque part ; la bande le montre transversal, et
rachète au passage le récit de launch. La Piste 1 sert d'étape de livraison : elle permet de
shipper la migration (dossiers, validate, next) sans bloquer sur l'UI — l'ancrage majoritaire est
médiocre mais fonctionne — puis la bande remplace les cartes-groupes dans une itération dédiée.
La Piste 3 reste dans la poche si l'usage montre que la bande surcharge l'écran : elle en est la
version « dépliée sur deux onglets ».

---

## 7. Fixe vs configurable

**FIXE, immuable, même régime que les 8 stages.** C'est la force n°1 du modèle actuel (zéro
bikeshedding — le brainstorm #228 et la spec 2026-07-07 le documentent) et elle est INDÉPENDANTE
de ce que les colonnes signifient : elle tenait au fait qu'on ne débat jamais des colonnes, pas au
fait qu'elles étaient temporelles. La rendre configurable au moment précis où on change leur sens
serait cumuler deux révolutions. Concrètement : `TYPES` en dur dans `tasks.ts`, validation stricte
(exactement 9 dossiers, titres canoniques), interdiction explicite dans le skill de créer/renommer
un type — copie conforme du régime actuel. Si un type manque un jour (support ?), c'est une
décision produit versionnée qui embarque sa migration — jamais une config par projet.

Le corollaire : le set du §2 doit être choisi avec soin UNE fois, maintenant — c'est la seule
fenêtre de bikeshedding, elle se referme au merge.

---

## 8. Ce qu'on PERD / les risques — honnêtement

1. **La roadmap-récit-de-launch** (assumé par Rémi). La séquence universelle idea→mature était
   l'identité marketing du produit (« un outil pour lancer un produit », spec 2026-07-07). Elle
   devient un epic parmi d'autres. Rachat partiel par la bande d'epics (§6.3) — mais le pitch du
   site, les captures, le README racontent aujourd'hui la flèche : **le repositionnement
   marketing fait partie du chantier**, pas seulement le code (le site vit dans
   `5e1y/roadmapped-site`, chantier séparé à ticketer).
2. **La dimension « qui »**. bug/feature/chore ne sont pas des fonctions métier : le radar
   « charge par team » du Backlog devient « volume par nature » — on sait qu'il y a 12 bugs, plus
   qu'il y a « trop sur les épaules du marketing ». Pour un solo founder outillé d'agents, la
   team était déjà largement fictive (98 % des tâches eng/design faites par les mêmes mains) —
   perte faible ICI, réelle le jour où Roadmapped vise des équipes humaines. Si ce jour vient, le
   « qui » devra revenir comme métadonnée d'assignation (assignee), PAS comme axe de colonnes —
   à noter pour ne pas re-fusionner ce qu'on vient de défusionner.
3. **Les notes d'esprit / best practices par stage** (starter kit #12) perdent leur colonne
   vertébrale narrative (« au stage Identity, pense à… »). Transposables par type (checklist
   legal, hygiène bug) mais le séquencement pédagogique (« quoi faire en premier quand on
   lance ») doit re-vivre ailleurs — vraisemblablement dans des epics-templates du starter kit.
4. **La progression globale change de sens.** « 187/211 du lancement » devient un done/total
   toutes natures — un nombre qui ne finit jamais (les types ne se terminent pas). La barre de
   tête raconte moins ; c'est la complétion PAR EPIC qui hérite du rôle « on avance vers quoi ».
5. **Coût de migration réel** : 213 fichiers déplacés (renames git, refs de specs vers
   `docs/tasks/04-build/...` cassées dans les textes), skill + formats + setup + workflows
   réécrits, captures et doc refaites, CLI/MCP/API (`--team`→`--type`), et la question des repos
   utilisateurs existants (validate cassant → `roadmapped migrate` obligatoire).
6. **Le risque de re-fourre-tout** : `feature` hérite structurellement du rôle de `04-build`
   (le plus gros volume). Mitigé par chore/bug/brainstorm qui le découpent (mesuré : ~30 % de
   l'ex-engineering part ailleurs) et par la bande d'epics qui porte la lisibilité — mais si dans
   six mois `feature` = 70 % du backlog, ce sera le signal que la lisibilité vit dans les epics,
   pas dans les types, et qu'il ne faudra PAS résoudre ça en ajoutant des types.
7. **Un coût de décision par tâche** : choisir entre marketing et communication (ou feature et
   chore) est un micro-arbitrage que le stage n'imposait pas aussi souvent. L'arbre §3.2 le rend
   mécanique, mais il vivra ou mourra par sa présence dans le skill — et une tâche mal classée
   coûte peu (elle reste trouvable par epic, tag, recherche).

---

## 9. Questions ouvertes pour Rémi

1. **Le set** : valides-tu l'ajout de **`chore`** (sinon `feature` redevient le fourre-tout que tu
   fuis — les chiffres du §2.1 sont têtus) et le slug **`business`** pour « finance & sales »
   (titre affiché libre) ? Et l'absence d'un type `support` (dissous dans communication/feature) ?
2. **L'ordre de `next`** : OK pour « l'ordre de `_epics.yaml` remplace l'ordre des stages » ?
   C'est LE nouveau geste de priorisation (réordonner ~10 lignes) — il faut que tu le sentes,
   c'est lui qui remplace la flèche. Et : hors-epic en dernier, ça te va ?
3. **L'affichage** : bande d'epics au-dessus des colonnes (Piste 2) en cible, ancrage majoritaire
   (Piste 1) comme étape de livraison — ou tu préfères sauter directement à la cible ?
4. **Préfixes `NN-`** sur les dossiers de types : on garde (machinerie intacte, numéro = ordre
   d'affichage) ou tu veux des dossiers nus (plus propre, plus de code à toucher) ?
5. **Migration des done** : mécanique sans revue (187 tâches, c'est de l'histoire masquée par
   défaut) — confirmé ? La revue humaine ne porte que sur les 24 ouvertes + les cas « revue » du
   rapport.
6. **Les repos externes** : y a-t-il déjà des utilisateurs en 8 stages dans la nature ? Ça décide
   entre « doc de migration » et « commande `roadmapped migrate` dans le CLI » (et le ton du
   message d'erreur de validate).
7. **L'ordre des colonnes** (pur affichage, dernier appel avant gel) : `bug, feature, chore,
   brainstorm, design, marketing, communication, legal, business` te va, ou tu permutes une fois
   pour toutes ?
