# Spec — Cohérence du design system (revue adversariale + plan d'ajustement)

Tâche #379 · 2026-07-19 · type 04-brainstorm · epic `ds-consistency`

## Origine

Revue adversariale sur TOUTE l'app (brief « DSM furieux »), 6 dimensions
auditées en parallèle par des instances Fable. Évidence détaillée (fichier:ligne,
ratios WCAG, dénombrements) dans `docs/ds-review-2026-07/{1-tokens, 2-typo,
3-composants, 4-layout, 5-interaction, 6-iconographie}.md`. Cette spec SYNTHÉTISE
et dédoublonne en chantiers priorisés.

## Verdict d'ensemble

Le brief « aucune vraie DA, un bordel » est **globalement démenti** — les 6 agents
convergent : le SOCLE est solide (palette Tailwind neutralisée, zéro variant `dark:`,
SVG tokenisés, tri-couche page/carte/filet respectée, kit `ui.tsx` réellement
partagé, famille de glyphes cercle/diamant/carré impeccable, focus-visible global,
reduced-motion quasi exhaustif, fixes a11y #107-109 tous en place). Le désordre est
au-dessus : **primitives ré-inventées, registres méta qui oscillent, états non
unifiés, deux graphes qui s'entre-contredisent** — et une doctrine centrale qui ne
vit qu'en commentaires. Ce sont des dérives réparables, pas un chaos.

## Axe « DA sémantique » (7e passe, la préoccupation n°1 de Rémi)

Question de Rémi : est-ce que la FORME encode un SENS cohérent (arrondi/angle,
langage de sélection) ? Verdict de la passe dédiée (`7-langage-forme.md`) :
- **La doctrine de forme EXISTE et est écrite** (design.md:43-51) : le rayon encode
  la STRATE, pas l'interactivité — 0 = cousu à la surface, 4px = contrôle du corps,
  6px = chrome header/flottant, full = jauges. Suivie à ~90 %. Donc « chip carrée
  cliquable » ne viole rien (cousue à sa surface). Ce n'est PAS « arrondi=interactif ».
- **Le langage de sélection EST propagé sur 7 surfaces** (TaskRow, RoadmapGraph,
  RoadmapColumns, EpicBand, Notepad, DocsTree) — `bg-accent-tint` + barre inset accent
  pour l'item courant (§3.2). Il s'arrête pile aux **2 vues les plus récentes** :
  - OverviewView.tsx:106 (PreviewRow ouvre le panneau SANS se highlighter ; le
    commentaire l.104 « même contrat que TaskRow » est FAUX) — exemple de Rémi, confirmé.
  - ActivityView.tsx:54 (EntryRow, même trou).
- **Badge inerte au costume de toggle actif** : KbView.tsx:109 (badge « peut-être
  obsolète ») porte `border-accent`+tint, identique aux vrais toggles voisins — trompeur.
- **Formes à double/triple sens, lisibles mais NON écrites** : la barre gauche = 3 sens
  (accent 2px = courant · neutral 1px = imbrication · noir 4px = erreur) ; le tint = 3 sens
  (sélection · hover Notepad · drop). À DOCUMENTER, pas forcément à changer.
- **rounded-lg cartes Overview** (OverviewView.tsx:41) : seul rayon hors doctrine strate,
  ses cartes homologues (GraphCard, EpicCard) sont carrées → à aligner.
- **Popups rounded-md vs carrés** : design.md:49 contredit la moitié du code depuis #311
  (deux registres de sélection dont un — « enclenché » border-accent — jamais écrit).

→ Ce chantier (**C0**) passe en TÊTE : c'est ce qui se voit, et ses 2 fixes phares
(Overview + Activity) sont des one-liners. Détail : `7-langage-forme.md`.

## LE finding transversal (3 agents indépendants convergent)

**Le langage « actif/sélectionné » est éclaté en 4 variantes** alors que
design.md §3.2 en promet UN seul universel :
- rangée : tint + filet inset (conforme, ~6 écrans) ;
- pill : `border-accent` + tint (ViewHeader.tsx:107 + 4 autres — décision #311 jamais absorbée par le doc) ;
- NavRail : tint + icône accent (NavRail.tsx:66) ;
- segmented Overview : tint seul (OverviewView.tsx:90).
Recodé inline ≥6× en 3 dialectes (bord 300/200, hover fond/bord, avec/sans
font-medium) — cf. composants C1, tokens H3, interaction « 3 familles actif ».
**C'est la tête de pont du plan** : unifier ça règle le symptôme le plus visible.

## Chantiers (priorisés)

### C1 — Le langage « actif » unifié  [HAUTE]
Une primitive unique (`TogglePill` / classe d'état actif) ; réconcilier les 4
variantes en 1 (ou 2 documentées : rangée vs contrôle) ; **amender design.md §3.2**.
Sources : `3-composants.md` C1, `1-tokens.md` H3, `5-interaction.md`.

### C2 — Primitives dupliquées à extraire  [HAUTE]
- `ZoomControls` : barre de zoom copiée ligne à ligne (KbGraph.tsx:316-325 ↔ RoadmapGraph.tsx:343-352).
- Ligne-tâche mini réimplémentée 5× (ui.tsx:218, TaskPanel.tsx:146, KbNodePanel.tsx:79, OverviewView.tsx:106, ActivityView.tsx:31) — encre titre 600/800/900 divergente.
- Exporter les primitives DÉJÀ écrites mais locales : `RemoveButton` (TaskPanel.tsx:132), bouton primaire de header, `IconButton` (ViewHeader.tsx:58 ↔ ThemeToggle.tsx:23, hack `my-0.5`).
- Chips : `RemovableChip` (Backlog.tsx:22) est `rounded-md` alors que les chips sont carrées ; badges ad hoc (KbView.tsx:109). Unifier sur `Chip.tsx`.
- Recherche header : 2 recettes (Backlog.tsx:124 vs KbView.tsx:66).
Source : `3-composants.md`.

### C3 — Échelle typo + rythme vertical canoniques  [HAUTE]
- Fixer l'oscillation méta 11/12px (dates, compteurs, tags, chemins) — 7 findings = cette seule hésitation. Définir une échelle typo NOMMÉE à 6 niveaux (proposée dans `2-typo.md`).
- Rythme de liste : `py-[5px]` hors échelle (TaskColumns.tsx:77, EpicRow.tsx:235) → 3 hauteurs de rangée dans la MÊME liste Backlog. Une hauteur canonique.
- NavRail 10px → 11px (design.md:41). Activity en-tête jour `uppercase tracking-wide` = 3e registre de label inventé → ramener aux 2 autorisés.
- Carte de tâche Roadmap vs Deps diverge (px-3 py-2 vs py-2.5) alors que le commentaire jure la cohérence.
Source : `2-typo.md`.

### C4 — États (vide / chargement / erreur) unifiés  [HAUTE]
- `<ViewShell>` : le header RESTE visible pendant loading/erreur (aujourd'hui il disparaît sur Backlog/Roadmap/Deps, pas sur Overview/Graph).
- Généraliser `RoadmapStateGuard` → `TreeStateGuard` partagé (Backlog.tsx:54-81 le duplique verbatim).
- **Overview ignore loadError** (OverviewView.tsx:140-148) → « en attente… » à l'infini si serveur mort. À corriger.
- `<EmptyState>` : 12 empty states en ~6 registres → 1 composant.
Source : `4-layout.md`.

### C5 — Data-viz d'une même famille  [HAUTE — un point sémantique]
- **Pointillé `3 3` contradictoire** : = arête INFERRED dans KbGraph (KbGraph.tsx:441) MAIS = arête PAR DÉFAUT dans RoadmapGraph (RoadmapGraph.tsx:399). Sens opposés pour le même motif entre deux graphes jumeaux. À trancher (un seul encodage).
- Trait d'emphase à 3 valeurs (radar 2, chart/KB 1.5, roadmap 1.25) → 1. `non-scaling-stroke` absent du RoadmapGraph zoomable et du FlowAreaChart responsive → ajouter.
- Gris de grille : radar neutral-300 vs chart neutral-200 sur la MÊME page Overview.
- Radar = seule viz en accent PLEIN hors sélection (TypesRadar.tsx:63), contre la doctrine.
- **Supprimer TagGraph.tsx + lib/tagGraph.ts + test** : morts depuis que l'Overview passe par KbGraph — 3e langage visuel fantôme.
Source : `6-iconographie.md`.

### C6 — Contraste & a11y : régressions  [1 BLOQUANT + HAUTE]
- **BLOQUANT** : nœuds du graphe KB inaccessibles au clavier (KbGraph.tsx:560-575, `<circle>` cliquable sans tabIndex/role/clavier) — ouvrir un nœud est souris-seule, sans chemin redondant. Le graphe jumeau (Deps) utilise de vrais `<button>`. Aligner.
- Plancher de contraste #108 régressé dans les vues récentes : timestamp Activity neutral-400 (2,52:1, ActivityView.tsx:46), axes FlowAreaChart 9px neutral-400, + 4 autres textes sous neutral-500.
- Focus perdu après action hors panneaux : « Show more/less » (TaskColumns.tsx:153), chips filtres, ✕ note, Enter des ghost textareas.
- Cibles < 40px (croix 8-17px), hover de rangée neutral-50 vs neutral-100 mélangés (parfois même liste).
Source : `5-interaction.md`.

### C7 — Langue (DÉCISION Rémi requise)  [MOYENNE]
UI mi-FR mi-EN sous `lang="en"` : Activity/Overview/KB/Docs en français, le reste
en anglais ; parfois mixte dans une phrase (KbNodePanel.tsx:31). Trancher UNE langue
d'UI et harmoniser. → question ouverte, ne pas exécuter avant réponse.

### C8 — Amender design.md  [MOYENNE, transverse]
La doctrine de forme (strates/rayons) EXISTE déjà (§ radius). Les TROUS que 4+ agents
signalent : aucune section états ; aucune section iconographie/data-viz ; le 2e registre
de sélection (« enclenché » border-accent, #311) jamais écrit ; les sémantiques
multi-sens de la barre gauche et du tint non tabulées ; pas d'échelle typo/espacement
nommée. Le doc doit refléter les décisions de C0-C6 (tableaux barre-gauche / tint /
registres de sélection depuis `7-langage-forme.md`).

### C9 — Page « Design System » + raccourci clavier  [demande Rémi]
Un écran interne (accessible via un raccourci clavier, ex. `g d` ou `?`) où le DSM
voit et suit le système : tokens de couleur (échantillons clair/sombre), échelle
typo, primitives (boutons, chips, pills, cartes, états), glyphes, langage actif —
une « living styleguide » rendue depuis les VRAIS composants. Sert de garde-fou :
toute dérive future s'y voit. Peut vivre hors rail (raccourci seulement) pour ne pas
encombrer la nav utilisateur. À construire APRÈS C1-C3 (elle documente les primitives
unifiées).

## Hors périmètre / assumé

- Les décisions Rémi consignées (font-light, text-[2rem] Notepad, outline ghost) ne
  sont PAS des bugs — à documenter dans design.md, pas à « corriger ».
- La revue ne touche à AUCUN code (lecture seule) ; l'exécution est le rôle des
  tickets C1-C9, chacun vérifié + capture visuelle à l'intégration.

## Ordre proposé

C1 (langage actif) → C2 (primitives) → C3 (typo) en premier (ils fondent le reste),
en parallèle C4 (états) et C5 (data-viz) et C6 (a11y, dont le bloquant KB en tête),
puis C8 (design.md reflète tout) et C9 (page DS = miroir des primitives unifiées).
C7 attend la décision langue.
