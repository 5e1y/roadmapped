# Brainstorm — Faire vivre les jalons AUSSI en post-launch (travail continu)

**Date** : 2026-07-09 · **Statut** : BRAINSTORM (aide à la décision, pas une décision) · **Tâche** : #228
**Auteur** : instance Fable 5, mode idéation · **Décideur** : Rémi
**Réfs lues** : `docs/specs/2026-07-07-stages-teams.md`, `skills/roadmapped/SKILL.md`, `src/lib/validate.ts`,
`src/components/RoadmapView.tsx` / `RoadmapColumns.tsx`, `src/lib/roadmap.ts`, `docs/design.md`

> Ce document n'écrit aucun code et ne change aucun stage. Il pose le problème, ce qu'il ne faut pas
> perdre, 6 options franchement distinctes, une reco, et les arbitrages qui reviennent à Rémi.

---

## 1. Cadrage du problème

### Le constat chiffré (backlog réel de ce repo, 2026-07-09)

Répartition des tâches **actives** (`docs/tasks/`, hors `_` et sous-tâches) :

| Stage | Total | todo | in_progress | done | Part du total |
|---|---:|---:|---:|---:|---:|
| `01-idea` | 2 | 0 | 1 | 1 | 1 % |
| `02-initial` | 2 | 0 | 0 | 2 | 1 % |
| `03-identity` | 16 | 4 | 0 | 12 | 8 % |
| **`04-build`** | **157** | **4** | **1** | **152** | **74 %** |
| `05-gtm` | 3 | 0 | 0 | 3 | 1 % |
| `06-launch` | 31 | 14 | 0 | 17 | 15 % |
| `07-scale` | 0 | 0 | 0 | 0 | 0 % |
| `08-mature` | 0 | 0 | 0 | 0 | 0 % |
| **Total** | **211** | 22 | 2 | 187 | 100 % |

Teams dans `04-build` : 98 engineering, 53 design, 5 marketing, 1 operations.

Deux faits sautent aux yeux :

1. **`04-build` = 74 % de tout le backlog**, dont **152 done sur 157**. La colonne est d'abord un
   **cimetière de done** : le travail continu (features, bugs, polish, refactors) y naît, y vit, y
   meurt — sans jamais faire avancer aucun autre jalon. Les done sont masquées par défaut au dashboard
   (toggle `roadmap:showDone`), donc l'obésité est surtout *structurelle* (le fichier, le tri, la
   sémantique) plus que *visuelle au repos* — mais elle explose dès qu'on affiche l'historique.
2. **`07-scale` et `08-mature` sont vides depuis leur naissance.** Le produit est lancé (le dashboard,
   le CLI, le MCP, le skill tournent), pourtant les deux stages censés représenter « l'après » ne
   captent rien. Le travail post-launch ne monte pas vers eux : il redescend dans `04-build`.

### Le vrai problème (reformulé finement)

Le modèle des 8 stages encode **une flèche temporelle à parcourir UNE fois** : idée → maturité. Il
répond parfaitement à la question *« où en est le lancement ? »*. Mais un produit lancé n'a plus de
« où en est le lancement » — il a un **régime permanent** : des boucles (livrer une feature, corriger
un bug, itérer, mesurer, maintenir) qui **ne progressent pas d'un stage vers le suivant**. Elles
tournent en place. Le modèle n'a pas de « chez soi » pour ce régime, alors tout tombe dans le seul
stage qui parle de « construire » : `04-build`.

Deux sous-problèmes qu'il faut distinguer, car ils n'appellent pas la même réponse :

- **(A) Lisibilité** — `04-build` est un fourre-tout indifférencié. « De quoi est faite cette
  colonne ? » n'a pas de réponse lisible. → problème de **VUE / regroupement**.
- **(B) Sémantique** — une fois lancé, les colonnes `05→08` (et `01→03`) ne veulent plus rien dire
  pour le travail courant, et le tri de `next` (voir §2) pousse *tout* le continu avant elles. La
  métaphore linéaire ne décrit plus le monde. → problème de **MODÈLE**.

Une piste ne vaut que si elle nomme lequel des deux elle traite. Beaucoup de fausses bonnes idées
règlent (A) en croyant régler (B), ou cassent une force du modèle pour un gain cosmétique.

---

## 2. Ce qu'il ne faut PAS perdre (la grille de jugement)

Le modèle actuel a des forces réelles et chèrement acquises (spec du 2026-07-07). Toute option se
juge à l'aune de leur préservation :

1. **Zéro bikeshedding.** Les colonnes sont fixes et immuables : personne ne débat du nom des
   colonnes, on débat du *travail*. C'est un choix de design fort (`SKILL.md` interdit explicitement
   « créer une 9e stage, renommer une stage »). Chaque option qui rouvre « quelles colonnes ? »
   réintroduit exactement le coût que ce choix a supprimé.
2. **La roadmap = des jalons, pas un kanban de plus.** Une colonne raconte une étape d'une histoire
   universelle. La progression (`ProgressBar` par stage + `GlobalProgress`) a un sens parce que la
   séquence a un sens. Un modèle « Now/Next/Later » perd cette lecture narrative.
3. **Fichiers-first.** La vérité est dans `docs/tasks/NN-stage/*.yaml`. Le nom du dossier *est* le
   stage. Changer le modèle = déplacer/renommer des fichiers ET migrer les YAML. Le coût de migration
   est réel et se paie sur disque, pas seulement à l'écran.
4. **Agent-first.** Un agent consomme `next`/`take` sans réfléchir. Le tri est
   `a.stage - b.stage || a.task.id - b.task.id` (`roadmap.ts` l.258) : **le stage est le critère de
   priorité PRIMAIRE**. Donc toucher au modèle de stages, c'est toucher à l'ordre dans lequel un agent
   reçoit le travail. Une option qui casse ce déterminisme casse l'agent-first.
5. **Un seul plan.** Pas de plan parallèle, pas de second système d'organisation. Un axe « type » ou
   un « mode » qui deviendrait un deuxième classeur concurrent trahirait ce principe.
6. **Enum fermé = garantie.** `validate.ts` rejette tout dossier hors des 8 slugs et tout `title` ≠
   titre canonique. La stabilité vient de là. L'assouplir a un prix (voir Option F).

Note transverse : **les epics existent déjà et sont un axe de regroupement transversal opérationnel**
partout (RoadmapColumns `EpicCardGroup`, Backlog `EpicRow`, Graph), avec ancrage d'un epic sur un seul
stage et progression globale. C'est un levier sous-exploité que plusieurs options réutilisent sans
rien inventer.

---

## 3. Les options

Six options, classées de la moins invasive (pure vue) à la plus radicale (modèle reconçu / stages
configurables). Pour chacune : fonctionnement, mini-exemple, avantages, risques, impact
(skill / `validate.ts` / dashboard / migration), et **casse-t-elle « stages fixes immuables » ?**

---

### Option A — Vue, pas modèle : découper `04-build` par regroupement (epic / type)

**Idée.** Ne toucher à rien du modèle. Résoudre uniquement **(A) lisibilité** en exploitant ce qui
existe déjà : le regroupement par epic. Rendre le découpage interne de `04-build` *premier de
classe* — sous-en-têtes d'epics dépliés par défaut dans la colonne, un « type » léger dérivé des tags
(`feature` / `bug` / `chore` / `polish`) affiché en facette, et un filtre. Optionnellement, une
hygiène des done : les done au-delà de N par stage se replient sous un « + 148 terminées » (au lieu
d'un simple masquage global), pour que la colonne *respire* sans perdre l'historique.

**Mini-exemple.** Colonne `04-build` :
```
04-build ▸ 4 ouvertes · 152 terminées (repliées)
  ▸ epic: vues-dashboard        2 ouvertes
  ▸ epic: token-economy         1 ouverte
  ▸ (hors epic)                 1 ouverte
```

**Avantages.**
- **Coût quasi nul, risque quasi nul** : la mécanique de regroupement par epic est déjà là et testée.
- Ne casse **aucune** force du §2. Zéro migration, zéro bikeshedding, tri `next` intact.
- Débloque immédiatement la douleur ressentie (« la colonne est illisible »).

**Inconvénients / risques.**
- Ne traite **pas** (B). `05→08` restent sémantiquement morts, `07/08` restent vides, `next` continue
  de tout servir depuis `04-build`. C'est un analgésique, pas un traitement.
- La qualité du découpage dépend de la discipline d'epics/tags — sur du travail one-off non-epic, on
  retombe sur un tas « hors epic ».

**Impacts.** skill : ~0 (au plus une phrase incitant à taguer). `validate.ts` : **0**. dashboard :
modéré (rendre l'epic-grouping proéminent dans la colonne + repli des done par stage). migration :
**0**.

**Casse la règle immuable ?** **Non.**

---

### Option B — Réaffecter `07-scale` et `08-mature` en boucles PERMANENTES

**Idée.** Garder 8 stages, garder les slugs, garder le nombre — mais **changer la sémantique des deux
derniers** : cesser de les voir comme « des phases atteintes une fois » et en faire les **maisons
permanentes du travail continu**. `07-scale` devient la boucle *croissance / itération* (features
post-launch, expérimentations, growth), `08-mature` la boucle *maintenance / exploitation* (bugs,
dette, support, compliance courante). Après launch, le travail continu naît là, plus dans `04-build`.
`04-build` reprend son sens strict : « construire le produit 0→1 », et se fige une fois lancé.

**Mini-exemple.** Un bug remonté aujourd'hui : au lieu de `add --section 04-build`, il va
`add --section 08-mature --team engineering`. Une nouvelle feature d'itération :
`add --section 07-scale`. La colonne `04-build` arrête de grossir ; `07/08` prennent vie et
racontent enfin « le produit vit et grandit ».

**Avantages.**
- **Le plus fin rapport gain/casse.** Rend `05→08` vivants sans rouvrir « quelles colonnes ? » : on
  ne débat pas du *nombre* ni des *slugs*, seulement de ce que deux colonnes existantes signifient.
- Respecte la flèche : idée→build→lancement→**puis la vie du produit tourne dans les 2 dernières**.
  La narration tient encore.
- `next` garde son déterminisme ; simplement, en régime permanent, il servira surtout `07/08` — ce
  qui est *correct* (le travail de launch est fini).
- Migration légère : re-router les futures créations ; éventuellement re-tagger un lot de done
  `04-build` en `08-mature`, mais même sans rétro-migration ça marche pour l'avenir.

**Inconvénients / risques.**
- **Change les titres/notes canoniques** de `07/08` (« Scale »/« Mature » → p.ex.
  « Growth loop »/« Maintenance loop »). Ce n'est pas assouplir la règle, mais **modifier la
  constante** `STAGES` → `CANONICAL_TITLE` dans `validate.ts` rejettera l'ancien titre : petit
  changement de code + note de migration. À assumer.
- Risque de retomber sur le même travers : `07-scale` pourrait devenir le nouveau fourre-tout. À
  contenir avec l'Option A (regroupement) par-dessus.
- Frontière `04-build` vs `07-scale` parfois floue au moment de créer (« est-ce encore du build 0→1
  ou de l'itération ? »). Règle simple à écrire dans le skill : *avant le premier launch → build ;
  après → scale/mature*.

**Impacts.** skill : réécrire l'esprit des stages 07/08 + la règle de routage post-launch.
`validate.ts` : changer 2 titres canoniques (constante). dashboard : 0 structurel (les colonnes
existent). migration : légère (routage futur ; rétro-tag optionnel).

**Casse la règle immuable ?** **Presque pas** — nombre et slugs intacts ; seuls 2 titres/notes et
leur sémantique changent. C'est le point d'équilibre le plus défendable.

---

### Option C — Deux modes : « launch » vs « operate » (steady-state)

**Idée.** Le projet a une **phase**. En phase *launch*, la Roadmap actuelle (8 stages linéaires). Une
fois basculé en *operate* (flag projet, p.ex. dans `_meta.yaml`), le dashboard bascule sur un **jeu de
colonnes de régime permanent** : `Now / Next / Later` (ou `Backlog / In progress / Shipped`). Le même
fichier-truth, deux lentilles selon la maturité du projet.

**Mini-exemple.** `_meta.yaml: phase: operate`. La Roadmap n'affiche plus idea→mature mais trois
colonnes Now/Next/Later, alimentées par un champ léger (ou par le statut + une priorité). Les 8 stages
restent sur disque comme *archive de l'histoire de launch*, consultables via un onglet « Histoire ».

**Avantages.**
- Épouse honnêtement la réalité : lancer et opérer sont deux jeux différents ; peu d'outils assument
  les deux. Fort **narratif produit** (« Roadmapped grandit avec toi »).
- Ne détruit pas le modèle launch : il est *rangé*, pas supprimé.

**Inconvénients / risques.**
- **Deux systèmes d'organisation = risque « un seul plan » (§2.5).** Où vit un ticket operate sur
  disque ? S'il faut de nouveaux dossiers (`now/next/later`), on a **deux taxonomies de dossiers** et
  une grosse complexité de validation. S'il réutilise les 8 dossiers avec une projection, la
  correspondance stage→Now/Next/Later est arbitraire (bikeshedding déguisé).
- **Casse le déterminisme de `next`** : le tri par stage n'a plus de sens en mode operate ; il faut un
  second tri (priorité ?), donc un second champ, donc du bikeshedding sur la priorité.
- Le moment du bascule est un **événement lourd** et irréversible-en-pratique. Beaucoup de design pour
  un flag.
- Charge de dev élevée : deux rendus de Roadmap, deux logiques de file, deux validations.

**Impacts.** skill : lourd (deux régimes à documenter). `validate.ts` : lourd (validité conditionnelle
à la phase). dashboard : très lourd (second mode complet). migration : moyenne à lourde selon le
stockage retenu.

**Casse la règle immuable ?** **Oui de facto** — en mode operate, les 8 stages ne gouvernent plus la
vue ni la file. On ne les supprime pas, mais on les court-circuite.

---

### Option D — Axe orthogonal « type » × statut léger (dé-linéariser après launch)

**Idée.** Reconnaître que, post-launch, la question pertinente n'est plus *quand* (stage) mais *quoi*
(type) et *où ça en est* (statut). Introduire un axe **type** premier de classe —
`feature | bug | chore | experiment` — orthogonal au stage, et faire de la Roadmap post-launch une
grille **type × statut** au lieu d'une frise de stages. Le stage reste sur les tâches (héritage,
lecture d'histoire) mais cesse d'être l'ossature de la vue une fois lancé.

**Mini-exemple.** Vue « Opérations » : lignes = types (Features / Bugs / Chores / Experiments),
colonnes = `todo / in progress / shipped`. Un bug = `type: bug`, indépendamment de son stage.

**Avantages.**
- Décrit *vraiment* le régime permanent : on pense en types de travail, pas en avancement de launch.
- `kind` et `tags` portent déjà une partie de cette information — l'axe n'est pas totalement neuf.
- Découple la lisibilité de la sémantique linéaire, proprement.

**Inconvénients / risques.**
- **Nouveau champ obligatoire = friction** (comme `team` l'a été) et surtout **nouvel axe = risque
  d'un deuxième plan** (§2.5). On avait déjà `team` (qui) + `stage` (quand) ; ajouter `type` (quoi)
  charge le modèle mental.
- Ne dit pas *où sur disque* : si le type ne remplace pas le stage comme dossier, les fichiers restent
  rangés par stage et la vue type est une pure projection (OK) — mais alors on n'a pas réglé
  l'obésité de `04-build` sur disque, juste à l'écran (redondant avec Option A).
- Recoupe partiellement `team` (`bug` corrélé à engineering, etc.) — risque de redondance perçue.

**Impacts.** skill : moyen (documenter l'axe type + quand la grille remplace la frise). `validate.ts` :
moyen (nouvel enum `type`, obligatoire ou non). dashboard : moyen-lourd (nouvelle vue grille).
migration : moyenne (back-fill `type` sur l'existant — au moins les actives).

**Casse la règle immuable ?** **Non** au sens strict (les 8 stages restent), **oui en esprit** post-
launch (le stage n'est plus l'ossature). Cohabitation à cadrer.

---

### Option E — Buckets evergreen : reconcevoir les 8 en catégories intemporelles

**Idée.** Le plus radical côté modèle. Abandonner la **flèche temporelle** au profit de **8 catégories
qui ont un sens avant ET après launch** : au lieu de idea→mature (qu'on traverse une fois), des
domaines permanents type `Product / Growth / Brand / Ops / Revenue / Support / Platform / Legal`
(illustratif). Chaque bucket est evergreen : il accueille du travail à tout moment de la vie du
produit. La colonne ne dit plus « où on en est » mais « de quoi il s'agit ».

**Mini-exemple.** Une refonte de la page pricing → `Growth`. Un bug de billing → `Revenue`. Une
feature core → `Product`. Ni avant ni après : *toujours* valide.

**Avantages.**
- Règle **(A) et (B) d'un coup** et *définitivement* : plus jamais de colonne « fin de vie » vide ni
  de fourre-tout, puisque aucune colonne n'est temporelle.
- Un seul modèle pour toute la vie du produit — pas de mode, pas de bascule.

**Inconvénients / risques.**
- **Détruit la force n°2** : on perd la roadmap-comme-récit-de-launch, qui est *l'identité assumée*
  de Roadmapped (« un outil pour LANCER un produit », spec 2026-07-07). C'est renier la thèse du
  produit. Énorme.
- **Rouvre le bikeshedding maximal** : « quelles sont les bonnes 8 catégories ? » est un débat sans
  fin — exactement ce que les stages fixes avaient tué. Chaque projet voudra les siennes → pression
  vers l'Option F.
- **Migration massive** : re-catégoriser les 211 tâches, réécrire `STAGES`, `validate.ts`, le skill,
  les notes canoniques, la doc, les captures. Chantier lourd et irréversible.
- Recouvre largement l'axe `team` (`Growth`≈marketing, `Revenue`≈finance/sales, `Support`≈support…) :
  risque de **doublonner team**, donc de casser le sens de `team`.

**Impacts.** skill : réécriture complète. `validate.ts` : réécriture de l'enum + titres. dashboard :
re-libellé (structure identique, 8 colonnes) mais tout le sens change. migration : **très lourde**
(211 tâches).

**Casse la règle immuable ?** **Oui, frontalement** — on remplace les 8 slugs et titres. C'est un
autre produit.

---

### Option F — Stages configurables par projet / phase

**Idée.** Assouplir l'immuabilité : chaque projet définit ses propres colonnes (nombre, noms, ordre)
dans `_meta.yaml`. `validate.ts` valide contre la liste *déclarée par le projet* au lieu des 8 slugs
en dur. Roadmapped-le-launch garde ses 8 par défaut ; un produit lancé choisit `Now/Next/Later` ou ce
qu'il veut.

**Mini-exemple.** `_meta.yaml: stages: [backlog, in-progress, shipped]` → 3 dossiers, 3 colonnes, la
validation s'y conforme.

**Avantages.**
- Flexibilité maximale ; répond à *tous* les régimes, présents et futurs.
- Techniquement direct : rendre l'enum dynamique (lu depuis `_meta.yaml`) est un petit changement de
  `validate.ts` par rapport à ce que ça débloque.

**Inconvénients / risques.**
- **Tue frontalement la force n°1 (zéro bikeshedding)** — la raison d'être explicite du modèle fixe
  (spec 2026-07-07, `SKILL.md`). On rend au marché ce que Roadmapped avait retiré exprès : le débat
  sans fin sur les colonnes. C'est un reniement de la thèse.
- **Perte de stabilité et d'universalité** : plus de garantie que « stage » veut dire la même chose
  d'un projet à l'autre ; le skill et les agents ne peuvent plus s'appuyer sur une sémantique connue.
- `next` doit trier sur un ordre déclaré arbitraire — le déterminisme devient projet-dépendant.
- Effet cliquet : une fois configurable, impossible de refermer.

**Impacts.** skill : lourd (tout ce qui suppose 8 stages devient conditionnel). `validate.ts` : moyen
techniquement, **maximal en implications**. dashboard : moyen (colonnes dynamiques). migration : nulle
pour ce repo (garde ses 8), mais coûte la garantie pour tous.

**Casse la règle immuable ?** **Oui, par conception** — c'est la suppression de la règle. À ne
considérer que si Rémi décide que l'immuabilité était une erreur, ce que le reste du produit contredit.

---

### Tableau de synthèse

| Option | Traite (A) lisib. | Traite (B) sémant. | Casse l'immuabilité | Coût dev | Migration | Risque bikeshedding |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **A** Vue / regroupement | Oui | Non | Non | Faible | Nulle | Nul |
| **B** Réaffecter 07/08 | Partiel | **Oui** | Presque pas (2 titres) | Faible | Légère | Faible |
| **C** Deux modes | Oui | Oui | De facto | Élevé | Moyenne+ | Moyen |
| **D** Axe type × statut | Oui | Partiel | En esprit | Moyen | Moyenne | Moyen |
| **E** Buckets evergreen | Oui | Oui | **Frontal** | Élevé | Très lourde | **Élevé** |
| **F** Stages configurables | Oui | Oui | **Suppression** | Moyen | Nulle (ce repo) | **Maximal** |

---

## 4. Recommandation

**Combo A + B, séquencé. D'abord A (débloque tout de suite, risque nul), puis B (redonne du sens sans
casser).** Écarter C, E, F ; garder D en réserve seulement si B ne suffit pas.

**Pourquoi.**
- Le problème est *deux* problèmes (§1). **A** règle la lisibilité (A) avec du code déjà écrit et
  testé — c'est le pas le moins risqué qui débloque le plus de douleur immédiate. **B** règle la
  sémantique (B) au *point d'équilibre* : il rend `05→08` vivants et vide `04-build` de son rôle de
  fourre-tout **sans** rouvrir « quelles colonnes ? » — on ne touche ni au nombre, ni aux slugs, ni au
  déterminisme de `next` ; on change la *signification* de deux colonnes déjà présentes et vides.
- Ce combo **préserve les six forces** du §2 : zéro bikeshedding (les 8 restent), roadmap-récit
  intacte (la flèche existe encore, elle boucle juste sur ses deux derniers stages), fichiers-first,
  agent-first (`next` reste déterministe), un seul plan, enum quasi fermé (2 titres changés, pas la
  règle).
- C et E/F paient trop cher : C dédouble l'organisation (risque « un seul plan » + gros dev) ; E renie
  la thèse « outil pour lancer » ; F supprime la force n°1. Ce sont des options « au cas où Rémi veut
  changer de produit », pas « au cas où 04-build est gros ».

**Ce que je ferais en premier, concrètement (ordre de risque croissant) :**
1. **A, volet epics** — rendre le regroupement par epic proéminent et déplié par défaut dans les
   colonnes peuplées (surtout `04-build`), plus un repli des done par stage. Zéro migration, zéro
   `validate.ts`. Ça calme la douleur en une itération.
2. **B, volet routage** — réécrire dans le skill l'esprit de `07-scale`/`08-mature` en boucles
   permanentes (growth / maintenance) et la règle « après le 1er launch, le continu naît en 07/08, pas
   en 04-build ». Aucun code encore : juste la consigne + le titre canonique à ajuster quand on
   décide. Le backlog futur cesse de gonfler `04-build` dès l'adoption de la consigne.
3. **B, volet titres** — changer les 2 titres/notes canoniques dans `STAGES` + `validate.ts`, rétro-
   tagger optionnellement un lot de done. Petit, ciblé, réversible.

Garder **D** comme évolution ultérieure *si* l'usage montre que 07/08 redeviennent des fourre-tout
malgré A — auquel cas un axe `type` léger (dérivé des tags, non obligatoire d'abord) affine sans
casser. Ne pas l'implémenter préventivement (YAGNI, cohérent avec `design.md`).

---

## 5. Questions ouvertes pour Rémi

1. **Frontière build ↔ scale.** Es-tu d'accord avec la règle « avant le 1er launch = `04-build` ;
   après = `07-scale`/`08-mature` » ? Où mets-tu la limite pour un travail qui construit *une nouvelle*
   grosse feature d'un produit déjà lancé (build 0→1 *local* ou scale) ?
2. **Titres canoniques de 07/08.** Acceptes-tu de changer « Scale »/« Mature » en quelque chose comme
   « Growth loop »/« Maintenance loop » (ou tes mots) ? C'est le seul point qui touche `validate.ts`
   dans la reco. Ou préfères-tu garder les titres et ne changer que leur *note* d'esprit ?
3. **Rétro-migration des done.** Laisse-t-on les 152 done de `04-build` où ils sont (l'histoire de
   launch reste vraie) et on ne route que le futur ? Ou re-tag-on une partie en 08-mature pour
   dégonfler visuellement ? (Je penche pour *laisser l'histoire tranquille*.)
4. **Hygiène des done au dashboard.** Veux-tu un vrai repli « + 152 terminées » par stage (au-delà de
   N), en plus du toggle global actuel ? C'est du pur confort de vue, hors modèle.
5. **La ligne rouge.** Confirmes-tu qu'on **ne** rouvre **pas** « quelles colonnes / combien de
   colonnes » (donc E et F écartées) ? Si ta réponse est « je veux pouvoir reconfigurer », alors le
   débat change de nature et il faut assumer le coût de la force n°1 — à décider explicitement, pas par
   glissement.
6. **Deux modes, plus tard ?** L'Option C (launch vs operate) est séduisante en récit produit
   (« Roadmapped grandit avec toi ») mais lourde et risquée pour « un seul plan ». La gardes-tu comme
   *vision long terme* distincte de ce ticket, ou la juges-tu hors-sujet ?
