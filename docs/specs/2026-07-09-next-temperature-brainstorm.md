# Brainstorm — Le tri de `next` par TEMPÉRATURE (graphe + ancienneté + seed manuel)

**Date** : 2026-07-09 · **Statut** : BRAINSTORM (conçoit la direction de Rémi, ne la re-débat pas) · **Suite de** : #230 (§5)
**Auteur** : instance Fable 5, mode idéation · **Décideur** : Rémi
**Réfs lues** : `docs/specs/2026-07-09-jalons-par-type-brainstorm.md`, `src/lib/roadmap.ts`
(`nextQueue`, `computeAvailability`, `reverseDependents`, `graphNeighborhood`), `src/lib/tasks.ts`,
`docs/design.md` · **Mesures** : 214 fichiers de tâches, 104 arêtes `dependsOn`, 71 tâches avec ≥ 1 dep (33 %),
22 todos ouvertes dont 7 avec deps, 0 `kind: milestone`, pas encore de `_epics.yaml` dans ce repo.

> Le §5 du brainstorm #230 proposait « l'ordre de `_epics.yaml` = la priorité ». Cette proposition
> est **REJETÉE** par Rémi et ce document ne la ressuscite pas : les epics sont des regroupements
> **non ordonnés**, ni entre eux ni en interne — aucun rang d'epic n'entre dans aucun calcul
> ci-dessous. Ce document conçoit le remplaçant : une **température** par ticket, calculée depuis
> le graphe de dépendances et l'ancienneté, ajustable par un seed manuel. Aucun code n'est écrit.

---

## 1. Les contraintes, reformulées (et intégrées)

1. **Aucun ordre dans/entre les epics.** Un epic regroupe, il ne priorise pas. `_epics.yaml`
   reste ce qu'il est : des titres lisibles, une existence optionnelle (ce repo n'en a d'ailleurs
   même pas — tout est auto-découvert par `allEpics`). Le fait qu'il soit une liste est un
   accident de format YAML, pas une sémantique. La formule du §2 ne lit **jamais** l'epic.
2. **Le slot `team` est libéré** par la fusion stage+team (#230) : un champ validé du schéma, un
   flag CLI, un filtre de sidebar, un chip d'affichage, une ligne du brief agent. Ce slot complet
   est **réutilisé** pour le seed de température (§6) — le coût marginal du champ est quasi nul,
   l'infrastructure existe déjà.
3. **`next` reste déterministe et consommé bêtement.** Même contrat qu'aujourd'hui : l'app calcule,
   le CLI sert, le skill consomme sans recalculer. La température est calculée par UNE fonction
   pure ; deux appels au même instant sur le même tree donnent la même file, au centième près.
4. **Jamais un `locked`.** `computeAvailability` reste le filtre d'entrée intouché : la
   température ordonne les tickets **disponibles**, elle ne débloque rien.

Et une reformulation des trois idées de Rémi que ce doc combine :

- **(A) le graphe** : servir d'abord ce qui débloque le plus de travail aval — et qui est en début
  de chaîne. Point important : le second critère est **déjà garanti par construction** — une tâche
  servie par `next` est `available`, donc toutes ses deps sont done, donc elle n'a RIEN d'ouvert
  en amont. Chaque ticket de la file est, par définition, une tête de chaîne restante. Il ne reste
  qu'à pondérer par l'aval : le nombre de tickets qu'il bloque.
- **(B) la température** : un spectre continu 0–100,00 (~10 000 crans), optionnel, posé uniquement
  pour faire remonter un ticket. Pas de paliers, pas de cérémonie, un mot fun.
- **(C) la combinaison** : la température n'est pas posée, elle est **calculée** — ancienneté +
  blocages aval + seed manuel. Un vieux ticket qui bloque beaucoup chauffe tout seul.

---

## 2. La FORMULE de température

### 2.1 La formule, en clair

```
température(t, aujourdhui) = auto + base + seed        chaque terme ≤ 33,33 ; total ≤ 100
                                                       arrondie à 0,01 AVANT tri

auto  = min(33,33 ;  20·B + 13,33·A)   le tiers MACHINE  (blocages + âge)
base  = base_type (§2.4)               le tiers NATURE   (fixe par type, 0–33,33)
seed  = heat / 3                       le tiers HUMAIN   (heat stocké 0–100, heat 100 = tiers plein)

A = age / (age + 90)   age = jours entiers écoulés depuis createdAt (dates UTC)
B = b / (b + 4)        b   = nb de tickets ACTIFS NON-done qui dépendent de t,
                             TRANSITIVEMENT (fermeture aval, sous-tâches comprises)
```

**TROIS TIERS ÉGAUX** (décision Rémi, 2026-07-09) : trois signaux, trois voix de même poids, chacun
maître d'un tiers de l'échelle (≈33,33). La machine (blocages + âge), la nature (le type), la main
(le seed) pèsent **à égalité** — aucun ne domine les autres. Conséquence assumée et VOULUE : **le
seed ne passe PAS automatiquement devant tout.** Un ticket naturellement chaud — un `bug` à base
haute qui bloque et vieillit — peut et DOIT dépasser un ticket qu'on a boosté à la main ; c'est la
BONNE priorisation, pas un compromis (« même si on met un ticket design en max, un bug plus chaud
devrait naturellement passer devant » — Rémi). La souveraineté du geste humain est explicitement
abandonnée ; elle appartenait au 50/50-plancher, écarté (§2.5). Toutes les constantes (les poids
20/13,33 du tiers machine, la table de base, le facteur /3 du seed) sont fixes et versionnées dans
le code — même régime que les 9 types : zéro config par projet, zéro bikeshedding.

### 2.2 Chaque choix, justifié

**`b` transitif, pas direct.** `reverseDependents` donne les dépendants directs ; le vrai signal
de Rémi (« débloque le plus de travail ») est la **fermeture transitive aval** — un ticket racine
qui verrouille une chaîne de 5 pèse plus qu'un ticket qui en bloque 2 directement et rien derrière.
La mécanique existe déjà : `graphNeighborhood` calcule exactement cette fermeture (descendants,
O(V+E), défensif sur les cycles) — la même passe, appliquée au graphe des tâches au lieu du graphe
affiché. On ne compte que les descendants **non-done** (bloquer du travail déjà fait ne chauffe
rien) et **actifs** (l'archive ne compte pas). Sous-tâches comprises : débloquer un parent à 6
sous-tâches, c'est débloquer 7 morceaux de travail.

**Saturations asymptotiques (`x/(x+k)`), pas linéaires.** Deux vertus : aucune falaise (un ticket
de 366 jours n'est pas soudain « au max »), et une constante lisible — k est la **demi-vie** :
- `k = 90` pour l'âge : à 3 mois, un ticket a la moitié de son score d'âge maximal ; à 1 an, 80 %.
  Assez lent pour que l'âge départage sans dominer, assez rapide pour qu'un backlog de 6 mois ait
  une vraie pente.
- `k = 4` pour les blocages : bloquer 4 tickets = moitié du score ; 12 = 75 %. Calibré sur la
  réalité mesurée (le max direct observé aujourd'hui est 4, sur #68) : le terme discrimine dès 1–2
  blocages, sans qu'un hub à 30 dépendants écrase l'échelle.

**Le tiers machine : `min(33,33 ; 20·B + 13,33·A)`.** Les blocages pèsent plus que l'âge (ratio
3:2, comme avant : `b` est le signal intentionnel, l'âge un fond anti-stagnation), mais les deux
poids sont **re-normalisés pour tenir dans le tiers** — 20 + 13,33 = 33,33. Le `min` est une
ceinture (les saturations asymptotiques ne l'atteignent jamais tout à fait) ; il garantit
formellement qu'aucun combo blocages×âge ne déborde sur les tiers voisins.

**Le tiers humain : `seed = heat / 3`.** Le champ stocké `heat` reste sur **0–100** — le spectre
continu à ~10 000 crans que voulait l'idée B, familier à poser (« je mets ça à 80 »). Il occupe son
tiers par un simple facteur : `heat 100` → `seed 33,33` (tiers plein), `heat 60` → `20`. Rémi garde
sa poignée 0–100 ; le modèle garde ses trois tiers égaux. Poser un seed reste le seul geste manuel,
optionnel et rare — et il ne pourrit pas : le seed ne bouge que d'une main, pendant que les deux
autres tiers vieillissent et se remplissent tout seuls (l'intuition C, intacte : la priorité vit).

**Le tiers nature : `base`.** La chaleur de départ que le type pose gratuitement (§2.4). Contrairement
au 50/50 écarté où la base était coincée sous le plafond de 50 avec l'âge et les blocages, elle a
ici **son propre tiers** : un bug garde sa pleine base même quand il bloque et vieillit — les trois
contributions s'additionnent sans se rogner l'une l'autre (sauf plafonnement interne au tiers machine).

**Arrondi à 0,01 AVANT tri.** La valeur affichée EST la valeur de tri — jamais un ordre décidé
par une décimale invisible. Deux tickets à égalité au centième près départagent à l'id (§3).
0–100,00 au centième = les ~10 000 crans voulus par Rémi.

**Propriété qui fait tout tenir : la température ne redescend jamais toute seule.** L'âge ne fait
que croître ; `b` ne peut croître que par l'arrivée de nouveaux tickets déclarant une dep (un
dépendant d'un ticket todo ne peut pas passer done — il est locked) ; le seed ne bouge que d'une
main. Un ticket chaud le reste jusqu'à ce qu'on le traite. C'est l'anti-pourrissement demandé.

### 2.3 Stockée, calculée, ou hybride ? → HYBRIDE, franchement

| Option | Verdict |
|---|---|
| **Stockée** (un champ `temperature` figé dans le YAML) | ❌ Morte à l'écriture : elle dépend du temps ET de l'état du graphe — il faudrait un démon qui réécrit 200 YAML chaque nuit et à chaque done. L'anti-modèle fichiers-first absolu. |
| **Calculée pure** (aucun champ) | ❌ C'est l'option (A) seule : aucun levier manuel. Voir §8 — le seed est le vrai plus. |
| **HYBRIDE : seed stocké (`heat`), température dérivée à chaque lecture** | ✅ **Recommandé.** UNE donnée posée par l'humain, tout le reste dérivé — rien à re-synchroniser, jamais. |

L'hybride est déjà LE pattern de la maison : le bloc « Bloque » du panneau est « entièrement
calculé, aucun champ YAML » (commentaire de `reverseDependents`), l'availability est dérivée et
mémoïsée par identité de tree (`availabilityCache`, WeakMap). La température suit exactement ce
précédent : une fonction pure `temperature(tree, task, today)`, un cache WeakMap par tree, coût
O(V+E) une fois par snapshot — trivial à 214 tâches, négligeable à 10 000. La `base` ne coûte
rien de plus : c'est un lookup dans une table figée par le type (= le dossier) de la tâche.

### 2.4 La BASE par type — la nature du travail comme chaleur de départ (idée de Rémi)

**Le principe** : à sa naissance, une tâche n'est pas neutre — sa NATURE porte déjà une urgence.
Un `bug` naît chaud (quelque chose est cassé, le coût court), un `chore` naît froid (la dette peut
attendre). Rémi veut que le type donne une chaleur de départ, EN PLUS de l'âge, des blocages et du
seed. C'est un quatrième signal, et le seul qui ne demande **aucun geste** : il tombe du dossier
où vit la tâche.

**Où vit la base ? Dans SON PROPRE TIERS, à égalité avec les deux autres.** `base` n'est pas un
plancher noyé dans la moitié machine (c'était le 50/50 écarté) : c'est le **tiers NATURE**, un
terme additif autonome plafonné à 33,33 comme les deux autres. Le type pose une chaleur de départ
que ni l'âge, ni les blocages, ni le seed ne peuvent rogner. C'est exactement la lecture « trois
signaux égaux » de Rémi.

**La conséquence sur la souveraineté du seed — assumée.** Puisque base et auto peuvent monter
ensemble jusqu'à ~63 pour un bug (base 30 + tiers machine 33,33) sans qu'aucune main n'intervienne,
un seed maxé (33,33) ne suffit PAS à garantir la tête de file. C'est voulu : un `bug` naturellement brûlant (base 30 + blocages + âge)
doit dépasser un `design` qu'on a poussé à la main. « *Une bonne priorisation* », dit Rémi — et
c'est vrai : le seed sert à *ajouter du poids*, pas à *court-circuiter* le signal réel. Qui veut
qu'un ticket passe coûte que coûte devant un bug critique devra soit s'attaquer au bug d'abord
(sain), soit accepter qu'un incident batte un boost cosmétique (sain aussi). La propriété « le seed
override tout » du 50/50 est abandonnée en connaissance de cause (§2.5).

**Les valeurs — 9 types, fixes et versionnées** (même régime que les types eux-mêmes : en dur dans
le code, aucune config par projet). Toutes dans `[0, 33,33]` (le tiers) ; le max retenu est **30**
(bug) — laisser ~3 points de mou sous 33,33 évite qu'un type sature son tiers dès la naissance et
garde la base *comparable* aux deux autres contributions.

| Type | base | Justification (la nature = l'urgence de départ) |
|---|---:|---|
| **bug** | **30** | Quelque chose est cassé, promesse rompue, le coût court chaque jour. Naît le plus chaud — proche du tiers plein, mais un chore qui déverrouille une chaîne peut encore le doubler. |
| **business** | **20** | L'argent et les clients en direct (billing, deal, prospection) : un revenu retardé est un coût réel, presque aussi pressant qu'une casse. |
| **legal** | **18** | Conformité souvent à échéance DURE (RGPD, dépôt, contrat) : rarement « urgent aujourd'hui » mais coûteux si on rate la fenêtre → chaud de départ, pas brûlant. |
| **feature** | **14** | Le cœur de valeur produit, mais rien n'est cassé et rien ne brûle : tiède. C'est le volume — le mettre haut noierait tout le reste. |
| **design** | **12** | Artefact d'expérience, souvent en amont d'une feature : légèrement sous feature, le graphe le fera chauffer quand il bloque vraiment. |
| **brainstorm** | **10** | Réfléchir avant de faire : faible urgence intrinsèque, MAIS c'est le type le plus souvent *bloquant* (une spec précède le build) → il chauffera surtout par le tiers machine, pas par sa base. |
| **marketing** | **7** | Acquisition durable : important, presque jamais « à faire ce jour ou jamais ». Froid de fond ; un lancement daté se pilote au seed. |
| **communication** | **7** | Parler au monde : même registre que marketing. La plupart des posts/annonces peuvent glisser d'un jour ; une annonce datée = seed. |
| **chore** | **5** | Dette, refactor, deps, CI : le plus froid par défaut, c'est *par définition* ce qui peut attendre. L'âge le remonte lentement (un vieux chore finit par mériter un tour), le graphe le remonte s'il bloque. |

Trois paliers lisibles : **casse & argent** (bug 30, business 20, legal 18), **produit & pensée**
(feature 14, design 12, brainstorm 10), **dehors & entretien** (marketing/communication 7,
chore 5). L'écart bug→chore (25 points) est franc mais reste dans un tiers : un chore très bloquant
et vieux (jusqu'à +33 de tiers machine) dépasse largement un bug frais et isolé — la nature oriente,
elle ne verrouille pas.

**Impact sur le risque « graphe clairsemé → FIFO ».** C'est le vrai bonus collatéral. Sans la base,
avec B = 0 partout (aucune dep) et aucun seed, la formule dégénérait en âge pur = FIFO. Avec la
base, elle dégénère en **`base(type) + âge`** : la file est **stratifiée par nature** dès le premier
jour, sans un seul `dependsOn` — tous les bugs devant, puis business/legal, puis
feature/design/brainstorm, puis marketing/communication/chore, l'âge départageant *au sein* d'un
palier et faisant lentement remonter les vieux froids. Le mode dégradé passe de « FIFO plat » à
« hiérarchie par nature + ancienneté » : une file déjà utile même si personne ne tient le graphe.
Ça n'annule pas l'intérêt de `dependsOn` (le graphe reste ce qui exprime le *fin*), mais ça relève
nettement le plancher de qualité quand il est absent — exactement la préoccupation du §5.

### 2.5 Pourquoi les tiers égaux, et pas le 50/50-plancher (alternative écartée)

Deux formes de partition ont été pesées. **Retenue : les tiers égaux** (auto / base / seed à ≈33,33
chacun). **Écartée : le 50/50-plancher** — auto (base + âge + blocages) plafonné à 50, seed jusqu'à
100, ce qui rendait le geste humain *souverain* (un seed ≥ 50 doublait tout l'automatique, garanti).

| | **Tiers égaux (RETENU)** | 50/50-plancher (écarté) |
|---|---|---|
| Poids des 3 signaux | Égaux (chacun ≤ 33,33) | Machine ≤ 50, humain ≤ 100 |
| Le seed override-t-il tout ? | **Non** — un ticket naturellement chaud le dépasse | Oui — un seed ≥ 50 passe devant tout l'auto |
| La base | Tiers autonome, jamais rognée | Coincée sous le plafond de 50 avec âge+blocages |
| Ce que ça exprime | Les 3 forces à parité ; le réel (casse, blocage) peut battre l'avis | Le dernier mot revient toujours à l'humain |

**Le trancheur, c'est l'intention.** Rémi veut qu'un bug brûlant passe devant un design boosté à la
main — donc que le réel puisse battre l'avis. Le 50/50 interdisait précisément ça (le seed avait le
dernier mot). Les tiers l'autorisent, et c'est la bonne priorisation : le seed **pondère**, il ne
**commande** pas. On perd la propriété « je peux forcer n'importe quoi en tête » — mais cette
propriété était un risque (elle permet d'enterrer un incident sous un caprice), pas une vertu. La
soupape du §8 (pouvoir faire remonter un ticket sans tricher le graphe) reste offerte : un seed de
33,33 ajoute un tiers entier, largement de quoi faire remonter un ticket parmi ses pairs — il ne
garantit simplement plus de battre un ticket que le RÉEL a rendu plus chaud. C'est exactement ce
qu'on veut.

---

## 3. Le tri de `next`, final

```
nextQueue(tree, today) =
  tâches de premier niveau, status todo, section open        (filtres INCHANGÉS)
  ∩ availability === 'available'                             (jamais un locked — INCHANGÉ)
  triées par :
    1. température décroissante                              (arrondie à 0,01)
    2. id croissant                                          (tie-break : plus ancien d'abord)
```

Le tie-break id croissant est le bon : id ≈ ordre de `createdAt` (convention existante), donc à
température égale le plus ancien passe — cohérent avec le terme d'âge (deux tickets créés le même
jour, sans deps ni seed, sortent dans l'ordre de création : exactement le comportement actuel).
Le paramètre `today` remplace l'implicite (§4) ; l'ex-paramètre `opts.team` devient `opts.type`
(filtre par section-type, hérité de #230 — orthogonal à ce doc).

**Dégénérescences, toutes saines** : graphe vide + aucun seed → tri = **base(type) + âge**, une
hiérarchie par nature puis ancienneté (pas du FIFO plat — §2.4) ; même base + même âge, sans deps
ni seed → id croissant ; un ticket seedé remonte fort mais **ne double pas forcément** un ticket
que le réel a rendu plus chaud (§2.5, c'est voulu).

### Mini-exemple (aujourd'hui = 2026-07-09)

`auto = min(33,33 ; 20·B + 13,33·A)`, `base` par type (§2.4), `seed = heat/3` ; `T° = auto + base + seed`.

| Ticket | type | createdAt (âge) | bloque (transitif) | heat | auto | base | seed | **T°** |
|---|---|---|---:|---:|---:|---:|---:|---:|
| #48 « déposer CGU/RGPD » | legal | 2026-06-09 (30 j) | 0 | **100** | 3,33 | 18 | 33,33 | **54,67** |
| #320 « checkout cassé en prod » | bug | 2026-05-10 (60 j) | 8 | — | 18,67 | 30 | 0 | **48,67** |
| #310 « refonte direction artistique » | design | 2026-07-07 (2 j) | 0 | **100** | 0,29 | 12 | 33,33 | **45,62** |
| #150 « refonte du parseur » | chore | 2026-03-31 (100 j) | 6 | — | 19,02 | 5 | 0 | **24,02** |
| #205 « page changelog » | communication | 2026-07-01 (8 j) | 1 | — | 5,09 | 7 | 0 | **12,09** |
| #180 « brancher Stripe » | business | 2026-02-01 | 3 | — | — | — | — | **locked** (dep #150 pas done) |

File servie : **#48 → #320 → #310 → #150 → #205**. Ce que l'exemple prouve, ligne par ligne :

- **LE cas de Rémi — le réel bat le boost** : #320 (bug, JAMAIS seedé, 48,67°) **dépasse** #310
  (design, seed poussé au MAX 100 → 33,33°, mais 45,62°). Un ticket boosté à la main passe DERRIÈRE
  un bug que le réel a rendu chaud (base 30 + bloque 8 + 60 j) — exactement la bonne priorisation
  voulue. Le seed pondère, il ne commande pas.
- **Le seed reste un vrai levier, pas souverain** : #48 (legal) est en tête à 54,67° — mais parce
  qu'il cumule un seed max ET une base chaude (18) ET un peu d'âge, pas par le seed seul. La preuve :
  #320 le talonne à 6 points ; un simple `heat 20` sur #320 (seed 6,67) le ferait passer devant. Le
  tiers humain ajoute jusqu'à 33,33 — largement de quoi faire remonter un ticket parmi ses pairs,
  jamais de quoi enterrer un incident.
- **La base stratifie quand le reste est plat** : sans elle, #310 (design tiède) et #205 (comm) se
  trieraient à l'âge ; ici la nature les ordonne dès le premier jour (design 12 > comm 7). C'est la
  file utile-même-sans-graphe du §2.4.
- **`computeAvailability` filtre en amont** : #180 (business) n'apparaît pas tant que #150 n'est pas
  done — quelle que soit sa température. Le jour où #150 tombe, #180 entre chaud (base 20 + 90+ j
  d'âge + ses propres blocages).

---

## 4. Déterminisme vs dépendance au TEMPS — traité franchement

Oui, la file **change avec les jours** : c'est voulu (l'anti-pourrissement EST une fonction du
temps), et il faut le dire sans l'enrober. Trois réponses, une par inquiétude :

1. **Le contrat agent-first tient.** Le contrat de `next` n'a jamais été « stable dans le temps » —
   chaque done, chaque création de tâche le change déjà. Le contrat est : **déterministe à un
   instant donné** — même tree + même date = même file, au centième près. Un agent consomme `next`
   au début de sa session et travaille ; il ne re-tire pas la file toutes les heures. La formule
   garantit exactement ça.
2. **Granularité JOUR, pas milliseconde.** `age` = jours entiers entre la date UTC de `createdAt`
   et la date UTC de « maintenant ». Conséquence : la file est **constante pendant 24 h** — deux
   agents lancés le même jour voient la même file (à tree égal), un `next --count 3` re-tiré dans
   la même session ne bouge pas. Le seul instant de bascule est minuit UTC, et il ne fait que
   des promotions d'âge (jamais une inversion brutale : A est continu et lent).
3. **« Maintenant » est INJECTÉ.** `nextQueue(tree, { today })` avec défaut = date du jour :
   la fonction reste pure, les tests figent la date (aucun mock d'horloge), et le CLI peut
   exposer un `next --as-of 2026-07-09` de debug (« pourquoi ce ticket est-il premier ? rejoue la
   file d'hier »). Le brief agent, lui, imprime la température **avec sa décomposition en trois
   tiers** (`48,67° = auto 18,67 + nature 30 + seed 0`) — la file n'est jamais un oracle opaque.

Ce qu'on n'essaie PAS de faire : figer la température au moment de la création, ou la snapshotter
en YAML « pour la reproductibilité ». Ce serait tuer la fonctionnalité (une température qui ne
monte plus) pour un déterminisme que personne n'a demandé — la reproductibilité utile est celle
des tests et du debug, et l'injection de date la donne entièrement.

---

## 5. Le risque d'hygiène des dépendances — mesuré, puis traité

**L'état réel du repo** : 104 arêtes, 71 tâches sur 214 avec au moins une dep (33 %), et 7 des 22
todos ouvertes. Le graphe n'est ni vide ni luxuriant : le signal `b` existe mais il est **clairsemé**.
Le caveat de Rémi est donc réel — et voici pourquoi il n'est pas mortel :

1. **Le mode dégradé est un plancher sain, pas une panne — et la base le relève encore.** Si
   personne ne remplit `dependsOn`, B = 0 partout et la file = seed, puis **base(type), puis âge**.
   Ce n'est PAS du FIFO plat : la base (§2.4) stratifie déjà par nature (bugs devant, chores
   derrière) sans un seul lien de dépendance — les urgences marquées d'une main en tête, puis une
   hiérarchie par type, l'âge départageant à l'intérieur. C'est un comportement **honnête et
   prévisible**, et strictement meilleur que la file actuelle (stage + id). Le tri par graphe
   reste un bonus quand le graphe vit, jamais une condition de fonctionnement — un tri qui
   EXIGERAIT un graphe bien tenu serait disqualifié ; celui-ci dit juste « plus fin » quand on lui
   donne plus.
2. **La formule crée sa propre incitation.** Aujourd'hui, remplir `dependsOn` n'a qu'une
   récompense punitive (verrouiller de l'aval). Avec la température, il gagne une récompense
   positive : **déclarer « #205 dépend de #150 », c'est faire chauffer #150** — poser une dep
   devient l'acte de priorisation gratuit. On peut s'attendre à ce que le taux de remplissage
   monte une fois que le bénéfice est visible.
3. **Rendre le bénéfice visible, sans moraliser.** Deux gestes d'affichage suffisent (aucune
   nag-UI, aucun « votre graphe est sale ») :
   - le brief `next` et le panneau affichent la décomposition en tiers (`24,02° = auto 19 + nature 5
     + seed 0`) — un ticket dont la ligne dit `auto 5` montre de lui-même que son tiers machine est
     bas faute de liens, et le bloc « Bloque » (existant) est juste à côté pour corriger ;
   - le skill, à la création d'une tâche, pose UNE question mécanique (« cette tâche débloque-t-elle
     ou attend-elle un ticket existant ? ») — une ligne dans formats.md, au même titre que l'arbre
     de classement des types (#230 §3).

**Position** : défaut acceptable + incitation douce par la lisibilité. Pas de garde-fou dur, pas
de champ obligatoire, pas de score d'hygiène — si dans six mois le graphe est toujours à 33 %,
la file sera « seed + FIFO » et ce sera toujours mieux que l'ordre de stage qu'on enterre.

---

## 6. Modèle de données — le slot `team` recyclé

### 6.1 Le champ : `heat`, pas `temperature`

**Recommandation : le champ YAML stocké s'appelle `heat` ; « température » est le nom de la
valeur calculée.** Ce n'est pas de la coquetterie, c'est le garde-fou anti-confusion : si le champ
s'appelait `temperature: 60` et que l'UI affiche 45,62° (le seed n'est qu'un tiers, /3, plus base
et auto), l'utilisateur conclurait à un bug. La métaphore physique tombe juste : **on APPORTE de la
chaleur (`heat`), on LIT une température** — le champ est le radiateur (0–100, la poignée de
l'idée B), l'affichage est le thermomètre (auto + base + seed). Et `heat` est court, anglais comme
tout le schéma (`status`, `size`, `kind`), agréable en flag CLI.

### 6.2 Le slot, pièce par pièce

| Pièce du slot `team` (supprimée par #230) | Remplacée par |
|---|---|
| Champ `team: Team` de `TaskNode` (obligatoire, enum) | `heat?: number \| null` — **optionnel**, absent = froid (0). Frontière de parse : `raw.heat ?? null`. |
| Validation (enum 8 valeurs, requis) | `heat` : nombre, `0 ≤ heat ≤ 100` (la poignée 0–100 de l'idée B ; contribue `heat/3` au calcul), max 2 décimales ; **rejet** hors bornes ou non numérique ; absent = valide. |
| Flag CLI `--team <t>` (add/update) | `--heat <n>` (add/update) ; `update --heat 0` ou `--no-heat` pour refroidir. |
| Filtre `list --team` / `nextQueue(opts.team)` | `opts.type` (le filtre par nature, #230) — le filtre par chaleur n'a pas de sens (`next` EST le tri par chaleur). |
| Chip team des cartes/lignes (`TEAM_ABBR`) | Le chip température (§7) — même composant `Chip`, même emplacement. |
| Ligne `Team :` du brief agent | `Température : 48,67° (auto 18,67 · nature 30 · seed 0)` — la décomposition en trois tiers, pas juste le nombre. |

### 6.3 Défaut et migration — confirmés

- **Défaut : absent = froid.** Pas de `heat: 0` écrit dans les YAML — l'absence EST le zéro (même
  régime que `kind` absent = 'task'). Le seed est posé « UNIQUEMENT pour faire ressortir un
  ticket » : la norme statistique est qu'aucune tâche n'en a.
- **Migration : AUCUNE. Confirmé.** Les 213 tâches existantes n'ont pas le champ → toutes seed 0
  → leur température = auto + base(type), calculée à la première lecture. Zéro backfill, zéro script,
  zéro réécriture de YAML. (La suppression de `team:` est le chantier de #230, pas celui-ci ; les
  deux peuvent partager le commit de schéma mais ce doc n'ajoute RIEN à la migration des fichiers.)
- Rétrocompat : un YAML d'avant le champ est parfaitement valide à jamais. L'archive n'est pas
  re-validée (précédent `zone`, #230 §4.1).

---

## 7. Affichage — une chaleur en monochrome strict

Le DS est non négociable : neutrals + UN accent bleu réservé actif/sélection, aucune couleur
sémantique (`docs/design.md` §1, §3.6). Donc : **pas de dégradé bleu→rouge, pas d'orange, et pas
de détournement de l'accent** (la chaleur n'est ni « active » ni « sélectionnée » — lui donner le
bleu diluerait sa rareté, qui est toute sa valeur). Le fun doit venir d'ailleurs : du **mot**, du
**glyphe °**, et de la **précision à deux décimales** — « 48,67° » est intrinsèquement plus
amusant que « P1 », sans un pixel de couleur. Deux pistes sobres :

**Piste 1 — le relevé mono (recommandée).** Un chip `Chip` existant : `48,7°` en
`text-[11px] tabular-nums text-neutral-500` (le plancher de contraste du DS), à l'emplacement
exact de l'ex-chip team. **Nouveau seuil d'affichage : ≥ 33,33° (UN tiers)** sur les cartes et
lignes. La borne « 50 = moitié humaine » du 50/50 saute avec les tiers ; le seuil naturel qui la
remplace est **un tiers plein** : un ticket qui a accumulé l'équivalent d'au moins un tiers de
chaleur — d'où qu'elle vienne (seed posé, base d'un bug, ou blocages+âge d'un vieux hub) — mérite
son chip ; en dessous, l'écran reste calme (le gros du backlog tiède est masqué). Un seul nombre,
aligné sur le modèle. (Alternative « fun-max » de Rémi : afficher TOUTES les températures partout —
plus joueur, mais ~200 chips = bruit contraire au DS calme ; je recommande le seuil.) Le panneau de
détail, lui, affiche toujours la température avec sa décomposition en tiers (c'est là qu'on comprend
et qu'on règle `heat`, via un `GhostInput` — pattern maison). Coût : un chip conditionnel, zéro
composant nouveau.

**Piste 2 — la jauge de mercure.** Dans le panneau (pas les listes) : une barre de progression
fine `rounded-full` (le seul arrondi total autorisé, déjà réservé aux barres) remplie à T %, en
`bg-neutral-900` sur piste `bg-neutral-200` — un thermomètre à mercure, littéralement monochrome.
L'intensité est portée par la **longueur**, pas par la couleur : conforme au DS à la lettre, et la
métaphore visuelle est immédiate. Optionnel par-dessus la Piste 1 ; à ne PAS mettre sur les cartes
(bruit × 200).

Écarté explicitement : moduler la couleur du texte par la chaleur (neutral-400→900) — ça
transformerait une échelle de CONTRASTE (qui encode la hiérarchie d'information dans tout le DS)
en échelle de VALEUR métier, et les tickets tièdes tomberaient sous le plancher d'accessibilité.

---

## 8. Alternatives honnêtes — A vs B vs C

| | **(A) Pur graphe** (blocages + âge, aucun champ) | **(B) Pur seed** (température 100 % manuelle) | **(C) Hybride calculé** (la formule §2) |
|---|---|---|---|
| Cérémonie | Zéro champ, zéro geste | Un geste par ticket qu'on veut ordonner | Un geste optionnel, rare |
| Levier manuel | **Aucun** — pour faire remonter un ticket isolé, il faut inventer de fausses deps (perversion du graphe garantie) | Total et souverain (le champ prend tout) | Réel mais NON souverain — un tiers (≤ 33,33), qu'un ticket naturellement chaud peut dépasser (§2.5) |
| Pourrissement | Aucun (tout est dérivé) | **Maximal** — c'est le champ priority classique, la critique de Rémi s'applique en entier | Quasi nul : le calcul vieillit à la place de l'humain |
| Graphe clairsemé (l'état réel : 33 %) | Dégénère en FIFO **sans recours** | Indifférent | Dégénère en seed + **base(type) + âge** — stratifié par nature, jamais FIFO plat (§2.4) |
| Déterminisme | Oui | Oui (et stable dans le temps) | Oui (à date donnée, §4) |
| Coût d'implémentation | Fermeture transitive + tri | Un champ + tri | Les deux — mais le slot `team` paie le champ, et `graphNeighborhood` préfigure la fermeture |

**Un pur-graphe (A) suffirait-il ?** Presque — et c'est le piège. A couvre le régime de croisière
(80 % des jours, personne ne touche rien et la file est bonne). Mais le jour où il faut faire
passer EN TÊTE un ticket qui ne bloque rien — le fix du site avant une démo, le mail légal à
envoyer aujourd'hui — A n'offre **aucun recours** sauf tricher le graphe avec des dépendances
fictives, ce qui détruit le signal `b` pour tous les jours suivants. C'est exactement comme ça que
les systèmes auto se font abandonner : pas parce que le calcul est mauvais, mais parce qu'il n'y a
pas de soupape. **Le seed est la soupape** ; il coûte un champ optionnel dans un slot déjà payé.
La température seed n'est donc pas un gadget par-dessus A : c'est ce qui rend A **habitable**. En
tiers, cette soupape est *dosée* (un tiers, pas un court-circuit) : elle laisse remonter un ticket
parmi ses pairs sans permettre d'enfouir un incident sous un caprice — un compromis meilleur que le
« tout ou rien » du seed souverain.

**Reco : C, en partition TIERS.** B seul est le champ priority que Roadmapped a toujours refusé ;
A seul est fragile au premier cas d'urgence ; C est A avec une soupape dosée, au prix d'un champ que
la fusion stage+team libère au même moment. Et la base par type (le 3e tiers) donne à A un plancher
de qualité même graphe vide. L'alignement des planètes est réel.

---

## 9. Ce qu'on perd / risques / questions ouvertes

### Ce qu'on perd, honnêtement

1. **La stabilité temporelle de `next`.** L'ancienne file (stage, id) ne bougeait qu'aux
   écritures ; la nouvelle bouge aussi à minuit UTC. Assumé et borné (§4) — mais c'est un
   changement de nature qu'il faut documenter dans le skill : « la file d'hier n'est pas la
   preuve de la file d'aujourd'hui ».
2. **La lisibilité instantanée du tri.** « Build avant Launch, puis plus ancien » s'expliquait en
   une phrase ; « 48,67° » exige la décomposition (auto/nature/seed) pour être compris. Racheté par
   l'affichage systématique de cette décomposition (brief, panneau) — jamais le nombre seul.
3. **Un pilotage de file par le stage.** Il n'existe plus AUCUN moyen de dire « toute cette
   catégorie d'abord » — ni par type (refusé en #230 §5.1-a, le type n'encode pas l'urgence), ni
   par epic (refusé par Rémi, ce doc), ni par stage (supprimé). La priorité est désormais
   par-ticket (seed) ou émergente (graphe). C'est le modèle voulu ; le dire.

### Risques

4. **Le seed-inflation — atténué par les tiers.** Si tout finit seedé à 100, le tiers humain
   sature partout et cesse de discriminer. MAIS, contrairement au 50/50, un seed maxé ne domine
   pas : les deux autres tiers continuent de trier (un bug chaud passe devant un seed max, §2.5).
   Le seed-inflation dégrade donc gracieusement vers « auto + base » au lieu de tout écraser —
   c'est un avantage net des tiers sur le seed souverain. Contre-forces inchangées : défaut froid,
   absence de champ dans le YAML, calcul qui rend le seed rare. À surveiller, pas à sur-designer.
5. **Les constantes (20/13,33 du tiers machine, 90 j, 4 blocages, table de base, /3 du seed) sont
   des a priori.** Calibrées sur les mesures du repo (max 4 dépendants directs, backlog de ~6 mois),
   pas sur l'usage. Les changer plus tard change la file mais casse zéro donnée (rien n'est stocké)
   — c'est LE luxe de l'hybride : la formule est re-réglable à tout moment par une décision produit
   versionnée.
6. **Fermeture transitive et cycles.** Un cycle de deps rendrait `b` ambigu — même réponse que
   `graphNeighborhood` : ensembles `seen`, un cycle ne diverge pas et compte chaque nœud une fois.
   (La validation devrait de toute façon interdire les cycles — à vérifier, hors périmètre.)
7. **Interaction avec `kind: milestone`** (aucun posé à ce jour) : un jalon-cible qui agrège des
   deps est en FIN de chaîne — il reste froid et locked tant que tout n'est pas done, puis entre
   dans la file déjà chaud de son âge : comportement correct sans règle spéciale. Un jalon dont
   dépendent des tâches aval (post-launch) chauffe comme n'importe quel bloqueur. Rien à coder.

### Questions ouvertes pour Rémi

1. **La partition est TRANCHÉE : tiers égaux** (§2.5, ta décision) — je ne la rouvre pas. Le seul
   réglage de goût qui reste dans le tiers machine : le ratio blocages:âge (j'ai gardé 3:2 →
   20/13,33). Tu le sens, ou tu veux les blocages encore plus dominants (4:1) ? Anecdotique, dis-le
   si tu as un avis.
2. **Les valeurs de base par type** (§2.4, rescalées dans le tiers : bug 30 · business 20 ·
   legal 18 · feature 14 · design 12 · brainstorm 10 · marketing 7 · communication 7 · chore 5) —
   l'échelle te parle ? Point discutable : legal/business à 18–20 alors qu'ils sont souvent
   « importants mais pas ce jour » ; je les ai mis chauds pour l'échéance-dure — descends-les vers
   8–12 si tu les pilotes plutôt au seed. Et bug à 30 (proche du tiers plein) : assez haut pour
   partir devant, assez bas pour qu'un chore très bloquant le double (démontré §3) — OK ?
3. **`heat` comme nom du champ stocké, sur 0–100, contribuant `heat/3`** (« température » réservé à
   la valeur calculée) — ou tu préfères poser le seed directement sur 0–33,33 (le tiers brut, moins
   familier mais sans facteur /3) ? Je recommande 0–100 (ta poignée d'origine).
4. **Le seuil d'affichage à un tiers (≥ 33,33°)** sur les cartes/lignes (piste 1 §7) — ou tu veux
   la version fun-max « toutes les températures partout » (plus joueur, plus bruyant, contre le DS
   calme) ? Je recommande le seuil à 33,33.
5. **Minuit UTC** comme instant de bascule (granularité jour) — ou granularité HEURE (file plus
   vivante, moins stable en session longue) ? Je recommande le jour.
6. **`--as-of`** en CLI (debug/replay) : utile ou YAGNI pour l'instant ? (Les tests injectent la
   date de toute façon — c'est purement une commodité humaine.)
7. La question du skill à la création (« ça débloque / ça attend quoi ? ») — une ligne dans
   formats.md, ou tu juges que c'est déjà de la cérémonie de trop ?
