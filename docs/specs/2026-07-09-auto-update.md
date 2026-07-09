# MAJ auto de l'app — notification de nouvelle version au lancement

**Date** : 2026-07-09 · **Statut** : APPROUVÉE (validation déléguée à l'agent)
**Touche** : nouveau `src/lib/updateNotifier.ts`, `bin/roadmapped.mjs` (appel).
**Ticket** : #207.

## Problème

Le paquet `roadmapped` est distribué via npm/npx. Rien ne prévient l'utilisateur
qu'une version plus récente existe — il reste sur une vieille version sans le savoir.

## Décision : notify-only, jamais d'install auto

Muter les dépendances de l'utilisateur en silence (auto `npm install`) est dangereux
et surprenant. On se limite à **notifier** : une ligne discrète au lancement, et
l'utilisateur décide. C'est le pattern `update-notifier` (npm lui-même), réimplémenté
en ~30 lignes sans dépendance.

## Conception

`src/lib/updateNotifier.ts` — `notifyIfOutdated(packageDir): Promise<void>` :

1. **Version installée** : lue depuis `packageDir/package.json`.
2. **Cache** : `os.tmpdir()/roadmapped-update-check.json` = `{ checkedAt, latest }`.
   - Cache frais (< 24 h) → on réutilise `latest` sans toucher le réseau (pas de
     ralentissement à chaque lancement, pas de spam registre).
   - Sinon → `fetch('https://registry.npmjs.org/roadmapped/latest')`, timeout **800 ms**
     (`AbortSignal.timeout`), on écrit le cache.
3. **Comparaison** : `isOutdated(installed, latest)` — compare `major.minor.patch`
   numériquement. `ponytail:` comparateur naïf, ignore les pré-releases (`-beta`) — notre
   versionnage est en x.y.z simple ; upgrade = un vrai semver si on publie des pré-releases.
4. **Notice** (si `latest > installed`) :
   ```
   roadmapped: update available 0.1.0 → 0.2.0
     npm install roadmapped@latest && npx roadmapped upgrade
   ```
5. **Silence total** sur toute erreur : offline, paquet pas encore publié (404), JSON
   invalide, FS en lecture seule → `try/catch` englobant, aucune sortie, aucun throw. La
   notif ne doit JAMAIS casser ni ralentir un lancement.

**Appel** : au tout début de `case 'dashboard'` dans `bin/roadmapped.mjs`,
`await notifyIfOutdated(packageDir).catch(() => {})`. Borné à 800 ms, 1×/jour (cache).

## Hors scope

- Vérif sur chaque commande CLU (`done`, `add`…) : le dashboard est l'entrée
  principale ; l'étendre au proxy `task.mjs` est trivial plus tard si utile. YAGNI.
- Auto-install / auto-upgrade silencieux : décision explicite de ne PAS le faire.
- Canal de pré-release / channels : YAGNI.
