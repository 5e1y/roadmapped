# Dérive process : des changements livrés sans ticket — cause racine & plan de correction

**Date** : 2026-07-08 · **Auteur** : agent (Fable 5) · **Statut** : ✅ TRAITÉ le 2026-07-08 —
spec `docs/specs/2026-07-08-process-enforcement.md` (#98), livré par #100 (hook guard),
#101 (signal sitrep), #102 (skill + resync), #103 (guide).
**Tâche source** : #94 · **Destiné à** : l'instance qui implémentera le correctif.

> Ce document décrit un problème réel observé en session, sa cause racine, et le
> correctif à implémenter (skill + app). Il n'est PAS une spec approuvée : la première
> étape du destinataire est de le transformer en spec + tâches roadmaped (workflow §1-2),
> puis de l'implémenter. **Zéro code produit avant d'avoir un ticket** — c'est le sujet
> même de ce doc.

## 1. L'incident

Pendant une session, après avoir livré (`done`) la tâche #88 (UI Notepad), l'utilisateur
a donné deux vagues de retours UX (« le notepad est pourri, change X, Y, Z », puis 4
corrections de plus). L'agent a appliqué ces retours en **deux commits** (`1e2b83d`,
`9271e48`) touchant `src/components/NotepadView.tsx` **sans créer aucun ticket** : pas de
`quick`, pas de `start`, pas de `done`, aucun passage par le CLI roadmaped. Seule trace :
« (#88) » dans le message de commit.

**Conséquence** : deux itérations de vrai travail UX n'existent nulle part dans le
backlog. Invisibles à `sitrep`, à `list`, à l'archive-changelog. Le seul « suivi » était
une chaîne de caractères dans un message git — exactement l'anti-pattern « ledger
parallèle » que roadmaped interdit, déplacé dans git.

## 2. Cause racine (une chaîne, pas un facteur unique)

1. **L'illusion de la frontière `done`.** #88 était `done`. Le retour a été mentalement
   classé « je peaufine ce que je viens de faire » au lieu de « nouveau travail ». La
   barre de décision (quick/task/spec) ne s'est jamais armée parce que l'agent n'a pas vu
   qu'il y avait une décision à prendre. Le `done` a été traité comme un couvercle, pas
   comme une frontière.

2. **Changement de mode de l'agent.** En exécution roadmaped (« on enchaîne sur la
   roadmap »), chaque changement passe start→work→done. Dès que l'interaction devient un
   feedback conversationnel direct (« répare ça »), l'agent bascule en mode
   « pair-programming » et lâche les réflexes d'opérateur. Le skill se déclenche sur
   « crée les tâches », « planifie X » — **pas** sur « répare ça », alors que c'est le
   même travail projet.

3. **L'urgence comme fausse excuse.** « ASAP », « go » → interprétés comme « saute la
   cérémonie ». Or un `quick` = ~2 commandes / ~120 tokens : il ne ralentit rien. `quick`
   a précisément été créé pour ce cas. L'urgence était une rationalisation.

4. **CAUSE RACINE SYSTÉMIQUE — zéro enforcement au point de mutation.** Rien dans la
   boucle n'a arrêté l'agent : il a édité `src/`, committé, et le CLI roadmaped n'a jamais
   rien vu. Les règles du skill (« start avant la première ligne », « pas de ledger
   parallèle ») sont des **disciplines**, pas des **gardes**. Tant que la seule ligne de
   défense est la vigilance de l'agent, elle saute dès que le cadrage « gestion de projet »
   disparaît. L'outil *documente* la discipline ; il ne la *contraint* pas au moment où
   elle compte : le commit.

## 3. La règle à graver (validée avec l'utilisateur)

> **Tout changement du repo = une unité roadmaped, sans exception, y compris juste après
> un `done`.** Le `done` est une frontière, pas un couvercle : un retour, un rework, un
> fix de revue → chacun son `quick` (ou une task/spec si c'est plus gros). Seules les
> demandes qui ne produisent AUCUN artefact (questions, explications, statut) restent
> conversationnelles.

Pourquoi « tout changement du repo » et pas « toute demande » : une règle qui exigerait un
ticket pour une simple question (a) remplit le backlog de bruit sans artefact, et (b) se
fait mentalement jeter parce que visiblement absurde 30 % du temps — et une règle jetée
laisse repasser les vrais cas. La frontière « est-ce que je vais toucher le repo / produire
un livrable ? » est quasi-binaire et **impossible à maquiller** en « oh c'est juste la
suite », contrairement à « est-ce assez significatif ? ».

## 4. Correctif à implémenter

Deux étages complémentaires. Le skill = le cadrage (nécessaire, pas suffisant). L'app = la
garde (le correctif durable). **Faire les deux.**

### 4.1 Skill — `skills/roadmaped/SKILL.md` (le cadrage)

- Ajouter la règle du §3 dans le noyau (barre de décision et/ou interdits), en toutes
  lettres, avec « le `done` est une frontière, pas un couvercle ».
- Élargir le déclencheur mental : le skill doit s'armer sur **« je m'apprête à éditer du
  code produit / écrire un fichier du repo »**, pas seulement sur « crée les tâches ».
- Nommer le piège explicitement : « ASAP / go » n'est jamais une raison de sauter le
  `quick` — le `quick` EST le chemin rapide.
- Contrainte de coût : le noyau doit rester ≤ ~55 lignes et stable (cache) — formuler
  serré, pas un paragraphe.

### 4.2 App — enforcement au commit (la garde)

Le levier durable : rendre la dérive **impossible ou visible** au point de friction réel.

- **Hook pre-commit `task.mjs guard`** : refuse (ou avertit fort, à trancher en spec) un
  commit qui touche des fichiers suivis quand il n'existe **aucune tâche `in_progress`**.
  L'installer via `.git/hooks/pre-commit` (ou un `core.hooksPath` committé). Prévoir un
  échappatoire explicite (`--no-verify` reste possible, mais l'absence de ticket est
  signalée).
- **Réutiliser la machinerie existante** : `--suggest-refs` (#71, dans `scripts/task.mjs`
  → `suggestedRefs()`) sait déjà mapper `git diff --name-only` → fichiers. Le hook peut
  s'en servir pour dire « ces fichiers ont bougé, aucune tâche `in_progress` ne les
  couvre → crée un `quick` » et proposer la commande exacte.
- **Signal dans `sitrep`** (`src/lib/render.ts` → `sitrepText`) : « N commits depuis le
  dernier `done` sans tâche associée » — rendre la dérive visible en ouverture de session
  au lieu de silencieuse.
- Option à évaluer : lier commit ↔ tâche de façon vérifiable (convention de message ou
  champ), pour qu'un futur `audit` puisse détecter les commits orphelins.

## 5. Critères de « fini » (pour le destinataire)

1. Le skill porte la règle « tout changement du repo = une unité, `done` = frontière »,
   noyau toujours ≤ ~55 lignes.
2. Un commit touchant `src/` (ou tout fichier suivi) sans tâche `in_progress` est bloqué
   ou averti par le hook `guard`, avec un message qui propose la commande `quick`.
3. `sitrep` signale les commits orphelins (sans tâche associée) depuis le dernier `done`.
4. Tests + build verts ; la boucle est auto-démontrée (le correctif lui-même est passé par
   des tickets roadmaped, pas commité « à la main »).

## 6. Fichiers pertinents

- `skills/roadmaped/SKILL.md` — le noyau du skill (règle + déclencheur).
- `scripts/task.mjs` — le CLI ; `suggestedRefs()` (diff→fichiers), point d'ancrage du hook.
- `src/lib/render.ts` — `sitrepText()` pour le signal des commits orphelins.
- `src/lib/taskWrites.ts` — source unique des mutations (si le hook doit lire l'état des tâches).
- `scripts/mcp-server.mjs` — surface MCP ; le même signal devrait remonter côté tools.
- `docs/specs/2026-07-07-token-economy.md` — contexte : la philosophie « l'app porte ce que
  l'agent ne doit pas déduire » s'applique aussi à la discipline.
