# Spec — Rail de navigation vertical (façon Figma) + promotion des graphes

Tâche #… · 2026-07-19 · type 04-brainstorm · décisions verrouillées avec Rémi

## Intention

Remplacer les tabs horizontaux du header par un **rail vertical d'icônes** (façon
Figma, cf. la bande File/Agents/Assets/Tools/Variables) et **promouvoir les deux
graphes** aujourd'hui enterrés en sous-modes au rang de vues de premier niveau.

## État actuel (constaté)

- 4 vues top-level : `backlog | roadmap | docs | notepad` (type `View`,
  `src/state/ViewContext.tsx:3`), commutées par un groupe segmenté horizontal dans
  `ViewHeader` (tableau `NAV`, `src/components/ViewHeader.tsx:50`).
- Le **graphe de dépendances** est un sous-mode de Roadmap (`RoadmapView` :
  Columns / Graph, segmenté interne).
- Le **graphe nodal KB** est un sous-mode de Docs (`DocsView` : Documents / KB,
  `src/components/DocsView.tsx:34`).
- Défaut = `backlog` ; vue persistée dans `localStorage['nav:view']` (App.tsx).

## Décisions (Rémi, 2026-07-19)

1. **Rail seul** — la bande d'icônes+labels remplace les tabs ; la vue occupe tout
   le reste. PAS de 2e colonne contextuelle façon Figma (Pages/Layers). Le pattern
   rail+panneau est écarté pour l'instant.
2. **Vue par défaut = Backlog** (inchangé). Les graphes sont promus au rail mais ne
   sont pas la vue d'ouverture. La reprise localStorage de la dernière vue reste.
3. **6 items séparés** dans le rail :
   `Backlog · Roadmap · Dépendances · Graphe · Docs · Notepad`.
   - `Roadmap` = les colonnes/stages SEULEMENT (perd son toggle Columns/Graph).
   - `Dépendances` = l'ex-Roadmap>Graph, extrait en vue de 1er niveau.
   - `Graphe` = l'ex-Docs>KB (graphe nodal), extrait en vue de 1er niveau.
   - `Docs` = les documents SEULEMENT (perd son toggle Documents/KB).

## Architecture cible

### Type `View` (6 valeurs)
`'backlog' | 'roadmap' | 'dependencies' | 'graph' | 'docs' | 'notepad'`

### Routing (App / MainView)
- `dependencies` monte directement le composant graphe de dépendances (extrait de
  `RoadmapGraph`/`RoadmapView`) — la bande d'epics-filtre (#343) reste, le filtre
  epic partagé aussi.
- `graph` monte directement `KbView`.
- `RoadmapView` : retirer le segmented Columns/Graph, ne garder que les colonnes.
- `DocsView` : retirer le segmented Documents/KB, ne garder que les documents.
- Mettre à jour : validation `nav:view` (6 valeurs, valeur inconnue → `backlog`),
  `document.title` (6 noms), le log d'usage (#345, déjà par vue), l'`OPEN_DOC_EVENT`
  (le panneau de tâche ouvre un doc → `setView('docs')`), et le titre du header.

### NavRail (nouveau composant)
- Bande verticale à gauche (~64 px), fond neutre, bord droit fin. Mascotte pixel en
  tête (comme le logo Figma en haut du rail). Puis 6 items empilés : icône + label
  court dessous, cliquables, état actif = accent (doctrine monochrome + accent rare,
  `--color-accent`/`--color-accent-tint`). Séparateurs fins pour grouper si utile
  (ex. les 3 vues « travail » Backlog/Roadmap/Dépendances vs Graphe/Docs/Notepad).
- Remplace le `<nav>` de `ViewHeader`. Le header garde le titre repo×marque et les
  contrôles PROPRES à la vue (le cluster droit : Activity, contrôles de vue).
- Accessibilité : `<nav>` + `aria-current="page"` sur l'actif, focus visibles,
  cibles ≥ 40 px, labels lisibles (pas d'icône seule sans texte).
- Icônes : étendre `src/components/glyphs.tsx` (line-icons monochromes cohérents) —
  une par vue. Pas de bibliothèque d'icônes tierce.

## Hors périmètre (assumé)

- Pas de 2e panneau contextuel (décision 1) — réévaluable plus tard.
- Pas de réorganisation du CONTENU des vues (le Backlog, les colonnes Roadmap, la KB
  restent tels quels) — on déplace la NAV et on promeut, on ne redessine pas les vues.
- Pas de raccourcis clavier de navigation (nice-to-have, ticket séparé si demandé).

## Tickets d'exécution

1. **[02-feature]** IA : promouvoir `dependencies` (ex-Roadmap>Graph) et `graph`
   (ex-Docs>KB) en vues de 1er niveau. `View`→6, routing MainView, retrait des deux
   toggles de sous-mode, validation localStorage / title / usage / OPEN_DOC_EVENT.
   La plomberie, sans le rail (le header garde temporairement des tabs à 6 entrées).
2. **[05-design]** `NavRail` : le rail vertical d'icônes remplaçant les tabs du
   header + les 6 icônes (glyphs.tsx). Dépend de 1 (les 6 vues doivent exister).
   DA monochrome + accent, a11y, mascotte en tête.
