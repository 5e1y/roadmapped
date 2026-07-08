# design.md — la source de vérité visuelle de Roadmapped

**Statut** : actif (#111) · **Nourri par** : docs/audit-a11y-2026-07.md (#107-109)
**Appliqué par** : #113 (BaseUI), #114 (uniformité), #115 (a11y), #116 (Tailwind)

Un Design.md, pas un design system : ce document tranche chaque token, chaque composant
canonique et chaque règle. Tout écart constaté dans le code est un bug, pas une variante.
(Deviendra un système si l'app grossit — YAGNI aujourd'hui.)

## 1. Tokens

### Couleurs — monochrome + UN accent

La doctrine (décision Rémi #36, index.css) : **l'unique couleur est le bleu d'accent**,
réservé aux éléments actifs et aux points d'attention. Sa rareté le rend repérable.
Tout le reste est neutre. **Aucune couleur sémantique** (pas d'ambre, pas de rouge) —
l'erreur et le destructif s'expriment en registre monochrome appuyé (voir §3).

| Token | Valeur | Rôle |
|---|---|---|
| `--color-accent` | #2563eb | Actif, sélection, in_progress (5.17:1 sur blanc — conforme) |
| `--color-accent-tint` | #eef3fd | Fond de sélection opaque (+ filet gauche accent) |
| page | #fafafa (neutral-50) | LE fond de page, hérité du body, **jamais redéclaré** |
| carte | #ffffff | Surfaces « carte » : flancs de liste, cartes, panneaux, popups |
| filet | #e5e5e5 (neutral-200) | Bordures de séparation NON interactives |
| encre | #171717 (neutral-900) | Texte principal |

### Échelle de gris — la règle de contraste (audit #108)

Décision systémique, pas au cas par cas :

- **`neutral-500` (#737373) est le PLANCHER** de tout texte et de tout contrôle porteur de
  sens sur fond blanc/page (4.74:1 / 4.54:1). `text-neutral-400` et `text-neutral-300`
  sur du contenu informatif = non conforme (2.58:1 / 1.48:1), à promouvoir.
- Sur fond gris (`neutral-100`/`200`) : plancher **`neutral-600`** (#525252).
- `neutral-300`/`400` restent permis UNIQUEMENT pour le purement décoratif (grille du
  radar, filets) — jamais pour du texte, une icône porteuse de sens, ou un contrôle.
- États `disabled` : exempts WCAG, rester sur le rendu actuel.
- Micro-texte : rien sous 10px ; 10px existant à remonter à 11px (audit §3).

### Arrondis — deux rayons, une règle

- **`rounded` (4px)** : tout contrôle dans le corps des vues et des panneaux (inputs,
  boutons, boutons-icône).
- **`rounded-md` (6px)** : réservé aux contrôles du header h-12 (recherche, « + tâche »,
  tabs, filtres) et aux cartes flottantes (zoom graphe, radar).
- **Carré (aucun arrondi)** : surfaces (cartes, accordéons, popups, banners, toasts),
  chips, et lignes de liste (gabarit « ligne de backlog »).
- `rounded-full` : barres de progression uniquement.

### Espacements — gabarits canoniques

- Zone de contenu centrée : `mx-auto max-w-3xl px-6 py-8` (états loading/erreur compris —
  même gabarit que le contenu de leur vue).
- Flanc gauche fixe : `w-[420px]` + `py-2`, lignes internes `px-4`.
- Micro-labels : **deux niveaux seulement** — `text-xs font-medium` pour les en-têtes de
  liste de vue, `text-[11px] font-medium` pour les labels de champ de panneau. Encre :
  `text-neutral-500` (post-promotion).

## 2. Composants canoniques — Base UI partout, zéro élément fait main

Tous vivent dans `src/components/ui.tsx`. Interdiction des variantes en dur dans les vues.

| Besoin | Composant canonique | Notes |
|---|---|---|
| Dropdown/select | `Select` (Base UI) — peaux `fieldCls` / `ghost` / `compact` | Le `<select>` natif est interdit (dernier îlot : MiniZone → #113) |
| Ajout d'une relation | `AddCombobox` (Base UI) | Fix focus post-ajout : #115 |
| Tags multi + croix | `TagsCombobox` / `MultiCombobox` (Base UI Creatable) | Croix ChipRemove : pattern Base UI conforme (tabIndex=-1 + ←/→ Backspace) — ne pas « réparer » |
| Text field visible | `fieldCls` | Bordure : garder neutral-300 + différencier par `bg-neutral-50` (option B de l'audit, moins brutale que border-500) |
| Text field camouflé | `ghostCls` / `GhostInput` | LE pattern ghost (§3) — tout champ « invisible au repos » l'utilise, y compris le titre du quick-add mini |
| Erreur | `ErrorBanner` (+ `Toast` pour l'éphémère) | role=alert, bord gauche neutral-900 — DocsView et MiniZone s'y rallient (#113) |
| Popover/filtres | `FilterMenu` (Base UI Popover) | Ne jamais utiliser `Popover.Close disabled` (rend l'option inerte) |
| Chip de métadonnée | `Chip` | Y compris le badge team des cartes Roadmap (même donnée = même rendu que le Backlog) |
| Boutons | Primaire panneau : `rounded border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700` · Secondaire : `actionBtn` (hover `bg-neutral-100`) · Header : mêmes couleurs en `rounded-md` | Le hover « inversé » (clair→noir plein) est interdit ; « Supprimer » = secondaire (registre destructif global : non — YAGNI, monochrome assumé) |

## 3. Règles

1. **Tri-couche stricte** : page #fafafa (body, jamais redéclarée par une vue) / carte
   #ffffff / filets #e5e5e5. Une vue ne pose JAMAIS `bg-white` sur sa racine — le
   ViewHeader doit être identique dans les 4 tabs. Aucun hex de fond en dur dans les
   className (le `bg-[#fafafa]` sticky de RoadmapColumns → utilitaire/var).
2. **Langage « actif/sélectionné » universel** : `bg-accent-tint` + filet gauche
   `shadow-[inset_2px_0_0_var(--color-accent)]`. Le gris `bg-neutral-100` est réservé au
   hover — jamais à la sélection (déviant unique : DocsTree → #113).
3. **Pattern ghost input** (décision Rémi, actée) : les champs éditables sont des inputs
   PERMANENTS camouflés (`ghostCls`) — invisible au repos, hover `bg-neutral-100`, focus
   bordure + fond blanc. **Jamais** de swap lecture→input, jamais d'étape crayon.
4. **Focus** : visible partout (le `:focus-visible` global fait foi ; interdiction de le
   neutraliser par `focus:outline-none`/inline sans remplacement). Un contrôle révélé au
   hover se révèle AUSSI au focus (`focus-visible:opacity-100`). Après une action qui
   démonte l'élément focalisé (suppression, ajout, sortie d'édition), le focus est
   REPLACÉ explicitement (ligne suivante, input du combobox, conteneur du panneau) —
   jamais abandonné sur body.
5. **Clavier** : tout interactif est un `<button>` (ou géré Base UI). Un `role="button"`
   répond à Entrée ET Espace. Pas de zone cliquable souris-seulement porteuse d'une
   action non redondante.
6. **Monochrome** : toute couleur hors accent/neutres est un bug (l'ambre et le rouge du
   Notepad → sortis en #113).
