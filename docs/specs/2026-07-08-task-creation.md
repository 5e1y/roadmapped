# Roadmaped — Création de tâche fluide (inline + rafale)

**Date** : 2026-07-08 · **Statut** : DRAFT — en attente de relecture Rémi
**Contexte** : `2026-07-07-roadmaped-v2-design.md` (shell 3 zones, side panel, peau ghost)

## Décision (tranchée par Rémi, rappelée en tête)

Le **geste principal de création est inline, dans la section** : une ligne de saisie
permanente au bas de la section, on tape le titre, **Entrée** crée la tâche **dans la
section courante** avec des défauts intelligents (section courante, `size: null`,
`source: user`, `kind: task`), puis le focus revient sur une **ligne vide** pour
enchaîner en rafale. **Échap** annule (vide + rend le focus).

Le reste des champs (team définitive, size, tags, detail, dependsOn, milestone, code,
refs, links) se remplit **ensuite, dans le side panel**, sur la tâche déjà créée —
jamais dans la ligne inline. On ne réouvre pas ce choix : le formulaire complet
(`CreateTaskPanel`) devient le **chemin secondaire**, pas le geste par défaut.

## Problème (friction actuelle, constatée dans le code)

Trois chemins de création coexistent aujourd'hui, aucun n'offre la capture rapide en
rafale d'une tâche normale :

1. **Formulaire complet — le geste par défaut d'une tâche « task ».**
   `src/components/Backlog.tsx` (header, l.112-118) et `SectionAccordion.tsx`
   (l.52-56, 73-76) appellent tous `openCreateTask(section)` → ouvre
   `CreateTaskPanel` (`src/components/SectionPanel.tsx`, l.31). Ce panneau demande
   **neuf champs d'un coup** (titre, stage, team, size, code, tags, detail, dependsOn,
   links, refs), puis POST unique et bascule sur la tâche créée (`openTask`, l.81).
   Pour saisir dix idées de suite, il faut : cliquer « + tâche », remplir, « Créer »,
   re-cliquer « + tâche »… Lourd, et le panneau s'ouvre sur la tâche créée à chaque
   fois — l'inverse d'une rafale.

2. **Le seul inline existant est réservé aux « quick » et câblé en dur.**
   `MiniZone` (`src/components/TaskColumns.tsx`, l.97-174) porte une ligne de création
   inline : `GhostInput` (titre) + un **`Select` Base UI compact** pour la team, Entrée
   = `create()`. Mais : `section: '04-build'` est **codé en dur** (l.113), `kind: 'quick'`
   forcé, et la team occupe un widget permanent dans la ligne (l.164-173) qui alourdit
   le geste. Pas de gestion explicite du refocus après création : on s'appuie sur le
   fait que le `GhostInput` contrôlé n'est pas démonté — fragile après `reload()`.
   (Le brief parlait d'un « `<select>` natif » : en réalité c'est le `Select` Base UI
   `compact` — même intention, à ne pas dupliquer, cf. §Conception.)

3. **Le « + tâche » par section est dormant dans la vue de travail.**
   `SectionAccordion` porte « + tâche » / « + première tâche », mais le Backlog v2 est
   une **liste plate** (open/done, `Backlog.tsx` l.130-134) : les sections actives n'y
   sont pas rendues en blocs. `SectionAccordion` n'y sert plus que pour l'**archive**
   (l.141-143, `dimmed`, sans actions). Créer dans une section précise depuis la liste
   n'existe donc pas ; le « + tâche » global retombe sur `04-build` (`createIn`, l.96).

Bilan : capturer vite plusieurs tâches normales oblige à passer par un formulaire
lourd, la seule saisie fluide est bridée aux quicks sur une section figée, et la
notion de « créer dans CETTE section » n'a pas de support dans la vue de travail.

## Conception (le comment, ancré au code)

### 1. Un composant unique `InlineAddTask`

Nouveau composant (`src/components/InlineAddTask.tsx`) — **une ligne, peau ghost
canonique**, réutilisé partout où l'on crée en rafale. Il remplace la ligne artisanale
de `MiniZone` et alimente les blocs de section.

```
[＋]  Nouvelle tâche — titre puis Entrée________________________
```

- **Champ** : `GhostInput` de `ui.tsx` (peau `ghostCls` : transparent au repos, gris au
  survol, contour + fond blanc au focus). **Pas de `<select>` natif, pas de `Select`
  dans la ligne** — la team n'est pas saisie ici (voir §3). Glyphe `Plus`
  (`trinil-react`) à gauche, comme `MiniZone` l.154.
- **Props** : `{ section: string; team: Team; kind?: 'task' | 'quick'; onCreated?: (id) => void }`.
  La `section` et la `team` sont **injectées par le parent** — c'est ce qui rend le
  composant réutilisable (section-bloc, backlog plat, MiniZone).
- **Défauts intelligents** (payload POST) : `{ section, title, team, kind: kind ?? 'task',
  size: null, source: 'user' }`. Rien d'autre — pas de tags, pas de detail, pas de
  dependsOn : ces champs partent à leur valeur vide côté `addTask` (`taskWrites.ts`
  l.322-345 : `size: null`, `tags: []`, `dependsOn: []`, `milestone: null`).
- **États** : `busy` (POST en vol) et `error` (via `ErrorBanner`, `role=alert`, comme
  `MiniZone` l.204-209). Champ `disabled` pendant `busy`.

### 2. Appel de création — réutilise `addTask`, zéro nouvelle logique disque

Même route que tout le reste : `POST /api/tasks` → `runAction` `createTask` →
`addTask(tasksDir, body)` (`src/server/api.ts` l.147, `src/lib/taskWrites.ts` l.285).
Le middleware Vite écrit, revalide tout, rollback si invalide — mécanique inchangée.
Après `{ ok: true }` : `await reload()` du `TreeContext` (pas d'état optimiste, cf.
design V2 §API). Le CLI/MCP passe déjà par le même `addTask` (`scripts/mcp-server.mjs`
l.222) : rien à ajouter côté agent.

### 3. Team obligatoire sans casser la rafale

`team` est **requise** : `validate.ts` (l.34-35) rejette une team absente/invalide et
déclenche le rollback — on ne PEUT pas créer avec `team: null`. La rafale doit donc
partir avec une team **par défaut, éditable ensuite** :

- **Défaut = le filtre team actif s'il est solo, sinon `engineering`.** Le Backlog porte
  déjà `useTeamFilter` (`Backlog.tsx` l.32) et sait quand une seule team est
  sélectionnée (`radarSelected`, l.74). Quand on filtre sur « design » et qu'on saisit
  en rafale, les tâches naissent en « design » — comportement attendu. Sinon, défaut
  neutre `engineering` (parité `MiniZone` l.100, `CreateTaskPanel` l.36).
- **Aucun widget team dans la ligne.** La correction se fait après coup, dans le side
  panel, sur la tâche créée (`TaskPanel`, champ Team en `Select ghost`). C'est le
  principe « titre maintenant, précision ensuite » : la rafale ne s'interrompt jamais
  pour choisir une team.
- La `team` par défaut est **affichée discrètement** en bout de ligne inline (chip en
  lecture, style `TEAM_ABBR` comme `MiniZone` l.198) pour que l'utilisateur sache dans
  quelle team ça tombe — mais elle n'est pas éditable là.

### 4. Où vit la ligne inline

- **Bloc de section** : dans `SectionAccordion`, on **remplace** les boutons
  « + tâche » / « + première tâche » (l.52-56, 71-77) par un `InlineAddTask`
  permanent en **bas du `Accordion.Panel`** (`section={section.key}`). C'est le
  « au bas de la section » de la décision. Non rendu quand `dimmed` (archive).
- **Backlog plat** : une ligne `InlineAddTask` en **bas de la liste « À faire »**
  (`TaskList`, `TaskColumns.tsx`). Sa « section courante » = la section par défaut de
  la vue (aujourd'hui `createIn = '04-build'`, `Backlog.tsx` l.96). Point ouvert :
  faut-il regrouper le backlog plat par section pour donner une ligne par bloc, ou
  garder une seule ligne sur une section par défaut ? (voir Risques).
- **MiniZone** : sa ligne artisanale (l.153-174) est remplacée par
  `<InlineAddTask section="04-build" kind="quick" team={team} />` — un seul composant,
  fini le `Select` compact dupliqué dans la ligne.

### 5. Rafale : Entrée, Échap, atterrissage du focus

- **Entrée** : si titre non vide et pas `busy`, POST → `reload()` → **vider le champ +
  restituer le focus** sur la même ligne (nouvelle ligne vide). Réutiliser le pattern
  éprouvé de `ui.tsx` / `AddCombobox` : `inputRef` + `requestAnimationFrame(() =>
  ref.current?.focus())` après succès (comme `AddCombobox` l.230-235 et `blurOnEnter`
  l.36-41), avec le garde `isConnected`. Le champ inline n'est **pas** remonté par les
  données de tâche (il vit dans le pied de section, pas dans la liste), donc le refocus
  tient malgré le `reload()` — contrairement au caveat des champs « au blur » remontés
  par `key={valeur}` (ui.tsx l.31-34).
- **Échap** : vide le champ et rend le focus (blur) — annule la saisie en cours, ne
  ferme rien.
- **On n'ouvre PAS le side panel à chaque création en rafale** (contrairement à
  `CreateTaskPanel` l.81 qui `openTask` la créée). Ouvrir le panneau volerait le focus
  et casserait l'enchaînement. Le remplissage vient après, quand l'utilisateur clique
  la ligne créée. `onCreated(id)` reste dispo pour un raccourci optionnel (« ouvrir la
  dernière créée ») mais n'est pas branché par défaut.
- **Garde-fous** : ignore l'Entrée si `busy` (anti double-POST, comme `MiniZone` l.106) ;
  titre vide = no-op ; erreur serveur = `ErrorBanner`, champ conservé (on ne perd pas la
  saisie).

### 6. Remplissage progressif dans le panneau (existant, à confirmer)

La tâche créée en rafale porte des défauts ; tout le reste s'édite **en place** dans
`TaskPanel` (`src/components/TaskPanel.tsx`) : titre, detail (`GhostAutoTextArea`),
team/size/status (`Select ghost`), tags (`TagsCombobox`), dependsOn/links
(`MultiCombobox`), code, refs, milestone — champs permanents peau ghost, sauvegarde au
blur / au change. **Aucun nouveau champ à créer** : le panneau couvre déjà la totalité.
La spec ne fait qu'acter le parcours « ligne inline → clic sur la tâche → panneau ».

## Découpage en tâches d'implémentation (chaînables par `dependsOn`)

1. **Composant `InlineAddTask`** — `src/components/InlineAddTask.tsx` : `GhostInput` +
   glyphe `Plus`, props `{ section, team, kind?, onCreated? }`, POST `/api/tasks` avec
   défauts (`size: null`, `source: 'user'`, `kind` par défaut `'task'`), `busy`,
   `ErrorBanner`, Entrée (crée + vide + refocus) et Échap (vide + blur). Chip team en
   lecture en bout de ligne. _dependsOn : []_
2. **Défaut team intelligent** — dériver la team par défaut du filtre team actif solo
   (`useTeamFilter`/`radarSelected`, `Backlog.tsx`) sinon `engineering` ; passer la
   valeur en prop `team` aux instances. _dependsOn : [1]_
3. **Brancher dans les blocs de section** — remplacer les boutons « + tâche » /
   « + première tâche » de `SectionAccordion` par `InlineAddTask` (`section=section.key`),
   masqué si `dimmed`. _dependsOn : [1]_
4. **Ligne inline du Backlog plat** — ajouter `InlineAddTask` en bas de « À faire »
   (`TaskList`/`Backlog.tsx`) sur la section par défaut ; trancher au passage la
   question « regrouper par section vs ligne unique » (voir Risques). _dependsOn : [1, 2]_
5. **Unifier MiniZone** — remplacer la ligne artisanale (`TaskColumns.tsx` l.153-174,
   `Select` compact inclus) par `<InlineAddTask section="04-build" kind="quick" …>`.
   _dependsOn : [1, 2]_
6. **Rafale robuste** — refocus post-`reload` via `inputRef` + `requestAnimationFrame` +
   `isConnected`, anti double-POST (`busy`), conservation de la saisie en erreur.
   _dependsOn : [1]_
7. **Parcours de remplissage progressif** — vérifier que `TaskPanel` couvre bien tous
   les champs restants en place (il le fait) ; documenter le geste, brancher
   éventuellement `onCreated` sur un raccourci « ouvrir la dernière créée » (optionnel).
   _dependsOn : [3, 4]_
8. **Tests** — composant `InlineAddTask` (Entrée POST le bon payload + vide + refocus ;
   Échap vide ; erreur conserve la saisie) ; `addTask` avec `team` par défaut est déjà
   couvert (`taskWrites.test.ts`). Vérif artefact : créer 3 tâches en rafale depuis l'UI,
   relire les YAML (`source: user`, `size` absent/`null`, team = défaut). _dependsOn : [1, 6]_

## Risques / points ouverts

- **Backlog plat vs blocs de section.** Le geste « au bas de la section » suppose des
  blocs de section ; or la vue de travail est plate (open/done). Deux options : (a)
  regrouper la liste « À faire » par section pour donner une ligne inline par bloc, au
  risque d'alourdir la vue « travail » voulue compacte ; (b) garder la liste plate avec
  une **seule** ligne inline sur une section par défaut, la création par section vivant
  dans un affichage groupé secondaire. Tranche produit à faire.
- **Team par défaut trompeuse.** Créer en rafale hors filtre fait tomber tout en
  `engineering` ; si l'utilisateur oublie de corriger, le backlog se biaise. La chip
  team en lecture atténue le risque ; à surveiller à l'usage.
- **Refocus après `reload()`.** Le refocus repose sur le fait que la ligne inline n'est
  pas remontée par les données. Si un futur regroupement par section remonte le pied de
  bloc à chaque `reload`, le focus sautera — prévoir une `key` stable sur `InlineAddTask`.
- **Slug de fichier en collision.** `addTask` dérive le nom de fichier du titre
  (`slugify`, `taskWrites.ts` l.314-318) et refuse un doublon exact dans la section.
  Deux titres identiques créés en rafale dans la même section → erreur de la 2ᵉ. Rare,
  mais l'`ErrorBanner` doit le dire clairement (message déjà renvoyé par `addTask`).
