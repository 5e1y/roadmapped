# Spec — Hiérarchie & regroupement : epic, milestones-jalons, progression

**Date** : 2026-07-08 · **Statut** : DRAFT — en attente d'approbation Rémi · **Tâche** : #131
**Fusionne** : #6 (progression + milestones bloquants) — supersede la partie « milestone » de `2026-07-08-progress-milestones.md`
**Touche le modèle de données** : `src/lib/tasks.ts`, `validate.ts`, `taskWrites.ts`, `roadmap.ts`, le CLI, le dashboard, `skills/roadmapped/references/formats.md`

## Contexte et diagnostic

Roadmapped porte **déjà six mécanismes** de regroupement/relation : les 8 stages (cycle de
vie), le champ `milestone` + `_roadmaps.yaml` (thème/goal), `subtasks` (parent→enfant),
`links` (relations souples), `dependsOn` (ordre/verrou), et #6 propose d'ajouter
`kind:'milestone'` (verrou). Deux problèmes en découlent :

1. **Le mot « milestone » est surchargé.** Le champ `milestone` sert au REGROUPEMENT
   (`milestoneProgress()` filtre `t.milestone === slug`), tandis que #6 réutilise le même mot
   pour un VERROU. Deux sens, un mot → confusion garantie dans le schéma, le CLI et l'UI.

2. **Le regroupement transverse existe mais dort.** Le champ `milestone` est présent sur
   **119/119 tâches, toutes à `null`** ; `_roadmaps.yaml` n'existe pas. La capacité de
   regrouper « spec + tasks + fixes d'un même projet » à travers les stages est donc déjà
   dans le schéma — jamais activée, jamais exposée dans l'UI.

Le besoin exprimé par Rémi : regrouper les tâches d'un même gros projet (ex. « refonte du
graphe » = sa spec, ses tâches d'implémentation, ses fixes ultérieurs), **transversalement
aux stages** — une fix qui arrive trois semaines plus tard reste rattachée au projet sans
être coincée sous un parent figé.

## Décision (tranchée par Rémi)

- **EPIC = une dimension (un champ), pas un nouveau type.** On **renomme `milestone` → `epic`**
  (le champ dormant), transverse aux stages. Une tâche porte `epic: <slug>` (optionnel). Le
  dashboard groupe par epic. Migration nulle (tout est `null` aujourd'hui).
- **« milestone » se libère et désigne un JALON/verrou.** `kind:'milestone'` (additif, comme
  `kind:'quick'`) : une tâche-jalon dont d'autres tâches dépendent via `dependsOn`. **Aucune
  nouvelle sémantique de verrou** : `computeAvailability` gère déjà le lock via `dependsOn`
  (c'était l'option (iii), recommandée, du brouillon #6). Le jalon a juste un **rendu distinct**
  (diamant) et un compteur « bloque N ».
- **Vocabulaire final, sans collision :**

  ```
  Stage      où dans le pipeline (fixe, 01→08)          ── colonne du dashboard
    Epic     quel projet/thème (transverse aux stages)  ── champ `epic`, regroupe
      Task / Quick / Milestone   l'unité (kind)
        Subtask  découpage-checklist interne à une tâche
    dependsOn  ordre & verrou (un jalon = une cible de dependsOn)
  ```

- **Progression** : `%` global `done/total` + `%` par epic. Compte simple de tâches (pas de
  pondération par size — décision ferme, YAGNI ; seul le calcul changerait si on veut pondérer
  plus tard).

## Conception (ancrée au code)

### 1. Epic — le champ (ex-`milestone`)

- **Schéma** (`src/lib/tasks.ts`) : `TaskNode.milestone` → `TaskNode.epic: string | null`.
  Parse : `epic: raw.epic ?? raw.milestone ?? null` — **rétrocompat** : un ancien YAML qui
  porte encore `milestone:` est lu comme `epic`. (En pratique tous `null`, donc indolore.)
- **Écriture** (`taskWrites.ts`) : `FIELD_ORDER` remplace `milestone` par `epic` ; `dumpTask`
  écrit `epic`. Les anciens `milestone: null` disparaissent au prochain dump (comme tout champ
  réécrit). Pas de champ `milestone` résiduel.
- **Validation** (`validate.ts`) : `epic` optionnel, string slug si présent (même regex slug
  que les ids de section). Pas d'exigence d'existence — un epic est un simple tag partagé (pas
  de fichier de déclaration obligatoire).
- **Progression par epic** : `milestoneProgress()` → **`epicProgress(tree, slug)`**
  (`roadmap.ts` l.122) : filtre `t.epic === slug`, renvoie `{done, total}`. Mémoïsable comme
  `computeAvailability` si appelé par ligne.
- **`_roadmaps.yaml` → `_epics.yaml`** (optionnel) : déclaration facultative des epics (titre,
  ordre, couleur d'accent ?). Absent = les epics sont dérivés des valeurs `epic` présentes sur
  les tâches (auto-découverte). L'interface `Roadmap`/`Milestone` (`tasks.ts` l.106) devient
  `Epic`. **Rétrocompat lecture** : si `_roadmaps.yaml` existe, il est lu comme `_epics.yaml`.

### 2. Milestone — le jalon (kind)

- **Schéma** : `kind: 'task' | 'quick' | 'milestone'` (additif, écrit seulement si ≠ task,
  exactement comme `quick` l'est déjà dans `dumpTask`).
- **Sémantique = zéro nouveau code de verrou.** Un jalon est une tâche normale que d'autres
  ciblent en `dependsOn`. `computeAvailability` (`roadmap.ts`) verrouille déjà tout dépendant
  d'une tâche non-`done` — donc un jalon non fait verrouille automatiquement ses dépendants.
  On ne touche PAS la logique de disponibilité.
- **Rendu** : glyphe diamant (au lieu du cercle/StatusGlyph) dans TaskRow, TaskPanel, la
  roadmap ; badge « bloque N » = `reverseDependents(tree, id).length` (fonction existante,
  utilisée dans TaskPanel). Le cadenas des dépendants reste celui de #130 (déjà livré).
- **Sucre CLI** : `add --kind milestone` ; un helper `--blocks 1,2` optionnel qui ajoute la
  milestone aux `dependsOn` des tâches citées (l'inverse ergonomique de `--depends-on`).

### 3. Progression globale

- **`globalProgress(tree)`** (`roadmap.ts`) : `done / total` sur les tâches actives
  (archive comptée `done`, stages `abandoned`/`dormant` exclus) — cf. `countTasksDeep`.
- **Affichage** : header de la vue Roadmap (barre + `x/y`), et **une ligne dans `sitrep`**
  (`render.ts`) — le CLI/agent voit l'avancement sans ouvrir le dashboard.
- Par epic : réutilise `epicProgress` dans le regroupement du dashboard et, éventuellement,
  dans `roadmap`/`sitrep`.

### 4. Dashboard — regroupement par epic

- **Backlog** : un mode « grouper par epic » (toggle dans `ViewHeader`, état persisté via
  `uiPersist`) qui remplace le regroupement par stage. Un bloc par epic, tâches triées par
  stage à l'intérieur ; les tâches sans epic tombent dans un bloc « Sans epic ».
- **Panneau** : champ `epic` éditable (peau ghost, combobox des epics existants + création à
  la volée), à côté des autres champs.
- **Roadmap** : les epics peuvent colorer/annoter les cartes (accent secondaire) — optionnel,
  à ne pas sur-charger la vue monochrome (décision design séparée si besoin).

## Découpage en tâches d'implémentation (chaînables par `dependsOn`)

1. **Schéma epic** — renommer `milestone`→`epic` dans `TaskNode`, parse rétrocompat
   (`epic ?? milestone`), `FIELD_ORDER`/`dumpTask`, `validate` (slug optionnel). _dependsOn : []_
2. **Rename `milestoneProgress`→`epicProgress`** + `Roadmap`/`Milestone`→`Epic`, lecture
   `_roadmaps.yaml`→`_epics.yaml` (rétrocompat). _dependsOn : [1]_
3. **CLI** — `--milestone`→`--epic` (rétrocompat flag), aide, `update`. _dependsOn : [1]_
4. **`kind:'milestone'`** — schéma additif + `dumpTask` (écrit si ≠ task), `validate`,
   `add --kind milestone`, helper `--blocks`. _dependsOn : [1]_
5. **`globalProgress` + `sitrep`** — calcul + ligne d'avancement dans `sitrep`. _dependsOn : [2]_
6. **Rendu jalon** — glyphe diamant + « bloque N » dans TaskRow/TaskPanel/roadmap.
   _dependsOn : [4]_
7. **Regroupement par epic (dashboard)** — toggle ViewHeader, blocs par epic, bloc « Sans
   epic », champ epic éditable au panneau, progression par epic. _dependsOn : [1, 2, 5]_
8. **Skill & references** — `formats.md` (epic, kind milestone), `SKILL.md` si besoin, header
   de progression documenté. _dependsOn : [1, 4]_
9. **Tests** — parse rétrocompat `milestone`→`epic` ; `epicProgress` ; `globalProgress` ;
   `dumpTask` n'écrit `kind:'milestone'` que quand il le faut ; un jalon non-done verrouille
   ses dépendants (déjà couvert par les tests d'availability, à étendre). _dependsOn : [1, 4, 5]_

## Risques / points ouverts

- **Rétrocompat du champ dans le CLI/MCP en aval.** Des scripts externes qui passeraient
  `--milestone` doivent continuer à marcher un temps : garder l'alias `--milestone`→`epic`
  déprécié, le retirer à une version majeure. (Aucun usage réel aujourd'hui, risque théorique.)
- **Un seul epic par tâche.** Le champ est scalaire : une tâche appartient à UN epic. Si un
  jour une tâche relève de deux projets, il faudra un tableau — non prévu (YAGNI, un projet
  clair par tâche est l'hypothèse saine).
- **Regroupement par epic vs par stage dans le Backlog.** Deux axes de regroupement
  concurrents ; le toggle doit être clair et l'état par défaut = par stage (comportement
  actuel), l'epic étant une vue alternative. À valider à l'usage.
- **`kind:'milestone'` et l'affichage roadmap.** Le diamant ne doit pas casser le layout
  dagre de la spec #4 (graph-v2) ni le calque de #128 (alignement des cartes) — vérification
  visuelle à l'artefact.
- **Nommage `epic` vs `projet` vs `thème`.** « epic » est un terme Agile parfois connoté ;
  Rémi tranchera le libellé affiché (le slug interne reste `epic`). Décision cosmétique.
