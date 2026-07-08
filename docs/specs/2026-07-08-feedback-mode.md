# Mode « feedback » — itérer sur une tâche sans ruisseler des tickets

**Date** : 2026-07-08 · **Statut** : DRAFT — en attente de relecture Rémi
**Touche** : schéma tâche (`references/formats.md`), CLI/MCP (`scripts/task.mjs`,
`scripts/mcp-server.mjs`), `src/components/TaskPanel.tsx`, `sitrep`, le skill.
**Tension centrale** : assouplit la règle « done = frontière, un retour = un `quick` »
de `2026-07-08-process-enforcement.md`. **C'est une décision de doctrine — à trancher
par Rémi** (le reste en découle).

## Problème

Constaté par Rémi : itérer sur le MÊME sujet fait ruisseler des tickets
(#140 → #141 → #146…) alors que c'est **une seule chose en cours de finition**. La
règle actuelle — tout retour post-`done` = un nouveau `quick` — est saine pour la
traçabilité mais produit une traînée de tickets quasi-doublons quand on ne fait que
peaufiner la même chose en plusieurs passes.

## Le principe à NE PAS casser

La thèse du produit : **chaque changement de code = une unité traçable + un commit ;
`git log` sur `docs/tasks/` EST l'audit log.** Un « mode feedback » qui laisserait des
changements de code s'échapper du ticketing tuerait la valeur centrale de l'outil. Donc :
capturer un feedback ≠ faire un changement. On sépare les deux.

## Décision proposée (à confirmer par Rémi)

**Un journal de feedback attaché à la tâche, + la réouverture comme alternative au
quick-jumeau.**

1. **Journal de feedback** (additif au schéma) : `feedback: [{ date, author, text,
   resolved }]`. On empile des retours sur une tâche — `todo`, `in_progress` OU `done` —
   **sans créer de ticket**. C'est de la CAPTURE : le retour n'est pas perdu et ne force
   pas un ticketing prématuré. (Même famille que `notepad`/`refs` : une liste sur la
   tâche, écrite par le CLI.)

2. **Pas de nouveau statut.** L'enum `todo|in_progress|done` est immuable (Forbidden du
   skill). Une tâche `done` avec des feedbacks `resolved:false` est simplement
   **signalée** (badge + ligne `sitrep` « N done tasks with open feedback »). On
   n'invente pas `in_review`/`needs_feedback`.

3. **Agir sur un feedback = rouvrir, pas jumeler.** Quand le retour finit LA MÊME chose
   (même périmètre), on **rouvre** la tâche (`done → in_progress` via `take`/`start`), on
   l'adresse, on re-`done` avec un nouveau commit et le feedback marqué `resolved`.
   #140 → #141 → #146 devient « #140 rouverte 3×, re-terminée 3× » : **le git log garde
   chaque commit**, la tâche porte le récit dans son journal. Traçabilité intacte, zéro
   ticket-doublon.

4. **La frontière avec la règle actuelle.** Le `quick` reste le DÉFAUT pour un
   périmètre NOUVEAU / une préoccupation différente. La réouverture est réservée au
   « on finit la même chose ». Le journal rend la distinction explicite et auditable :
   c'est le critère « même périmètre ? » qui tranche, pas l'humeur.

## Cycle de vie

```
done (avec feedback open) --feedback <id> "…"--> feedback ajouté (open), tâche signalée
                                                        │
                  même périmètre ? ── oui ──> take/start (reopen) → fix → done + resolve
                                     └─ non ──> quick (règle actuelle, inchangée)
```

## Impact CLI / MCP / skill

- **`feedback <id> "<texte>" [--author a]`** : ajoute un item open. Miroir MCP
  `feedback`. Sortie : rappel « même périmètre → reopen ; nouveau périmètre → quick ».
- **`brief`/`show`** listent les feedbacks open de la tâche (l'agent les lit avant
  d'agir).
- **`done`** : `--resolve-feedback` (ou résolution implicite de tous les open à la
  clôture, à trancher).
- **`sitrep`** : nouvelle alerte « N done tasks with open feedback » (comme la dette).
- **Skill** : ajouter au « decision ladder » un rung 2.5 — « un retour sur une tâche
  done, MÊME périmètre → `feedback` + reopen ; périmètre nouveau → `quick` ». Mettre à
  jour la doctrine de `process-enforcement.md` en conséquence.

## UI (panneau)

- Section **Feedback** dans `TaskPanel` (sous le notepad) : liste d'items (date, auteur,
  texte, coche `resolved`), + un input pour en ajouter. Item open = point d'accent.
- **Badge « feedback open »** sur la ligne du ticket (Backlog/Roadmap).
- Le pattern ghost input (design.md §3) pour la saisie — champ permanent camouflé.

## Articulation avec #147 (console d'actions)

`feedback ajouté` / `feedback résolu` / `tâche rouverte` sont des événements de première
classe dans la console action-tracking (spec `2026-07-08-live-reactivity.md`). Une
réouverture y est visible comme une transition `done → in_progress` — le récit d'une
itération se lit dans la console comme dans le journal.

## À confirmer (Rémi) — les points de doctrine

1. **Le fond** : accepte-t-on la réouverture `done → in_progress` comme alternative au
   `quick`-jumeau pour le même périmètre ? (Reco : oui — c'est ce qui tue le
   ruissellement sans casser la traçabilité.)
2. Résolution des feedbacks au `done` : implicite (tous résolus) ou explicite
   (`--resolve-feedback 1,3`) ? Reco : explicite, pour ne pas clore par erreur un retour
   non traité.
3. `author` : libre (string) ou enum {rémi, agent} ? Reco : string libre (pas de compte,
   local-first).

## Découpage en sous-tickets (ordonnés par `dependsOn`)

> Plus de tiering Fable (annulé). Difficulté indicative.

1. **Schéma `feedback[]` + validation + migration** — `add`, **S**. Champ additif,
   validateur, dump. Vérif : validate OK, round-trip YAML.
2. **CLI/MCP `feedback` + reopen + `done --resolve-feedback`** — `add`, **M**, dépend (1).
   Vérif : `feedback` ajoute, `take` rouvre, `done` résout ; suite CLI ciblée.
3. **`sitrep` : alerte done-with-open-feedback** — `quick`, **S**, dépend (1).
4. **Skill + process-enforcement.md : le rung feedback vs quick** — `quick`, **S**,
   dépend (2). Documenter la frontière.
5. **UI panneau : section Feedback + badge** — `add`, **M**, dépend (1). Vérif visuelle.

Chaîne : 1 → 2 → 4 ; 1 → 3 ; 1 → 5. Sous-tickets à créer à l'approbation (zéro code
avant).
