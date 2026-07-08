# Spec — Enforcement du process au commit : la dérive devient impossible ou visible

**Date** : 2026-07-08 · **Statut** : en attente d'approbation · **Tâche** : #98
**Source** : docs/process-enforcement-gap.md (#94) — incident réel : deux vagues de rework
Notepad livrées en 2 commits sans aucun ticket.

## Contexte et diagnostic

Les règles du skill (« start avant la première ligne », « pas de ledger parallèle ») sont
des disciplines, pas des gardes : elles sautent précisément dans les conditions observées —
long contexte (le noyau du skill a défilé hors de la fenêtre), feedback/rework juste après
un `done` (classé mentalement « je peaufine » au lieu de « nouveau travail »), et mention
d'urgence (« ASAP », « go ») interprétée comme permission de sauter la cérémonie. La seule
ligne de défense était la vigilance de l'agent ; le point de mutation réel (le commit)
n'était défendu par rien.

Règle validée avec Rémi (§3 du doc source) : **tout changement du repo = une unité
roadmaped, sans exception, y compris juste après un `done`**. Le `done` est une frontière,
pas un couvercle. Seules les demandes sans artefact (questions, explications, statut)
restent conversationnelles.

## Décisions (tranchées avec Rémi le 2026-07-08)

1. **Hook pre-commit BLOQUANT** — le commit est refusé, pas averti.
   *Écarté : avertir seulement* — un agent en mode « ASAP » ne lit pas un warning dans la
   sortie git ; c'est exactement le cas de l'incident. *Écarté : bloquer agent / avertir
   humain (détection env)* — plus de logique pour un gain marginal ; `--no-verify` couvre
   déjà l'humain pressé, en laissant une trace consciente.
2. **Liaison vérifiable commit ↔ tâche : différée** — le champ `commit` des tâches done
   plus le signal sitrep suffisent en v1. Tracée en `quick` taggé `debt` à la décomposition.

## Décisions techniques (défauts raisonnables, non soumis au brainstorm)

- **`task.mjs guard`** : nouvelle commande CLI, le cerveau du hook. Exit 0 si l'une de ces
  conditions tient : rien de stagé ; tous les fichiers stagés sont sous `docs/tasks/` (la
  consignation elle-même — sinon le commit du YAML après un `done` serait bloqué) ; un
  merge est en cours (`.git/MERGE_HEAD` présent — l'intégration n'est pas du travail
  nouveau) ; **au moins une tâche `in_progress` existe**. Sinon exit 1 avec un message
  autoportant qui propose la commande exacte :
  `node scripts/task.mjs quick "<titre>" --team <t> --start`.
- **Granularité assumée (plafond nommé)** : le guard vérifie « une tâche in_progress
  existe », pas « couvre ces fichiers ». Le mapping fichiers↔tâche (via `suggestedRefs()`)
  serait de la fausse précision en v1 — upgrade path si la dérive « une tâche in_progress
  éternelle sert de passe-partout » apparaît. Tracé dans le message du hook ? Non : quick
  #debt à la décomposition.
- **Installation** : hook committé `scripts/githooks/pre-commit` (exécutable, 1 ligne :
  `node scripts/task.mjs guard`) + activation par le script npm `prepare` :
  `git config core.hooksPath scripts/githooks`. `prepare` tourne à chaque `npm install` —
  zéro étape manuelle, survit au clone. *Écarté : copier dans `.git/hooks/`* — non
  versionné, se perd au clone, dérive silencieusement.
- **Échappatoire** : `git commit --no-verify` (natif). Assumé et documenté : l'absence de
  ticket devient un acte conscient et visible dans l'historique de la conversation, plus
  une omission silencieuse.
- **Signal sitrep « commits non consignés »** : helper node-only dans `src/lib/render.ts`
  (à côté de `git()`) — `unloggedCommits(tree)` : prend le `commit` de la tâche au
  `completedAt` le plus récent, compte `git rev-list --count <sha>..HEAD`. Retourne null
  (signal muet) si pas de git, pas de sha consigné, ou sha inconnu (rebase/amend — dégrade
  sans bruit). `sitrepText(tree, errors, unlogged?)` gagne un 3ᵉ paramètre optionnel :
  ligne `⚠ N commit(s) non consigné(s) depuis #<id>` émise seulement si N > 0 **et**
  aucune tâche in_progress (des commits pendant une tâche en cours sont du travail normal,
  pas une dérive). Les DEUX surfaces (CLI `cmdSitrep`, tool MCP `sitrep`) appellent le
  helper et passent le résultat — `sitrepText` reste pur et testable.
- **Skill (`skills/roadmaped/SKILL.md`, noyau ≤ ~61 lignes actuelles, ne pas gonfler)** :
  - La règle en tête de l'échelle de décision : « Tout changement du repo = une unité
    roadmaped — le `done` est une frontière, pas un couvercle. Un retour, un rework, un fix
    de revue → chacun son `quick`. “ASAP” n'est jamais une raison de sauter le `quick` :
    le `quick` EST le chemin rapide (~2 commandes). »
  - Frontmatter `description` élargie : le skill s'arme sur « je m'apprête à modifier un
    fichier du repo » — feedback, rework, fix, retouche post-done compris — pas seulement
    sur « crée les tâches ».
  - Un interdit : « ❌ Committer sans unité roadmaped — le hook `guard` le refuse ;
    `--no-verify` = dérive consciente et dite à l'utilisateur. »
  - Formulation serrée : viser ± 0 ligne nette en compactant l'existant si besoin.
- **Resync du skill installé** : `~/.claude/skills/roadmaped/` est une vieille version
  désynchronisée (pointe `dashboard/scripts/task.mjs`, chemin mort). Fin de chantier :
  recopier le skill du repo vers l'installation locale. Le mécanisme de sync automatique
  est hors périmètre (quick #debt).

## Détails d'implémentation

- `guard` lit les fichiers stagés via `git diff --cached --name-only` et l'état des tâches
  via `readTree` + `activeTasks` (source unique, pas de re-parse maison).
- Le hook doit rester rapide (<300 ms) : pas de validation complète de l'arbre, juste la
  lecture des statuts.
- Tests (TDD, sandbox comme `task.test.mjs`) : commit bloqué sans in_progress ; passe avec
  in_progress ; passe si seuls des fichiers `docs/tasks/` sont stagés ; passe en merge ;
  message contient la commande `quick`. Pour le signal : sitrep avec/sans commits non
  consignés, muet si in_progress existe, muet si sha inconnu.
- Auto-démonstration : chaque tâche de ce chantier passe elle-même par start/done — et le
  hook, une fois posé, garde les commits suivants du chantier.

## Hors périmètre (explicitement)

- Liaison vérifiable commit ↔ tâche (convention `#id` parsée, audit des orphelins) — différée.
- Mapping fichiers stagés ↔ refs de la tâche in_progress (fausse précision en v1).
- Sync automatique du skill repo → `~/.claude/skills` (resync manuel en fin de chantier).
- Enforcement côté harness Claude Code (hooks PreToolUse) — le git-level couvre toutes les
  surfaces (agent, humain, autre outillage).

## Critères de fini

1. Un commit touchant tout fichier hors `docs/tasks/` sans tâche `in_progress` est REFUSÉ
   par le hook, message avec la commande `quick` exacte — vérifié par un vrai commit tenté.
2. La consignation (YAML seuls) et les merges passent sans friction.
3. `sitrep` (CLI **et** tool MCP) affiche « N commit(s) non consigné(s) » quand il y a
   dérive, muet sinon — vérifié sur le vrai repo.
4. Le skill porte la règle, le déclencheur élargi et l'interdit ; le skill installé est
   resynchronisé.
5. Tests + build verts ; le chantier lui-même est passé intégralement par des tickets.

## Assouplissement ultérieur — mode feedback (#149, 2026-07-09)

La règle « un retour post-`done` = un `quick` » reste le DÉFAUT, mais gagne une exception
de MÊME PÉRIMÈTRE : itérer sur la finition d'une même chose se fait désormais via un
journal `feedback[]` sur la tâche + une **réouverture** (`done → in_progress`), au lieu
d'un ticket-jumeau. Git conserve chaque commit, la tâche porte le récit. Un périmètre
NOUVEAU reste un `quick`. Détail : `docs/specs/2026-07-08-feedback-mode.md`.
