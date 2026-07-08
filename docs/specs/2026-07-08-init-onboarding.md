# Spec — Init riche / onboarding : la première session pose le projet, pas un dossier vide

**Date** : 2026-07-08 · **Statut** : en attente d'approbation Rémi · **Tâche** : #121
**Dépend de** : #12 (mécanisme d'install — où atterrit le skill/config) · **Articule** : #122 (ouverture auto de session)
**Étend** : `skills/roadmapped/references/setup.md` (phase de setup actuelle)

## Contexte et diagnostic

`references/setup.md` décrit aujourd'hui un setup honnête mais minimal : inventaire lecture
seule → proposition de mapping → création des 8 stages + tâches via CLI. Trois manques,
constatés en relisant le fichier :

1. **Pas de questionnaire.** L'agent devine la nature du projet depuis le code et les
   fichiers. Pour un repo neuf (peu de code, pas de ROADMAP) il n'a presque rien à mapper
   et repart d'un backlog vide — l'anti-pattern « dossier vide » que Roadmapped est censé
   supprimer.
2. **La migration est floue.** Le §2 dit « chaque item ouvert → une tâche » mais ne donne
   ni les globs de détection, ni les règles de parsing, ni les tables de mapping
   stage/team, ni comment câbler `dependsOn`. Un agent (a fortiori un subagent Fable) ne
   peut pas l'exécuter de façon déterministe.
3. **Aucun CLAUDE.md n'est écrit.** Rien ne garantit qu'à la session suivante l'agent
   reprenne le workflow : le skill se déclenche sur heuristique de description, pas sur un
   contrat écrit dans le repo hôte. C'est exactement le trou d'enforcement diagnostiqué en
   #98/#94, mais côté onboarding.

Résultat : l'init actuelle marche pour le self-hosting (ce repo, riche en artefacts) et
casse pour le cas réel — un repo hôte neuf ou peu documenté où Roadmapped débarque.

## Décision (tranchée par Rémi)

**Init COMPLÈTE avec migration auto.** La première session dans un repo enchaîne, en une
conversation guidée :

1. **Questionnaire projet** — nature du projet, teams actives, jalons visés.
2. **Milestones initiaux** — les 8 stages sont créés et *calibrés* depuis les réponses
   (statut `open`/`dormant`/`done`, notes adaptées) ; c'est ça, poser les jalons.
3. **Première vague de tickets** — amorcée depuis les réponses, pas seulement depuis les
   docs existants.
4. **Migration auto des artefacts existants** (ROADMAP / TODO / BACKLOG / specs) en
   **vraies tâches / stages / dependsOn** — pas un inventaire lecture seule.
5. **CLAUDE.md soigné** écrit (ou fusionné) à l'init, pour que l'agent adopte le workflow
   d'emblée et que l'ouverture auto (#122) ait un support écrit.

Ceci **étend** `references/setup.md` : l'init reste **skill-driven** (l'agent exécute la
procédure ; pas de commande `scaffold` qui génère à l'aveugle — cohérent avec le candidat
d'install de #12). Le CLI n'écrit que ce qu'il écrit déjà : stages + tâches via `add`.

## Conception

### Vue d'ensemble du déroulé

```
Session Claude démarre dans un repo hôte
        │
        ▼
#122 SessionStart : roadmaped.config.json présent ?
   ├─ non  → repo non-Roadmapped, rien
   └─ oui  → docs/tasks/_meta.yaml présent ?
              ├─ oui → sitrep (repo déjà initialisé — JAMAIS re-setup)
              └─ non → INIT (cette spec) ────────────┐
                                                     ▼
   Phase A  Détection & inventaire (lecture seule)
   Phase B  Questionnaire projet (conversationnel, 4 questions)
   Phase C  Proposition unifiée (réponses ⊕ artefacts migrés) → accord
   Phase D  Écriture : 8 stages calibrés → tâches via CLI → CLAUDE.md → sort des vieux fichiers
   Phase E  Vérification (validate, next, résumé, npm run dev)
```

Les phases A / C / D / E reprennent et durcissent l'actuel setup.md (ses §1, §2, §3, §4).
La phase B est neuve. Ci-dessous, seulement ce qui change ou se précise.

### Phase B — Questionnaire projet (le neuf)

Quatre questions, **posées en une fois** (bloc numéroté, l'utilisateur répond en vrac),
formulées pour un founder, pas un chef de projet. L'agent ne bloque jamais sur une
non-réponse : une case vide bascule sur l'heuristique code/docs de la phase A.

1. **Nature & stade.** « En une phrase : c'est quoi le projet, et où il en est ? » (idée
   pré-code / en construction / déjà lancé / en croissance). → calibre le **statut des
   stages** (Phase D) et le stage d'atterrissage par défaut des tickets amorcés.
2. **Teams actives.** « Qui travaille dessus, ou quelles casquettes tu portes ? » Réponse
   libre → mappée sur l'enum `team` (`marketing | sales | support | operations | finance |
   legal | engineering | design`). Détermine les teams qu'on s'attend à voir sur les
   tickets ; une team jamais citée n'est pas interdite, juste non pré-remplie.
3. **Prochains jalons.** « Les 2-3 prochaines grandes étapes que tu vises ? » → chaque
   étape est rapprochée d'un stage (table §Migration) ; sert à décider quels stages sont
   `open` (focus courant) vs `dormant`, et à amorcer la première vague de tickets.
4. **Ce qui existe déjà.** « Il y a des notes, une roadmap, une TODO, des specs quelque
   part ? » → confirme/complète la détection de la phase A (l'utilisateur pointe des
   fichiers que les globs auraient ratés).

**Où vont les réponses** (le cœur de la décision « réponses → milestones + tickets ») :

- **Réponses → statut des stages.** Q1 fixe une frontière : un projet « déjà lancé » naît
  avec `01-idea`→`06-launch` en `done` (l'histoire est derrière) et `07-scale`/`08-mature`
  en `open` ; un projet « pré-code » a `01-idea` en `open` et le reste `dormant`. Un projet
  « en construction » : `01`→`03` `done`, `04-build`/`05-gtm` `open`, le reste `dormant`.
  C'est la seule calibration des jalons — **les 8 stages restent fixes et immuables**
  (`formats.md`), on ne crée ni ne renomme rien.
- **Réponses → première vague de tickets.** Chaque grande étape de Q3 devient **1 à 3
  tâches amorcées** (`--source user`), déposées dans le stage rapproché, chaînées en
  `dependsOn` si elles s'ordonnent. Une étape trop vague (« faire du marketing ») devient
  UNE tâche-jalon avec un `detail` qui liste les sous-chantiers à découper plus tard, pas
  cinq tâches inventées. Objectif : un `next` sensé en fin d'init, jamais un backlog gonflé.
- **Réponses → notes de stage.** La note par défaut d'un stage `open` (colonne « Esprit »
  de `formats.md`) est enrichie d'une phrase tirée des réponses quand c'est utile (ex.
  `05-gtm.note` += la cible/le canal cité en Q2/Q3). Optionnel, jamais bloquant.

**`_roadmaps.yaml` (jalons nommés au-delà des stages)** : reste **opt-in**. On ne le génère
que si Q3 décrit explicitement des versions/phases nommées (« v1 / v2 », « MVP / public »)
que l'utilisateur veut voir comme regroupements. Par défaut : les 8 stages SONT les jalons,
`_roadmaps.yaml` n'est pas créé (`formats.md` : « ne t'en sers pas sauf demande explicite »).
→ point ouvert : déclencheur exact, cf. Risques.

### Migration auto — l'heuristique déterministe

Le but : rendre le §1/§2 actuel **exécutable** par un subagent sans jugement au doigt mouillé.

**Détection (Phase A, globs, lecture seule)** — à la racine et sous `docs/` :

| Type | Motifs | Traitement |
|---|---|---|
| Backlog en prose | `README*`, `ROADMAP*`, `TODO*`, `BACKLOG*`, `NOTES*`, `CHANGELOG*` | items → tâches |
| Plans à cases | tout `.md` contenant `- [ ]` / `- [x]`, `plans/`, `docs/plans/` | cases → tâches |
| Specs / designs | `docs/specs/`, `specs/`, `*RFC*`, `*ADR*`, `adr/` | → `refs`, jamais converties en tâches |
| Issues exportées | `.github/ISSUE*`, `issues.json`, exports Linear/Jira | items → tâches |
| Documentation | reste de `docs/**/*.md` | **référencée** en `refs`, jamais convertie |

**Parsing (item → candidat-tâche)** :

- `- [ ] X` (case non cochée) → tâche `todo`, titre = `X`.
- `- [x] X` (case cochée) → **ignorée** (l'histoire reste dans le vieux fichier). Exception
  unique : `01-idea` / `02-initial` peuvent naître avec 2-3 tâches **rétroactives** `done`
  si ça raconte l'histoire vraie (repo déjà avancé) — jamais ailleurs.
- Bullet de prose sous un titre de section (`## Milestone 2`, `### Marketing`) → tâche ;
  le titre de section porte l'indice de stage/team et l'appartenance à une chaîne.
- Une phrase « il faudrait / TODO: / FIXME: » dans un README → tâche.
- **Dédup** : le même item présent dans deux docs → **une** tâche ; les autres occurrences
  vont en `refs`.

**Mapping stage (mot-clé → stage, premier match l'emporte, sinon `04-build`)** :

| Indices dans le titre / la section | Stage |
|---|---|
| idée, hypothèse, problème, cible, validation | `01-idea` |
| repo, nom, structure juridique, incorporation, setup projet | `02-initial` |
| marque, logo, domaine, réseaux, positionnement, branding | `03-identity` |
| build, feature, dev, site, backend, API, compta, emails transactionnels, v1, MVP | `04-build` |
| contenu, SEO éditorial, outbound, ads, acquisition, go-to-market, campagne | `05-gtm` |
| lancement, launch, mise en ligne, Product Hunt, annonce | `06-launch` |
| monitoring, scale, communauté, billing, support, deals, croissance | `07-scale` |
| referral, compliance, RGPD, legal avancé, intégrations avancées, partenariats | `08-mature` |

Les sections d'une ROADMAP nommées « v1 / phase 2 / beta » sont **mappées** vers le stage
qui leur ressemble (une v1 orientée construction → `04-build` ; un lancement coordonné →
`06-launch`), **jamais** créées comme un 9e dossier — `validate` le rejetterait.

**Mapping team (mot-clé → team, défaut : `engineering`)** : contenu/SEO/ads/réseaux →
`marketing` ; démo/prospect/closing → `sales` ; ticket/SAV/onboarding client → `support` ;
process/logistique/fournisseur → `operations` ; compta/facturation/trésorerie → `finance` ;
CGU/RGPD/contrat → `legal` ; UI/UX/maquette/design system → `design` ; le reste (code,
infra, data) → `engineering`. Aucune tâche active ne sort sans team (invariant `formats.md`).

**`dependsOn`** : les items **ordonnés d'un même plan** (liste numérotée, « étape 1/2/3 »,
sections successives d'une même roadmap) → chaîne `dependsOn` (chaque item dépend du
précédent). Ce qui est indépendant reste sans dépendance (parallélisable). Contrainte
d'écriture : un `--depends-on` ne peut citer qu'un id **déjà créé** → créer les tâches dans
l'ordre topologique (source avant cible).

**Specs → refs, pas tâches.** Une spec approuvée décrit du travail : ses chantiers ouverts
deviennent des tâches qui **référencent** la spec (`refs`), la spec elle-même n'est jamais
« une tâche ». Une spec en `DRAFT`/`en attente d'approbation` → une tâche « approuver +
décomposer la spec X » dans `04-build`, source `user`.

### CLAUDE.md généré — le contrat écrit

Écrit à la **racine du repo hôte** en fin de Phase D. Objectif : au prochain démarrage,
l'agent adopte le workflow **avant même** que le skill se déclenche sur description, et
l'ouverture auto (#122) a un support si le hook plugin n'est pas retenu.

- **Si aucun CLAUDE.md** : l'agent en écrit un, court, dont le contenu tient dans un
  encadré (voir gabarit ci-dessous).
- **Si un CLAUDE.md existe déjà** (fréquent en repo hôte) : **fusion, jamais écrasement** —
  l'agent insère/actualise une section délimitée par des marqueurs
  `<!-- roadmapped:start -->` … `<!-- roadmapped:end -->` (idempotente : ré-exécuter l'init
  remplace la section, pas le fichier). Le reste du CLAUDE.md est laissé intact.

Gabarit de la section (livré comme fichier `references/claude-md-template.md`, l'agent
substitue les `{{…}}`) :

```markdown
<!-- roadmapped:start -->
## Ce repo est piloté par Roadmapped

La source de vérité du travail à faire est `docs/tasks/` (fichiers YAML plats,
8 stages fixes `01-idea`→`08-mature`). Le plan, ce sont des tâches chaînées par
`dependsOn` — jamais un fichier de plan markdown parallèle.

**Premier geste de toute session** : `node scripts/task.mjs sitrep` (ou le tool
MCP `sitrep`) — l'état du monde en un appel.

**Avant de modifier le moindre fichier de ce repo** : invoque le skill `roadmapped`
et ouvre une unité de travail (`take`, ou `quick "<titre>" --team <t> --start`).
Tout changement du repo = une unité Roadmapped ; le hook pre-commit `guard` refuse
un commit hors d'une tâche `in_progress`.

Interface d'écriture unique : le CLI `node scripts/task.mjs` / les tools MCP
`roadmapped`. Jamais d'édition manuelle d'un YAML que le CLI couvre.

Projet : {{nature_en_une_ligne}} · Teams actives : {{teams}}.
<!-- roadmapped:end -->
```

Ce texte est volontairement redondant avec le SKILL.md : il vise l'instant où le skill
n'est pas encore chargé. Il ne duplique aucune règle susceptible de dériver (les détails
restent dans le skill), il pointe.

### Articulation avec #12 (install) et #122 (ouverture auto)

- **#12 (install) fournit le décor, #121 (cette spec) fournit le contenu.** L'install pose
  dans le repo hôte : `roadmaped.config.json` (chemins), le skill sous
  `.claude/skills/roadmapped/`, et le noyau exécutable (scripts/ + `.mcp.json`, selon la
  décision #12). L'init suppose ces éléments présents ; elle ne les installe pas. Frontière
  nette : **install = fichiers de l'outil ; init = état du projet** (`docs/tasks/`,
  CLAUDE.md). Si #12 retient le candidat « skill-driven install », l'install ET l'init sont
  deux phases du même skill — l'install crée les fichiers, l'init (déclenchée par `_meta.yaml`
  absent) crée le contenu, dans la foulée.
- **#122 (ouverture auto) déclenche l'init.** Le branchement (schéma en tête) vit dans
  `setup.md` et est *rendu opérationnel* par #122 : `config présente + _meta.yaml absent`
  → init ; `_meta.yaml présent` → `sitrep`. Le CLAUDE.md généré ici porte l'instruction
  « premier geste = sitrep » : c'est la **voie CLAUDE.md** du choix ouvert de #122 (hook
  SessionStart vs consigne CLAUDE.md vs les deux). Cette spec livre la voie CLAUDE.md ; le
  choix du hook reste tranché en #122 et n'est pas ré-ouvert ici.

## Découpage en tâches d'implémentation

Implémentation confiée à un subagent Fable (tag `fable`). Livrable = édition de fichiers du
skill + un fichier gabarit ; **aucun code applicatif** (l'init est skill-driven, le CLI
n'acquiert pas de verbe `init`). Chaînables par `dependsOn` dans l'ordre.

1. **Réécrire `references/setup.md` : structure en 5 phases A→E + schéma de branchement**
   (`04-build`, `engineering`, `refs: skills/roadmapped/references/setup.md`). Pose le
   squelette (phases, ordre, invariant « jamais re-setup si `_meta.yaml` présent »). Base
   des suivantes. *dependsOn: []*
2. **Rédiger la Phase B (questionnaire) + la logique réponses → statut des stages + notes**
   (`04-build`, `engineering`). Les 4 questions, leur formulation, le mapping Q1 → statuts
   des 8 stages, l'enrichissement des notes. *dependsOn: [1]*
3. **Rédiger la logique réponses → première vague de tickets** (`04-build`, `engineering`).
   Règle 1-3 tâches par étape Q3, tâche-jalon pour le vague, chaînage `dependsOn`, garde
   anti-backlog-gonflé. *dependsOn: [1]*
4. **Rédiger l'heuristique de migration** (`04-build`, `engineering`) : tables détection /
   parsing / mapping stage / mapping team / dependsOn / dédup / specs→refs, telles que
   ci-dessus. C'est le morceau qui rend l'init exécutable. *dependsOn: [1]*
5. **Créer `references/claude-md-template.md` + documenter la procédure d'écriture/fusion**
   dans setup.md Phase D (marqueurs idempotents, cas « existe déjà ») (`04-build`,
   `engineering`). *dependsOn: [1]*
6. **Documenter l'articulation #12/#122 dans setup.md + note routeur dans SKILL.md**
   (`04-build`, `engineering`) : la frontière install/init, le branchement d'ouverture, la
   voie CLAUDE.md de #122. *dependsOn: [5]*
7. **Vérification bout-en-bout : dry-run de l'init dans un repo hôte de test**
   (`04-build`, `engineering`, tag `correctness`). Créer un repo scratch avec un
   `ROADMAP.md`, une `TODO`, une spec DRAFT ; dérouler l'init en suivant setup.md ;
   vérifier : `validate` OK, 8 stages calibrés, tickets migrés + amorcés cohérents,
   `dependsOn` chaînés, CLAUDE.md fusionné idempotent, `next` sensé. Recoupe #123 (repo
   hôte réel). *dependsOn: [2, 3, 4, 6]*

## Risques / points ouverts

- **Déclencheur de `_roadmaps.yaml`** : à partir de quel signal en Q3 génère-t-on des
  jalons nommés plutôt que de s'en tenir aux 8 stages ? Proposition : uniquement si
  l'utilisateur nomme explicitement ≥2 versions/phases ET confirme les vouloir comme
  regroupements. À confirmer (ou figer « jamais en v1 »).
- **Volume de la première vague** : combien de tickets amorcer avant que ça devienne du
  bruit ? Garde proposée : ≤3 par étape Q3, une tâche-jalon pour le vague. Seuil global à
  valider (ex. plafond ~15 tâches à l'init d'un repo neuf).
- **Migration d'un `- [x]` en done rétroactif** : limité à `01-idea`/`02-initial` — assez ?
  Un repo « déjà lancé » peut vouloir un historique done plus riche (matière à changelog).
  Risque de gonfler l'archive vs raconter l'histoire vraie. À trancher.
- **Fusion CLAUDE.md** : si le repo hôte a un CLAUDE.md volumineux et opinioné, la section
  Roadmapped doit-elle vivre en tête, en pied, ou dans un fichier `.claude/` séparé
  importé ? Marqueurs idempotents supposés, position à confirmer.
- **Coût cognitif de la migration pour un subagent** : le mapping mot-clé → stage/team est
  une heuristique, pas une vérité. Le garde-fou reste la **validation utilisateur en Phase
  C** (accord sur le mapping avant écriture) — non négociable, déjà dans setup.md.
- **Dépendance à #12 non figé** : la frontière install/init suppose que #12 tranche « où
  vit le noyau exécutable ». Si #12 retient l'install skill-driven, revalider que l'init
  n'écrit rien que l'install était censé poser (double-écriture de `config`).
