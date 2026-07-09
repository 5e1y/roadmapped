# MAJ auto de l'app — notification de nouvelle version au lancement

**Date** : 2026-07-09 · **Statut** : APPROUVÉE (validation déléguée à l'agent)
**Touche** : nouveau `src/lib/updateNotifier.ts`, `bin/roadmapped.mjs` (appel).
**Ticket** : #207.

## Problème

Le paquet `roadmapped` est distribué via npm/npx. Rien ne prévient l'utilisateur
qu'une version plus récente existe — il reste sur une vieille version sans le savoir.

## Décision : notify-only, jamais d'install auto — sonde GitHub (jamais npm)

**Distribution GitHub-only (tranché par Rémi le 2026-07-09 : « on reste github only »).**
L'install passe par `github:5e1y/roadmapped` et suit HEAD de `main`. Il n'y a PAS de
publication npm — sonder `registry.npmjs.org` serait un 404 permanent. On sonde donc
GitHub. Et on se limite à **notifier** (jamais d'auto-install : muter les deps de
l'utilisateur en silence est dangereux). Pattern `update-notifier`, ~40 lignes, une seule
dépendance système déjà requise par l'install github: — `git`.

Comme la version reste statique (`0.1.0` non bumpée par commit), le seul signal fiable de
« main a bougé » est le **SHA de commit**, pas le semver.

## Conception

`src/lib/updateNotifier.ts` — `notifyIfOutdated(packageDir, hostRoot): Promise<void>` :

1. **Clone de dev / self-host** : si `packageDir/.git` existe → `return` immédiat. L'auteur
   travaille sur les sources, pas sur une install ; il ne veut pas d'une notice « en retard »
   à chaque commit local non poussé.
2. **SHA installé** : lu du **package-lock de l'hôte** (`hostRoot/package-lock.json`, puis
   `hostRoot/node_modules/.package-lock.json`), champ `packages["node_modules/roadmapped"].resolved`
   = `git+…github.com/5e1y/roadmapped.git#<sha>` → `shaFromResolved()`. Le `package.json`
   installé ne porte AUCUN champ SHA avec npm moderne (vérifié). Pas de lock (pnpm/yarn/bun)
   → `null` → no-op silencieux (plafond assumé).
3. **SHA distant** : cache `os.tmpdir()/roadmapped-update-check.json` = `{ checkedAt, remoteSha }`.
   - Cache frais (< 24 h) → réutilisé (pas de réseau à chaque lancement).
   - Sinon → `git ls-remote https://github.com/5e1y/roadmapped.git HEAD`, timeout **2 s**
     (pas de limite de taux, pas d'auth, contrairement à l'API GitHub), on écrit le cache.
4. **Comparaison** : SHA installé ≠ SHA distant (avec tolérance short/long via `startsWith`)
   → en retard. Notice :
   ```
   roadmapped: a newer version is available on GitHub (5982339 → 5715898)
     npm install github:5e1y/roadmapped && npx roadmapped upgrade
   ```
5. **Silence total** sur toute erreur : offline, git absent, lock illisible, FS RO →
   `try/catch` englobant, aucune sortie, aucun throw. La notif ne doit JAMAIS casser ni
   ralentir un lancement.

**Appel** : dans `case 'dashboard'` de `bin/roadmapped.mjs`, APRÈS résolution du `hostRoot`
(dont la sonde a besoin), `await notifyIfOutdated(packageDir, hostRoot).catch(() => {})`.
Borné à ~2 s, 1×/jour (cache).

## Hors scope

- Vérif sur chaque commande CLI (`done`, `add`…) : le dashboard est l'entrée principale.
  YAGNI.
- Auto-install / auto-upgrade silencieux : décision explicite de ne PAS le faire.
- Installs non-npm (pnpm/yarn/bun) : pas de package-lock npm → pas de notice. Plafond assumé.
- Publication npm : abandonnée (github-only).
