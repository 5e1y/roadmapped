# Spec — Progression globale et milestones bloquants

**Date** : 2026-07-08 · **Statut** : DRAFT — la sémantique du verrou milestone (§ Conception b) est un VRAI brainstorm, à trancher par Rémi avant création des tâches
**Contexte** : `2026-07-07-roadmaped-v2-design.md` (vision « arbre d'achievements » : voir ce qui est faisable, verrouillé, parallélisable, **et quand c'est fini**)

## Problème

Deux frictions, constatées dans le code :

1. **Aucune réponse à « où en est-on globalement ? »**. La granularité existe partout
   SAUF au niveau du projet : compteur done/total par stage (`countTasksDeep`,
   `src/lib/tasks.ts:127`, consommé par `SectionAccordion.tsx:24` et
   `RoadmapColumns.tsx:87`), compteur de sections ouvertes/terminées dans le header du
   Backlog (`Backlog.tsx:101`), photo du JOUR dans `sitrep` (`render.ts:178` — done
   aujourd'hui, in_progress, file). Mais nulle part un % de progression vers la fin de
   la roadmap — alors que la vision v2 promet explicitement « et quand c'est fini ».
   Piège supplémentaire : l'archive. Une tâche archivée sort de `tree.sections` — un
   compteur naïf sur les sections actives RECULE à chaque archivage.

2. **Aucun moyen de marquer un ticket-charnière**. Le seul concept « milestone » du
   schéma est le champ `milestone: <slug>` adossé à `_roadmaps.yaml` — legacy avancé,
   non affiché par le dashboard, que `formats.md` dit lui-même de ne pas utiliser.
   Un ticket dont tout le reste dépend (ex. « socle API stable ») est aujourd'hui une
   ligne comme les autres : même glyphe, même carte, rien ne signale qu'il tient
   7 tâches verrouillées derrière lui. Le verrou existe (`dependsOn` +
   `computeAvailability`, `src/lib/roadmap.ts:35`) mais l'importance est invisible.

## Décision (cadre posé par Rémi)

Les deux features entrent :

- **(a) Progression vers le goal** : un indicateur global de progression, visible dans
  le dashboard et servi à l'agent.
- **(b) Notion de milestone** : un ticket-charnière identifiable, qui verrouille du
  travail tant qu'il n'est pas done.

**Non tranché — et volontairement soumis à brainstorm** : la sémantique exacte du
verrou de (b). Trois options comparées ci-dessous, avec recommandation argumentée.
La décision finale appartient à Rémi (tête des points ouverts). Le découpage en tâches
est écrit pour l'option recommandée ; il sera ajusté si Rémi tranche autrement.

## Conception

### (a) Progression vers le goal

**Le % : compte simple de tâches, PAS de pondération par size.** Recommandation ferme :

- `size` est optionnelle (`S | M | L | null`, `tasks.ts:62`) et effectivement absente
  sur une partie du parc (quicks notamment) — toute pondération exige une règle
  arbitraire pour `null` ET un barème arbitraire (1/2/3 ? 1/3/8 ?). C'est de la
  pseudo-précision sur données incomplètes.
- `countTasksDeep` est documentée comme LA source unique des compteurs (« pour que la
  somme des sections égale toujours le total affiché ») — introduire une deuxième
  métrique pondérée crée deux vérités qui divergent à l'écran.
- Un % pondéré n'est pas rétro-stable : re-sizer une tâche ferait bouger la
  progression sans qu'aucun travail n'ait été fait ou défait.

**La formule** : `done/total` récursif (sous-tâches comprises), avec deux règles qui
règlent le piège de l'archive :

- **l'archive compte, au numérateur ET au dénominateur** — une tâche archivée est
  done par construction (`archiveTask` exige `status: done`, cf. formats.md § Archive).
  Archiver ne fait donc jamais reculer le %.
- **les stages `abandoned` sont exclus des deux côtés** — un travail abandonné ne fait
  pas partie du goal. `open`, `done`, `dormant` comptent (dormant = en veille, toujours
  dans le goal).

Nouvelle fonction pure à côté de la source unique existante :

```ts
// src/lib/tasks.ts — à côté de countTasksDeep (même famille, même fichier)
export function globalProgress(tree: TaskTree): { done: number; total: number; pct: number }
```

Implémentation : `countTasksDeep` sur les tâches des sections actives non-`abandoned`
+ `countTasksDeep` sur `tree.archive` (où done = total par invariant). `pct` arrondi
entier, `0` si `total === 0`.

**La portée : globale uniquement.**
- Par stage : existe déjà (`SectionAccordion`, `RoadmapColumns`) — rien à faire.
- Par roadmap `_roadmaps.yaml` : écartée — legacy non affiché (`milestoneProgress`,
  `roadmap.ts:122`, ne sert que `task.mjs roadmap`), on ne construit pas d'UI dessus.

**L'affichage** : la sidebar n'existe plus (`App.tsx:101` — les tabs vivent dans
`ViewHeader`). L'emplacement naturel est donc le **slot `meta` du header de la vue
Roadmap** (`RoadmapView.tsx:53`, prop `meta` de `ViewHeader.tsx:22`) : une barre de
progression fine (div monochrome, pas de lib) + `132/210 · 63 %`. Le Backlog garde son
meta actuel (compteur de sections) — deux vues, deux réponses : « où en est-on » sur la
Roadmap, « qu'est-ce qui est ouvert » sur le Backlog.

**Pour l'agent** : une ligne `progression: 132/210 (63 %)` dans `sitrepText`
(`render.ts:178`) — CLI `sitrep` et tool MCP `sitrep` la servent gratuitement (même
rendu partagé, décision #90).

### (b) Milestone qui verrouille — brainstorm des 3 sémantiques

#### Option (i) — verrouille les stages POSTÉRIEURS

Une tâche milestone du stage `NN` non-done ⇒ toute tâche d'un stage `> NN` est `locked`.

- **Pour** : c'est le sens produit intuitif d'un jalon de phase (« on ne GTM pas tant
  que le build n'a pas passé sa porte ») ; zéro câblage manuel — le stage suffit.
- **Contre** : le verrou devient **implicite et invisible dans le Graphe**. Toute la
  mécanique actuelle repose sur « l'état est calculé depuis `status` + `dependsOn` —
  jamais stocké » (formats.md § Roadmap) : `missingPrereqs` (`roadmap.ts:61`) et le
  panneau « Prérequis manquants (#…) » listent des IDS d'arêtes ; `RoadmapGraph` dessine
  les arêtes `dependsOn`. Une tâche locked SANS arête vers ce qui la verrouille casse ce
  contrat — il faut inventer un deuxième canal de verrou dans `computeAvailability`
  (signature stage-aware), dans le panneau, dans le graphe (arêtes fantômes ?), dans le
  brief agent. Cas limites nombreux : milestone en `08-mature` (ne verrouille rien),
  plusieurs milestones dans un même stage (AND implicite), milestone elle-même
  verrouillée. Surface sémantique large pour un besoin qu'on peut exprimer autrement.

#### Option (ii) — verrouille TOUT le backlog

Une milestone non-done ⇒ seules elle (et ses propres deps) sont `available`.

- **Pour** : énoncé simple, modélise le « rush de release » (tout le monde sur le jalon).
- **Contre** : contredit frontalement la proposition centrale du produit — « on voit ce
  qui est faisable maintenant, ce qui est **parallélisable** » (design v2). Une seule
  milestone vide `nextQueue` (`roadmap.ts:150`) de tout sauf elle-même ; deux milestones
  simultanées s'inter-verrouillent (deadlock, sauf règle d'exemption ad hoc). C'est un
  mode de FOCUS temporel, pas une propriété du graphe — si le besoin émerge un jour,
  c'est un filtre d'affichage, pas un état calculé.

#### Option (iii) — pas de nouveau verrou : milestone = tâche normale + `dependsOn`

Une milestone est une tâche ordinaire dont les autres dépendent via `dependsOn`. Le
verrou **existe déjà** : `computeAvailability` (`roadmap.ts:35`) rend `locked` toute
tâche dont une dep n'est pas done — cycles validés (`validate.ts:66`), deps archivées
satisfaites, `nextQueue` déjà dépendance-aware. On ajoute seulement un **marqueur de
nature** pour l'identité visuelle et l'outillage.

- **Pour** : zéro nouvelle sémantique d'availability — `computeAvailability`,
  `missingPrereqs`, `nextQueue`, la validation, le Graphe, le brief agent fonctionnent
  TELS QUELS. Le graphe reste honnête : chaque verrou a son arête visible. Le bloc
  « Bloque » du panneau (`reverseDependents`, `roadmap.ts:73`) donne déjà l'inventaire
  exact de ce que la milestone tient. Rétrocompat totale, cohérent avec les invariants
  v2 (« état calculé, jamais stocké »).
- **Contre** : le câblage est manuel — si 12 tâches doivent attendre le jalon, c'est
  12 arêtes. Mitigé par (1) la pratique réelle : on fait dépendre les TÊTES de chaîne,
  pas chaque tâche (la transitivité verrouille le reste) ; (2) un sucre CLI/MCP :
  `update <id> --depends-on +42` (forme additive, voir plus bas).

#### Recommandation : (iii)

C'est l'option qui livre la valeur (identifier un ticket-charnière + verrou effectif)
au coût minimal, sans inventer un deuxième canal de verrou, et **elle ne ferme aucune
porte** : si l'usage révèle un vrai besoin de porte de stage, l'option (i) pourra
s'ajouter PAR-DESSUS (une « milestone de stage » = milestone (iii) + arêtes générées ou
availability stage-aware v2). L'inverse n'est pas vrai : partir sur (i) ou (ii) engage
une sémantique implicite difficile à retirer.

### Modèle pour l'option recommandée — `kind: 'milestone'`

**Valeur d'enum additive sur `kind`, PAS un booléen `isMilestone`.** Deux raisons :

- `isMilestone` collisionnerait mentalement avec le champ `milestone: <slug>` existant
  (legacy `_roadmaps.yaml`) — deux champs « milestone » de sens différents dans le même
  YAML, intenable.
- `kind` porte déjà la nature du ticket (`'task' | 'quick'`, `tasks.ts:57`) avec toute
  la mécanique rétrocompatible en place : défaut `'task'` au parse (`toTaskNode`,
  `tasks.ts:174`), champ omis du YAML quand défaut (`dumpTask`, `taskWrites.ts:168`),
  enum validée (`validate.ts:21`). Ajouter `'milestone'` suit exactement le précédent
  `kind: 'quick'`/`startedAt` : **additif, aucun YAML existant ne change**. Bonus :
  milestone et quick sont exclusifs par construction (une valeur), pas de garde-fou
  croisé à écrire.

Règles de validation v1 : `'milestone'` accepté dans l'enum, rien de plus. Une
milestone se done comme un task normal (`--verification` exigée — c'est un jalon, on
vérifie). Pas d'interdiction de size/sous-tâches : YAGNI tant qu'un cas réel ne le
demande pas.

### Impact par surface (option (iii))

- **`src/lib/tasks.ts`** : `TaskNode.kind` élargi à `'task' | 'quick' | 'milestone'` ;
  `toTaskNode` inchangé (`raw.kind ?? 'task'`). + `globalProgress` (feature a).
- **`src/lib/validate.ts:21`** : enum kind + `'milestone'`. Les règles quick (size L,
  outcome au done) ne s'appliquent qu'à `'quick'` — inchangées.
- **`src/lib/taskWrites.ts`** : `dumpTask` écrit `kind` quand `'quick'` OU `'milestone'`
  (ligne 168 — le défaut `'task'` reste omis) ; `createTask` accepte `kind: 'milestone'`
  (ligne 325).
- **`src/lib/roadmap.ts`** : **AUCUN changement** de `computeAvailability`/`nextQueue` —
  c'est tout l'intérêt de (iii).
- **CLI `scripts/task.mjs`** : `add --kind milestone` (flag nouveau, valeurs
  `task|quick|milestone` ; `quick` reste la commande dédiée aux mini-tickets) ;
  `update --depends-on +42,-12` — forme additive/soustractive dans `parseDeps`
  (`task.mjs:85`, aujourd'hui liste complète ou `null`), pour câbler un jalon sur
  plusieurs tâches sans réciter leurs listes. La forme liste actuelle reste valide.
- **MCP `scripts/mcp-server.mjs`** : mêmes params sur les tools `add`/`update`
  (le schéma de tool EST la doc — spec MCP du 2026-07-08).
- **Dashboard** : glyphe distinct (diamant ◇ todo / ◆ done, remplaçant le glyphe
  statut) dans `TaskRow`, cartes `RoadmapColumns` et nœuds `RoadmapGraph` (bordure
  renforcée, monochrome — pas de couleur nouvelle) ; badge « jalon · bloque N » via
  `reverseDependents` sur carte et panneau (`TaskPanel` affiche déjà le bloc
  « Bloque ») ; le header Roadmap (feature a) ajoute « ◆ prochain jalon : #42 … » —
  première milestone non-done dans l'ordre de `nextQueue` étendu aux locked (ordre
  stage puis id).
- **`sitrep`** (`render.ts:178`) : ligne progression + ligne
  `jalon: ◆ #42 titre (bloque 7)` quand une milestone non-done existe.
- **Docs** : `skills/roadmapped/references/formats.md` (schéma kind, réflexe « faire
  dépendre les têtes de chaîne du jalon, la transitivité fait le reste ») + SKILL.md.

## Découpage en tâches d'implémentation

Ordonnées, chaînables par `dependsOn` (numéros relatifs à cette liste). Les tâches 4→8
supposent la reco (iii) validée.

1. **lib — `globalProgress(tree)`** dans `src/lib/tasks.ts` (à côté de
   `countTasksDeep`) : archive comptée done, stages `abandoned` exclus, `pct` entier,
   total 0 → pct 0. Tests Vitest (`tasks.test.ts`) : archive, abandoned, arbre vide.
2. **UI — barre de progression header Roadmap** *(dépend de 1)* : slot `meta` de
   `ViewHeader` dans `RoadmapView.tsx` — barre fine monochrome + `x/y · N %`.
3. **sitrep — ligne progression** *(dépend de 1)* : `render.ts#sitrepText`, ligne
   `progression: x/y (N %)` ; CLI et MCP servis par le rendu partagé. Test
   `render.test.ts`.
4. **Modèle — `kind: 'milestone'`** : `tasks.ts` (type), `validate.ts` (enum),
   `taskWrites.ts` (`dumpTask` écrit milestone, `createTask` l'accepte). Tests :
   round-trip YAML (kind omis pour task, écrit pour milestone), validation.
5. **CLI + MCP — création et câblage** *(dépend de 4)* : `add --kind milestone` ;
   `parseDeps` accepte `+id`/`-id` (additif/soustractif, mixable, liste pleine et
   `null` inchangées) sur `update --depends-on` ; miroir sur les tools MCP `add`/
   `update`. Tests `task.test.mjs` + `mcp-server.test.mjs`.
6. **Dashboard — rendu milestone** *(dépend de 4)* : glyphe diamant + badge
   « jalon · bloque N » (`reverseDependents`) dans `TaskRow`, `RoadmapColumns`,
   `RoadmapGraph`, `TaskPanel`.
7. **Header — prochain jalon** *(dépend de 2 et 4)* : « ◆ #id titre » dans le meta du
   header Roadmap quand une milestone non-done existe ; ligne jalon dans `sitrep`.
8. **Docs — formats.md + SKILL** *(dépend de 4 et 5)* : schéma `kind: milestone`,
   forme `--depends-on +id`, réflexe de câblage par têtes de chaîne, note sur la
   distinction avec le champ legacy `milestone: <slug>`.

## Risques / points ouverts

- **[À TRANCHER — Rémi] Sémantique du verrou** : (i) stages postérieurs / (ii) tout le
  backlog / (iii) pas de nouveau verrou, `dependsOn` existant + marqueur `kind`.
  **Reco : (iii)** — les tâches 4→8 en dépendent ; (i) resterait ajoutable par-dessus.
- **[À confirmer] % simple vs pondéré S/M/L** — la spec est écrite en compte simple
  (reco ferme, § a) ; si Rémi veut la pondération, `globalProgress` change seule
  (l'affichage consomme `{done,total,pct}` sans connaître la formule).
- **Vocabulaire** : `kind: 'milestone'` cohabite avec le champ legacy
  `milestone: <slug>` (`_roadmaps.yaml`). Cohabitation v1 (l'un est une nature, l'autre
  un regroupement), mais la déprécation du legacy mérite une décision séparée — hors
  périmètre ici.
- **Dénominateur mouvant** : ajouter des tâches fait mécaniquement reculer le % — c'est
  honnête (le goal a grossi) mais peut surprendre ; aucun lissage prévu (YAGNI).
- **Graphe** : le diamant doit rester lisible en zoom-out — vérification visuelle à
  l'artefact, pas de test automatisable utile.

> **Décision verrouillée (Rémi, 2026-07-08)** : verrou milestone = option **(iii)** (via
> `dependsOn` + marqueur `kind:'milestone'`, pas de nouveau lock) ; progression = **compte
> simple** de tâches. Le REGROUPEMENT (ex-« milestone » comme thème) passe sous le nom
> **« Epic »** — voir la spec unifiée `2026-07-08-hierarchie-regroupement.md` (#131) qui
> supersede cette partie. Ce doc reste le brainstorm de référence.
