# Spec — Écritures concurrentes : N agents sans collision

**Date** : 2026-07-07 · **Statut** : DRAFT — en attente d'approbation Rémi
**Brainstorm** : 3 questions tranchées par Rémi le 2026-07-07 (mécanisme, périmètre, horodatage).

## Contexte et diagnostic

`_meta.yaml` porte `nextId` en lecture-modification-écriture : deux agents simultanés
peuvent allouer le même id. La validation+rollback rattrape (le second échoue
proprement) mais sous forte concurrence : tempêtes de retries, et le rollback global
peut relire des fichiers à moitié écrits par un voisin. La piste « ids horodatés » a
été évaluée et écartée : les ids sont la monnaie la plus échangée du système (deps,
links, briefs, messages) — passer de 3 à 20+ caractères est un coût token permanent.
Le timestamp est recyclé au bon étage : l'ordre, pas l'identité.

## Décisions (et alternatives écartées)

1. **Verrou global sur la mutation** (décision Rémi) : `mkdir docs/tasks/.lock`
   (atomique sur tous les filesystems) autour de TOUTE la séquence
   allocation → écriture → validation → libération, dans `commitWrites`/`addTask`
   (taskWrites.ts — UN seul endroit, CLI et API en héritent). Échec du mkdir →
   retry avec backoff (50ms × 1.5, plafond ~1s, abandon à ~10s avec erreur claire).
   **TTL anti-deadlock** : le verrou écrit un fichier `pid+timestamp` dedans ; un
   verrou plus vieux que 10s est considéré orphelin (process mort) et écrasé.
   *Écartés* : verrou sur l'allocation seule (laisse les races de validation),
   ULID (coût token).
2. **Périmètre : verrou seul** (décision Rémi). Le serveur-écrivain-unique
   appartient à la spec MCP (#73) — pas de gonflement de périmètre ici.
3. **`createdAt` en datetime précis** (décision Rémi) : les nouvelles tâches portent
   `"2026-07-07T22:58:41"` (ISO local, seconde). Rétrocompatible : les dates seules
   existantes restent valides (validation accepte les deux formats), le tri traite
   une date seule comme minuit. Audit fin + tiebreaker d'ordre entre agents.

## Limite documentée (assumée, pas résolue)

Branches/worktrees : aucune garantie inter-branches (deux branches peuvent allouer
le même id ; le merge de `_meta.yaml` et des fichiers le révélera — la validation
refusera l'arbre fusionné). Doctrine : le multi-agent concurrent partage UN arbre
de travail ; les worktrees restent des chantiers isolés qui mergent leurs tickets
comme du code, conflits compris. À écrire dans `references/delegation.md` (2 lignes).

## Détails d'implémentation

- `withLock(tasksDir, fn)` dans taskWrites.ts : acquiert, exécute, libère en
  `finally`. Toutes les mutations (add/patch/archive/delete/saveRoadmaps) passent
  dedans. Les LECTURES ne prennent pas le verrou (elles restent lock-free ;
  l'atomicité par fichier de writeFileSync suffit une fois les écrivains sérialisés).
- Tests (TDD) : deux `addTask` réellement concurrents (spawn de 2 process sur le
  même sandbox) → deux ids distincts, zéro rollback ; verrou orphelin (fichier daté
  vieux) → écrasé ; timeout → erreur propre.
- `.lock` ajouté aux exclusions de `walk`/validation (ce n'est pas une section).

## Critères de fini

1. Test de concurrence réelle : 10 `add` simultanés en sandbox → 10 ids uniques
   consécutifs, zéro échec.
2. Verrou orphelin récupéré (test TTL) ; timeout → message d'erreur exploitable.
3. Nouvelles tâches en datetime (YAML relu), anciennes dates toujours valides
   (validate OK sur le backlog réel sans migration).
4. Doctrine worktrees écrite dans delegation.md ; tests + build verts.
