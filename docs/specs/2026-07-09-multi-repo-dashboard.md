# Dashboard multi-repos — savoir dans quel repo on est + ouvrir deux repos à la fois

**Date** : 2026-07-09 · **Statut** : APPROUVÉE (Rémi a délégué la validation à l'agent)
**Touche** : `src/lib/paths.ts`, `src/server/api.ts`, `src/state/TreeContext.tsx`,
`src/components/ViewHeader.tsx`, `src/App.tsx`, `bin/roadmapped.mjs`, `docs/guide.md`.
**Tickets** : #204 (header + primitive), #203 (fix collision + doc du modèle).

## Problème

Un seul paquet `roadmapped`, N repos hôtes : le CODE vient du paquet, les DONNÉES
du repo hôte (`ROADMAPPED_ROOT`, résolu depuis le cwd). Deux trous quand on
travaille sur plusieurs repos en parallèle :

1. **On ne sait pas quel repo on regarde.** Le header dit juste « Roadmapped ». Deux
   dashboards ouverts (repo A et repo B) sont visuellement identiques.
2. **On ne peut pas fiablement en ouvrir deux.** L'idempotence #153 (`bin/roadmapped.mjs`)
   sonde `localhost:5173/api/tree` et no-op dès qu'un `{ok:…}` répond, SANS vérifier
   que ce dashboard sert le MÊME repo. Donc : dashboard ouvert sur A (5173) → `npx
   roadmapped dashboard` dans B voit A, dit « déjà ouvert → 5173 » et affiche A (faux).

## Décision

Une **primitive partagée** débloque les deux : `/api/tree` (que le client fetch déjà
au montage, et que la sonde du bin interroge déjà) renvoie en plus le **repo hôte**.
Pas de nouvel endpoint `/api/whoami` — on étend le payload existant.

### 1. Backend — exposer le repo hôte

- `RoadmappedPaths` gagne un champ `root: string` (le hostRoot absolu). `resolvePaths`
  le renseigne (il reçoit déjà `root`), `loadPathsAt`/`loadPaths` le propagent.
- `getTree` (dans `runAction`) renvoie `hostRoot: paths.root` et
  `repoName: basename(paths.root)` en plus de `tree`/`errors`.

### 2. Header — « Roadmapped ✕ NomDuRepo »

- `ViewHeader` affiche la marque + le nom du repo. Forme : **Roadmapped** (semibold,
  existant) · un séparateur `✕` en **graisse Light** (`font-light text-neutral-400`) ·
  **NomDuRepo** (`font-medium text-neutral-700`). Le repo tronque si long (`truncate`),
  la marque et le ✕ ne rétrécissent pas (`shrink-0`).
- Source : `TreeContext` expose `repoName` (lu du payload `/api/tree`). Fallback quand
  absent (build démo statique, chargement) : rien après « Roadmapped » (pas de ✕ nu).
- `document.title` (App.tsx) passe de `vue · Roadmapped` à `repoName · vue · Roadmapped`
  → les onglets navigateur se distinguent aussi.

### 3. Fix collision de port (#203)

- La sonde du bin lit `body.hostRoot`. Compare au hostRoot résolu localement
  (`findHostRoot()` / `ROADMAPPED_ROOT`) :
  - **même root** → no-op + URL (idempotence légitime : c'est le même repo).
  - **root différent** → on laisse Vite démarrer ; `strictPort:false` par défaut
    auto-incrémente sur 5174, 5175… (déjà le comportement quand le port est pris).
- Plafond restant (assumé, `ponytail:`) : la sonde ne teste que 5173. Un 3e repo dont
  le dashboard a migré sur 5174 n'est pas détecté comme « déjà ouvert » → une 2e
  instance peut démarrer sur 5175 pour le même repo. Rare, sans dégât (deux onglets du
  même repo), upgrade = balayer 5173-5180. Non fait.

### 4. Doc du modèle (#203)

Une section courte dans `docs/guide.md` : « Un paquet, N repos ». Le code vient du
paquet ; les données du repo courant. Ouvrir deux repos = lancer `npx roadmapped
dashboard` dans chacun ; le 2e prend automatiquement 5174. Workaround explicite si
besoin : `npx roadmapped dashboard --port 5174`.

## Hors scope

- Un sélecteur de repo dans l'UI (switcher). YAGNI : un dashboard = un repo, un onglet.
- Persister/afficher le chemin absolu complet dans le header (le basename suffit ;
  le chemin complet reste dans `document.title`/tooltip si un jour utile).
