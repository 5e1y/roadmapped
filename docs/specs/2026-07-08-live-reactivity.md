# Réactivité live — file-watch + SSE, pulse, badges NEW, console d'actions

**Date** : 2026-07-08 · **Statut** : DRAFT — en attente de relecture Rémi
**Touche** : `src/server/api.ts` (plugin Vite), `src/state/TreeContext.tsx`,
`src/state/uiPersist.ts`, les vues Backlog/Roadmap, un nouveau composant console.
**Spec sœur** : `2026-07-07-concurrent-writes.md` (le verrou global — la source des
écritures qu'on va observer).

## Problème

Le dashboard ne se met PAS à jour en direct. Quand l'agent (ou le CLI, ou un autre
onglet) modifie un ticket, il faut `cmd+R` pour voir le changement : l'app lit
`/api/tree` une fois au montage (`TreeContext` → `reload()` au `useEffect`) et ne
resonde plus jamais. Dans l'usage cible — un agent qui pilote le backlog pendant que
l'humain regarde — c'est le défaut le plus visible : on rate en direct exactement ce
qu'on est venu voir.

Cette spec pose le SOCLE (le serveur pousse un signal, le client resync) puis trois
couches UX qui s'en nourrissent : le **pulse** in_progress, les **badges NEW** non-lus,
et la **console d'actions** horodatée. Zéro code avant approbation.

---

## 1. Socle — file-watch serveur + SSE + resync client

### Décisions

- **Watcher : `fs.watch` natif, pas de dépendance.** `node:fs.watch(dir, { recursive: true })`
  sur `tasksDir` et `docsDir` (chemins du loader de config). Pas de `chokidar` : la
  surveillance récursive native suffit sur macOS/Windows (nos cibles dev), et Linux est
  couvert par un repli non-récursif si besoin (voir Risques). Cohérent avec la doctrine
  « natif avant dépendance » (design.md, ponytail).
- **Débounce ~80 ms.** Une écriture roadmapped = plusieurs événements fs (rename+write,
  dump YAML complet). On coalesce sur une petite fenêtre : un seul signal par salve.
- **Transport : SSE (`text/event-stream`), pas WS ni polling.** Le besoin est
  strictement **serveur → client** (« quelque chose a changé »). SSE : unidirectionnel,
  sur HTTP, reconnexion automatique native (`EventSource`), zéro dépendance, traverse le
  dev-server Vite sans upgrade de protocole. WS serait bidirectionnel (inutile ici, plus
  lourd) ; le polling gaspille des requêtes et ajoute de la latence.
- **Endpoint : `GET /api/events`** ajouté au plugin `roadmappedApi` (`src/server/api.ts`).
  Il tient la connexion ouverte, garde la liste des clients abonnés, et émet
  `event: change` à chaque salve débouncée. Un `: keep-alive` périodique (~25 s) évite les
  coupures de proxy.
- **Signal léger, PAS le tree.** L'événement porte au plus `{ paths: string[] }` (les
  fichiers touchés), jamais le tree sérialisé. Le client réagit en appelant le `reload()`
  existant de `TreeContext` (re-fetch `/api/tree`). Une seule source pour la forme du
  tree (le validateur serveur), pas de second chemin de sérialisation à maintenir.
- **Le client garde le tree précédent.** `TreeContext` conserve une `ref` du tree
  d'avant-resync. Le **diff prev/next** (par id : apparu / disparu / champ changé, avec
  la transition de `status`) est calculé une fois au resync et exposé aux couches UX
  (pulse, NEW, console). C'est LA primitive : les trois couches suivantes ne sont que des
  lectures de ce diff.

### Esquisse

```
fs.watch(tasksDir, docsDir) --salve--> debounce(80ms) --> broadcast SSE `change`
                                                                 │
EventSource('/api/events').onmessage ──> TreeContext.reload() ──┤
                                                                 └─> diff(prevTree, nextTree)
                                                                        ├─ statusChanges[]
                                                                        ├─ appeared[] / removed[]
                                                                        └─ edited[]
```

### À confirmer (Rémi)

- OK pour `fs.watch` natif (vs ajouter `chokidar` pour la robustesse Linux) ? Reco :
  natif, `chokidar` seulement si un repli Linux se révèle nécessaire.
- La reconnexion `EventSource` par défaut (~3 s) suffit, ou on veut un backoff explicite ?

---

## 2. Pulse — les tickets in_progress respirent

- Indicateur bleu **pulsé** (accent `--color-accent`) sur tout ticket `in_progress`,
  partout où il apparaît (Backlog, Roadmap colonnes, graphe). Signale « ça bouge, là,
  maintenant ».
- **CSS pur** : une `@keyframes` d'opacité/halo sur le point d'accent existant du langage
  in_progress. Zéro JS, zéro dépendance. Respecte `prefers-reduced-motion` (pas de pulse
  → point fixe).
- Indépendant du socle pour le rendu (l'état in_progress est déjà dans les données), mais
  **c'est le socle qui le rend vivant** : sans resync live, le pulse n'apparaît qu'au
  `cmd+R`. À livrer après le socle pour être démontrable.

---

## 3. NEW / non-lu — ne rien rater

- **Set d'ids « vus »** persistés (`uiPersist` / localStorage). Un ticket est **NEW**
  s'il est apparu (nouvel id) OU a changé (son `updatedAt`/contenu) **depuis la dernière
  visite**.
- Rendu : **point bleu / badge NEW** discret sur la ligne du ticket. **Effacé à la
  lecture** — l'ouverture du panneau du ticket (ou un survol prolongé, à trancher) marque
  l'id comme vu et retire le badge.
- Source : le `updatedAt` par ticket + le set vu. **Prérequis** : `updatedAt` doit exister
  au niveau ticket (sinon on ne distingue pas « édité » de « inchangé »). Vérifier le
  schéma — si absent, un sous-ticket « ajouter updatedAt au dump » précède celui-ci.

### À confirmer (Rémi)

- Le badge s'efface à l'**ouverture du panneau** (reco, sans ambiguïté) ou aussi au simple
  survol/scroll-into-view ?
- Portée du « vu » : par appareil (localStorage, reco — pas de compte, pas de serveur) —
  confirmé cohérent avec la doctrine local-first.

---

## 4. Console d'actions + toasts

- **Console horodatée** : un panneau (flanc ou tiroir) qui retrace chaque action —
  `créé` / `démarré` / `terminé` / `édité` — sur les tickets ET les docs, avec l'heure et
  l'id/titre. Se remplit en direct depuis les `statusChanges`/`appeared`/`edited` du diff
  du socle.
- **Toasts** : sur une transition `→ done`, un toast « Task finished! » (composant `Toast`
  canonique existant). Éphémère, non bloquant, respecte reduced-motion.
- **Source — décision : diff live-only pour la v1.** La console se construit à partir des
  diffs de tree observés PENDANT la session. Pas de journal serveur persisté en v1 :
  l'historique hors-session existe déjà et mieux — **c'est `git log` sur `docs/tasks/`**
  (chaque `done` = un commit consigné). Réimplémenter un journal serveur dupliquerait
  l'audit log que le repo est déjà (YAGNI). La console dit « ce qui s'est passé depuis que
  tu regardes » ; git dit « ce qui s'est passé avant ». On peut poser un lien « voir
  l'historique complet » qui pointe le git log.
- Plafond assumé : rafraîchir la page vide la console de session. Acceptable — l'upgrade
  (rejouer le git log au montage pour préremplir) est un sous-ticket futur, pas la v1.

### À confirmer (Rémi)

- Console = flanc droit persistant, ou tiroir ouvrable ? Reco : tiroir (n'empiète pas sur
  les vues, s'ouvre sur un compteur d'activité).
- Toast uniquement sur `done`, ou aussi sur `started` / création ? Reco : `done` seul
  (le reste vit dans la console — trop de toasts = bruit).

---

## Découpage en sous-tickets (ordonnés par `dependsOn`)

> Note : plus de tiering Fable (doctrine annulée — coût). Difficulté indicative seule ;
> implémentation inline ou modèle par défaut.

1. **Socle SSE + file-watch + resync** — `add`, difficulté **M**. `/api/events` (SSE,
   clients, keep-alive), `fs.watch` débouncé sur tasksDir/docsDir, `EventSource` dans
   `TreeContext` → `reload()`. Vérif : éditer un YAML au CLI → le dashboard se met à jour
   sans `cmd+R`. **Fondation, bloque le reste.**
2. **Diff prev/next dans TreeContext** — `add`, difficulté **S**, dépend de (1). `ref` du
   tree précédent + fonction de diff (par id : status/appeared/removed/edited). Exposé au
   contexte. Vérif : test unitaire du diff.
3. **Pulse in_progress** — `quick`, difficulté **S**, dépend de (1). CSS keyframes +
   reduced-motion. Vérif visuelle : un ticket passé in_progress au CLI pulse en direct.
4. **`updatedAt` au niveau ticket** (si absent du schéma) — `quick`, difficulté **S**,
   dépend de rien. Prérequis de (5). Vérif : dump contient updatedAt, validate OK.
5. **Badges NEW / non-lu** — `add`, difficulté **M**, dépend de (2) et (4). Set vu dans
   uiPersist, badge, effacement à l'ouverture. Vérif : nouveau ticket → badge → ouvert →
   badge parti, persiste au reload.
6. **Console d'actions + toasts** — `add`, difficulté **M**, dépend de (2). Tiroir console
   alimenté par le diff, toast sur `→ done`, lien vers git log. Vérif : dérouler un cycle
   agent, voir les lignes s'empiler + le toast.

Chaîne : 1 → 2 → {3, 5, 6} ; 4 → 5. Livrable de chaque : la vérif ci-dessus, consignée au
`done`.
