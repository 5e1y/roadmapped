# Live updates V2 — panneau d'activité redessiné, docké dans le header

**Date** : 2026-07-09 · **Statut** : APPROUVÉE (validation déléguée à l'agent)
**Touche** : `src/components/LiveConsole.tsx` (→ redesign), `src/App.tsx` (montage du
provider), `src/components/ViewHeader.tsx` (slot du déclencheur), un nouveau
`src/state/LiveActivity.tsx` (état levé), option `src/index.css` (anim), `src/components/ui.tsx`.
**Ne touche PAS** : `api.ts`, `bin/roadmapped.mjs`, `src/lib/paths.ts` (backend #204/#203
déjà livré), ni le contrat de données `useTree().lastChange` / `treeDiff`.
**Ticket** : #205. **Prédécesseur** : `2026-07-08-live-reactivity.md` (le socle V1).
**Réalisée par** : instance Fable 5 (exception explicite Rémi à la règle « pas de Fable »).

## Problème

La V1 (`LiveConsole`) est un bouton flottant `bottom-left` + un tiroir. Rémi veut la
**V2 dans le header** (en haut), une meilleure **UI**, plus de **cohésion DS**, et plus
d'**interactivité**. Le fond fonctionnel (diff SSE → log horodaté + toasts « finished »)
est bon et reste ; c'est la surface qui est reprise.

## Contrainte d'architecture (non négociable)

`ViewHeader` est monté **une fois par vue** (Backlog/Roadmap/Docs/Notepad — 4 instances,
une seule visible, remontées au switch de vue). Donc l'ÉTAT du live (`log`, `unread`,
`open`) **ne peut PAS vivre dans `ViewHeader`** : il serait réinitialisé à chaque
changement de vue. Et un simple `position: fixed` top-right **chevaucherait** les
dropdowns de filtre que Backlog/Roadmap rendent déjà à droite du header.

→ Solution : **lever l'état dans un provider au niveau `App`** — un nouveau
`src/state/LiveActivity.tsx` (`LiveActivityProvider` + `useLiveActivity()`) qui consomme
`useTree().lastChange`, accumule le `log` horodaté et le compteur `unread` (la logique
actuelle de `LiveConsoleInner`), et héberge le `Toast.Provider` + `ToastViewport`. Le
provider enveloppe `Shell`. Le **déclencheur + le Popover** deviennent un composant
présentationnel **rendu DANS le cluster droit de `ViewHeader`** (avant `children`), qui
lit le contexte — l'état survit donc aux changements de vue (le provider est au-dessus),
et le déclencheur vit naturellement dans le header sans overlay `fixed`. Retirer l'ancien
montage flottant `<LiveConsole/>` de `App.tsx`.

## Design system (respecter — cf. `docs/design.md`, `src/index.css`)

- **Monochrome strict** + un **seul accent bleu** (`--color-accent` #2563eb / `accent-tint`
  #eef3fd), RARE : réservé à l'attention (badge non-lu, point d'activité). Aucune couleur
  hors tokens (la palette Tailwind par défaut est désactivée — une classe `bg-red-500` ne
  génère RIEN).
- **Base UI au maximum** (`@base-ui/react`) : le tiroir en `Popover`, les toasts déjà en
  `Toast`. Pas de dropdown maison si Base UI le couvre.
- **Ghost inputs / pas de chrome inutile** : filets discrets (`neutral-200`), fond blanc
  carte, ombres légères (`shadow-sm`/`shadow-lg`), coins `rounded-md`.
- Hauteur alignée `h-12` du header ; `reduced-motion` respecté pour toute anim (cf.
  `.pulse-live`, `.chev`).

## Direction (liberté de Fable sur les détails)

Le « quoi » est fixé, le « comment visuel » est à Fable. Attendus :

1. **Déclencheur dans le cluster droit du header.** Rendu dans `ViewHeader` (avant
   `children`), il remplace le bouton flottant. Compact, discret au repos, cohérent avec
   les dropdowns `FilterMenu` voisins (même hauteur, même langage) ; le badge de non-lus
   utilise l'accent. Un point/pulse d'activité quand du live arrive (cohérent avec
   `.pulse-live` existant) est bienvenu.
2. **Panneau (Popover) soigné.** En-tête « Activity — this session », liste horodatée
   (heure mono, verbe, `#id`, titre tronqué), pied « Session only — full history is your
   git log ». Améliorer lisibilité, rythme, densité, états (vide, plein, défilement).
3. **Interactivité +.** Au minimum : ouverture/fermeture fluide (Base UI), remise à zéro
   des non-lus à l'ouverture (déjà là), entrée récente mise en valeur brièvement. Bonus si
   pertinent : filtrer par verbe, cliquer une entrée pour ouvrir le ticket (émettre
   l'event d'ouverture de panneau — voir comment `TaskRow` ouvre `usePanel`), regrouper les
   rafales. Ne pas sur-construire (ponytail) : livrer le socle propre, marquer les extras
   `ponytail:` si reportés.
4. **Toasts « Task finished! »** conservés, cohérents visuellement avec le panneau.

## Garde-fous

- Garder le no-op sur le build démo statique (`__ROADMAPPED_STATIC__`) : pas de live sans
  SSE. Le déclencheur ne s'affiche pas (ou reste inerte) dans ce build.
- Garder une seule source d'état (le provider) + `Toast.Provider` englobant.
- `ViewHeader` est aussi monté hors provider dans certains tests unitaires : le composant
  déclencheur doit tolérer un `useLiveActivity()` absent (hook non-jetant → rendu nul),
  comme `useOptionalTree`. Ne pas casser les tests existants de header/vues.
- Ne rien changer à la source de données (`useTree().lastChange`, `treeDiff`) — c'est le
  contrat V1, il tient.
- Laisser UN check runnable si la logique non triviale change (ex. `eventsFromDiff`).
