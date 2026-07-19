# DS Review — Dimension 1 : Tokens, couleur, thème (clair/sombre)

Référence : `docs/design.md` (source de vérité). Méthode : grep exhaustif (hex/rgb/hsl/oklch, classes arbitraires, toutes familles d'utilitaires couleur, `dark:`, inline styles) + lecture ciblée + calcul WCAG des ratios cités.

**Verdict global** : le brief « aucune vraie DA » est FAUX sur cette dimension — le socle tokens/thème est un des plus rigoureux qu'on puisse trouver (palette désactivée par `--color-*: initial`, zéro `dark:` variant, SVG tokenisés). Les vrais problèmes sont : (1) des violations du plancher de contraste #108 revenues APRÈS l'audit, (2) quatre langages « actif » là où design.md n'en documente qu'un, (3) trois poches de couleur en dur sans variante dark, (4) un design.md en retard sur les décisions réelles.

Bilan : **0 Critique · 4 Haute · 7 Moyenne · 5 Basse** (+ inventaire du sain, + trous de design.md).

---

## CRITIQUE

Aucun finding de ce niveau. Rien ne casse le thème, ne rend un écran illisible ou ne fait fuir une couleur hors système. Je ne gonfle pas la sévérité pour coller au brief.

---

## HAUTE

### H1 — Timestamp du feed Activity sous le plancher de contraste
- **`src/components/ActivityView.tsx:46`** : `<span className="… text-neutral-400">{entry.at}</span>` — l'heure de chaque entrée, texte informatif, en neutral-400.
- Constat : **2,52:1 sur blanc / 2,42:1 sur la page** (calculé). design.md §Gray scale : « neutral-500 is the FLOOR for all text … `text-neutral-400` on informative content = non-compliant ». Incohérence croisée : le MÊME rôle (timestamp de ligne de liste) est rendu `text-neutral-500` dans le Notepad (`NotepadView.tsx:255`).
- Correction : `text-neutral-500`. (Vue #372/#377, donc écrite APRÈS l'audit #108 — la règle ne tient pas sans garde-fou, cf. Reco 4.)

### H2 — FlowAreaChart : axes 9 px en neutral-400 + série/légende sous 3:1
- **`src/components/FlowAreaChart.tsx:106` et `:127`** : étiquettes d'axes X/Y `className="fill-neutral-400" fontSize="9"` — texte informatif (valeurs, dates) à 2,52:1 ET sous le minimum micro-texte (« nothing below 10px », design.md §1). Double violation.
- **`:82`** : pastille de légende « Créés » `bg-neutral-400` et **`:117`** ligne de crête « créés » `stroke="var(--color-neutral-400)"` — objets graphiques porteurs de sens à 2,52:1 en clair (< 3:1, WCAG 1.4.11) ; design.md réserve 300/400 au « purely decorative ».
- Correction : `fill-neutral-500` + 10–11 px pour les axes ; série « créés » en neutral-500 minimum.

### H3 — QUATRE langages « actif/sélectionné », design.md n'en documente qu'UN
design.md §3.2 : « **Universal** "active/selected" language: `bg-accent-tint` + left rule `shadow-[inset_2px_0_0_var(--color-accent)]` ». Constaté dans le code :
1. **Rangées** = tint + filet inset ✓ conforme et uniforme : `TaskRow.tsx:73`, `RoadmapColumns.tsx:43`, `RoadmapGraph.tsx:450` et `:577`, `EpicBand.tsx:96`, `NotepadView.tsx:249`, `DocsTree.tsx:80`.
2. **Pills bordées** = `border-accent bg-accent-tint` (PAS d'inset) : `ViewHeader.tsx:107` (FilterMenu), `TagGraph.tsx:105`, `TypesRadar.tsx:87`, `KbView.tsx:97`, `KbDisplayMenu.tsx:75`. Le commentaire `ViewHeader.tsx:100-102` revendique un « langage actif DS des pills bordées » adossé à la décision #311 — **jamais reporté dans design.md**.
3. **NavRail** = `bg-accent-tint text-accent`, ni bord ni inset : `NavRail.tsx:66`.
4. **Segmented Overview** = tint seul + `font-medium` : `OverviewView.tsx:90` ; le commentaire `:74` réécrit la doctrine à sa sauce (« langage actif du DS : bg-accent-tint sur l'option courante »).
- Constat : la continuité tient à moitié (tous partagent accent-tint) mais quatre rendus coexistent pour « ceci est actif », et la source de vérité en promet un seul universel.
- Correction : amender design.md en 2 langages canoniques max (rangée = tint+inset ; contrôle compact = pill bordée) et aligner NavRail + Segmented sur la famille pill (ou documenter leurs variantes explicitement).

### H4 — KbView : même rendu accent pour un filtre actif et un AVERTISSEMENT système
- **`src/components/KbView.tsx:97`** : toggle « inferred » actif = `border-accent bg-accent-tint` (filtre appliqué par l'utilisateur).
- **`src/components/KbView.tsx:109`** : badge « corpus stale » (`title="Le corpus a changé depuis la génération…"`) = `border border-accent bg-accent-tint` — **rendu identique, à quelques pixels dans le même header**, pour une sémantique opposée (alerte système vs choix utilisateur).
- Constat : design.md §1 impose « No semantic colors — error … states are expressed through an emphatic monochrome register (§3) ». Un avertissement en langage « filtre actif » brouille les deux signaux.
- Correction : badge stale en registre monochrome appuyé (modèle ErrorBanner : bord neutral-900), l'accent reste au seul état actif.

---

## MOYENNE

### M1 — GRAPHIFY_BLUE en dur, sans variante dark
- **`src/components/KbGraph.tsx:612`** : `const GRAPHIFY_BLUE = '#2563eb'`, appliqué en `backgroundColor` (`:629`) sur le masque du logo.
- Constat : commenté « la seule couleur en dur légitime ici (logo tiers) », mais **3,47:1 sur la carte sombre #171717** (calculé) — précisément la raison pour laquelle `--color-accent` a été éclairci en dark (`src/index.css:61` : « #2563eb ne tient que 3,5:1 sur la carte »). design.md §1 : « **a hardcoded hex is a dark-mode bug** » — sans clause d'exception écrite pour les marques tierces.
- Correction : token `--color-graphify-brand` à deux valeurs (ou `var(--color-accent)`, identique en clair), + documenter l'exception « marque tierce » dans design.md.

### M2 — Sémantique de l'accent inversée en data-viz : accent = « Fermés »
- **`src/components/FlowAreaChart.tsx:85` et `:118`** : la série **« Fermés » (travail terminé)** est en accent, la série « Créés » en neutre.
- Constat : partout ailleurs l'accent signale le travail **en cours** ou l'actif : glyphes in_progress `glyphs.tsx:36/67/100` (+ commentaire index.css:4-8 « éléments ACTIFS … travail in_progress »). Dans ce chart, le bleu dit l'inverse (le done). Les barres de progression `bg-accent` = % done (`RoadmapColumns.tsx:18`, `EpicRow.tsx:278`, `RoadmapGraph.tsx:554`) et le Check accent du toast « tâche bouclée » (`ui.tsx:172`) entretiennent la même ambiguïté accent=accompli.
- Correction : décider ce que l'accent SIGNALE en data-viz (proposition : accent = flux d'achèvement, neutre = volume — mais l'écrire dans design.md, cf. trous).

### M3 — Hover de rangée : neutral-50 et neutral-100 pour le même rôle
- Famille A `hover:bg-neutral-50` : `TaskRow.tsx:73`, `TaskColumns.tsx:77`, `EpicRow.tsx:235`, `OverviewView.tsx:111`, `NotepadView.tsx:249`, `RoadmapGraph.tsx:577`, `RoadmapColumns.tsx:171`.
- Famille B `hover:bg-neutral-100`, même rôle « rangée de liste sur carte » : `DocsTree.tsx:51` et `:80`, `ActivityView.tsx:54`, `KbNodePanel.tsx:82`, `TaskPanel.tsx:164` et `:251`, et **`NotepadView.tsx:239`** (« New note ») — dans la MÊME liste que les notes en `hover:bg-neutral-50` (`:249`) : deux hovers différents à l'écran.
- Constat : les deux textes normatifs se contredisent — `index.css:26-28` (« hover:bg-neutral-50 (survol de rangée sur carte) ») vs design.md §3.2 (« Gray `bg-neutral-100` is reserved for hover »). Aucune règle ne dit lequel où.
- Correction : trancher (ex. 50 = rangées pleine largeur sur carte ; 100 = items de menus/popups et petits contrôles) et l'écrire ; corriger au moins NotepadView:239.

### M4 — L'input recherche du Graph (KbView) diverge du canon sur 3 axes
- **`src/components/KbView.tsx:73`** : `placeholder:text-neutral-400` (les 5 autres champs = `placeholder:text-neutral-500` : `Backlog.tsx:129`, `ui.tsx:329/427/515`, `SectionPanel.tsx:230`, `NotepadView.tsx:338`) ; `focus:border-neutral-400` (canon = `focus:border-neutral-900` : `Backlog.tsx:129`, fieldCls `ui.tsx:17`) ; `text-neutral-800` (recherche Backlog = `text-neutral-900`).
- Constat : même rôle (recherche dans un header de vue), trois valeurs plus faibles, dont un placeholder sous le plancher (2,52:1).
- Correction : copier le template de `Backlog.tsx:129`.

### M5 — Affordance « ligne fichier cliquable » du Notepad en neutral-300
- **`src/components/NotepadView.tsx:301`** : au repos, `decoration-neutral-300` souligne les lignes reconnues comme chemins de fichiers — **1,48:1 en clair, ≈2,1:1 en sombre** (calculé).
- Constat : ce souligné EST le signal d'affordance (meaning-bearing) ; design.md §1 réserve 300/400 au « purely decorative — never … a meaning-bearing icon, or a control ».
- Correction : `decoration-neutral-500` au repos (le hover accent `:301` est bon).

### M6 — Vue Activity hors tri-couche : rangées sur la PAGE, header de groupe sur CARTE
- **`src/components/ActivityView.tsx:80-95`** : le feed n'a aucun conteneur `bg-white` — les rangées posent sur la page #fafafa — alors que le header de jour sticky (`:83`) est `bg-white` et que le Backlog enferme ses rangées dans une carte (`Backlog.tsx:74` : `border border-neutral-200 bg-white`).
- Constat : au scroll, une bande « carte » flotte sur une liste « page » : deux couches de la tri-couche (§3.1) mélangées dans la même vue, et une liste rendue différemment de toutes les autres.
- Correction : envelopper le feed dans la coquille carte du Backlog (ou passer le header sticky en `bg-page` si le choix est « feed nu » — mais le documenter).

### M7 — Card Overview en `rounded-lg` : radius hors système
- **`src/components/OverviewView.tsx:41`** : `rounded-lg` (8px) sur les cartes de la grille.
- Constat : l'échelle DS n'a que `rounded` (4px) et `rounded-md` (6px), et design.md §1 impose « **Square (no radius)**: surfaces (cards, …) ». 8px n'existe nulle part ailleurs — token hors système ET surface arrondie interdite.
- Correction : retirer le radius (carte = carrée) ou amender design.md si la grille Overview est une exception voulue.

---

## BASSE

### B1 — Rampe température : RGB en dur sans jeu de valeurs dark
- **`src/components/Temperature.tsx:19-23`** : stops `[59,107,199]`, `[163,163,163]`, `[234,88,12]` en dur. L'exception chromatique est documentée (design.md §2 « Temperature exception » + commentaire :4-8) — pour la TEINTE. Mais aucune variante sombre : le stop médian est littéralement le neutral-400 CLAIR (#a3a3a3) figé, qui ne suit pas l'échelle sombre ; froid = 3,51:1 sur carte sombre (passe 1.4.11 de justesse). Correction : table de stops par thème, ou stop médian = `var(--color-neutral-400)` résolu au render.

### B2 — `text-neutral-800` : un rôle d'encre fantôme (15 usages)
- Ex. `TaskPanel.tsx:170` et `:253`, `KbNodePanel.tsx:86` : titres de tâches dans les listes de panneau en neutral-800, quand `TaskRow.tsx:113` rend le même rôle (titre non-done) en neutral-900. design.md ne définit que ink=900, planchers 500/600 — 800 n'a pas de rôle écrit. À trancher : soit « encre secondaire de panneau » documentée, soit promotion en 900.

### B3 — `neutral-100` : un deuxième token de filet de fait, non documenté
- `divide-neutral-100` / `border-neutral-100` ×15 : `Backlog.tsx:74`, `TaskColumns.tsx:151/183`, `ActivityView.tsx:86`, `OverviewView.tsx:190`, `ViewHeader.tsx:169`, `NotepadView.tsx:239`, `UpdateNotice.tsx:160`, `KbDisplayMenu.tsx:112`. design.md §1 ne connaît qu'UN filet : neutral-200. L'usage est cohérent (intra-liste = 100, périmètre = 200) mais la règle n'existe pas sur papier.

### B4 — Métadonnées de panneau en neutral-400
- **`src/components/KbNodePanel.tsx:55`** (sourceLocation), **`TaskPanel.tsx:255`** (sourceLocation), **`TaskPanel.tsx:266`** (« via 1 hop ») : informatifs à 2,52:1. Moins visibles que H1 (petites métadonnées de panneau) mais même violation du plancher. Correction : neutral-500.

### B5 — Icon-buttons révélés au survol : hover neutral-200, pattern non écrit
- `RoadmapColumns.tsx:138`, `TaskPanel.tsx:139`, `ui.tsx:554` : `hover:bg-neutral-200` — cohérents entre eux (le bouton vit SUR une rangée déjà hover, 100 serait invisible) mais les icon-buttons permanents sont `hover:bg-neutral-100` (`SidePanel.tsx:108/119`, `Backlog.tsx:30`, `ui.tsx:179`). Déduction plausible, règle absente de design.md. À documenter, pas à corriger.

---

## À VÉRIFIER (non compté — doute assumé)

- **KbGraph tout-accent** : au repos, CHAQUE nœud porte un stroke accent pleine opacité (`KbGraph.tsx:565-566`, `nodeFill` `:513-524` retourne `stroke: 1` pour tous), fill accent 0.2 — l'écran Graph entier est bleu. Le commentaire `:511-512` revendique la « doctrine de rareté » mais elle ne vaut que pour le FILL. Tension réelle avec « monochrome + accent rare », mais c'est visiblement une décision d'identité Graphify (continuité assumée dans `OverviewView.tsx:22-23`) — je ne la compte pas comme violation sans confirmation de Rémi ; c'est un TROU de design.md (aucune doctrine data-viz/graphe).
- **Fills accent translucides du KbGraph** (`fillOpacity` 0.06–0.9) vs la raison d'être du tint OPAQUE (`index.css:18-19` « ne laisse rien transparaître (arêtes du graphe) ») — probablement voulu pour les états dim, à confirmer.

---

## CE QUI EST SAIN (et remarquablement)

- **Strip-down réel** : `--color-*: initial` (`index.css:15`) — toute classe hors système (text-red-600, bg-slate-…) ne génère RIEN ; grep confirme zéro classe hors palette dans src/.
- **Dark = jeu de valeurs, tenu à 100 %** : zéro `dark:` variant dans toute l'app (grep), zéro inline style couleur hors GraphifyMark. `text-white` sur `bg-neutral-900` (boutons primaires `ui.tsx:35`, `Backlog.tsx:135`, `UpdateNotice.tsx:145`) s'inverse proprement puisque les deux tokens basculent.
- **Sélection rangée uniforme sur 6 écrans** : tint+inset identique Backlog/Roadmap/Graph-roadmap/Epics/Notepad/Docs — l'ex-déviant DocsTree (design.md §3.2) est rentré dans le rang (`DocsTree.tsx:78-80`).
- **SVG data-viz tokenisés** : TypesRadar, FlowAreaChart, TagGraph, RoadmapGraph (`EDGE_STROKE` `:249`, marqueurs `:379-385`), KbGraph — tout en `var(--color-*)`, donc theme-aware, y compris les fonds de labels (`KbGraph.tsx:588` `--color-white` + opacité).
- **Ombres** : seules shadow-sm/shadow-lg existent dans le code (tally exhaustif) — exactement les deux densifiées en dark (`index.css:81-82`). Aucune ombre orpheline.
- **Progress bars** ×3 identiques (track neutral-200 / fill accent) : `RoadmapColumns.tsx:17-18`, `EpicRow.tsx:277-278`, `RoadmapGraph.tsx:553-554`.
- **Aucun token mort** : 50→900, page, white, accent, accent-tint tous consommés ; `bg-page` utilisé une seule fois hors body et à bon escient (`RoadmapColumns.tsx:122`, l'ex `bg-[#fafafa]` dénoncé par design.md §3.1 a bien été corrigé).
- **BirdMascot** : gère explicitement le dark (`KK_DARK`, `BirdMascot.tsx:9` + `:23`) — la seule palette en dur qui a pensé au thème.
- **Chips** (`Chip.tsx:12-16`) : 500-sur-50 et 600-sur-100, pile sur les planchers §1.
- **accent/accent-tint dark recalibrés** (`index.css:61-62`) : accent 4,87:1 sur carte, tint opaque — le contrat #108/#269 est tenu au niveau tokens.
- **doc-prose** entièrement tokenisé (`index.css:221-336`), scrollbar Roadmap tokenisée (`:203-209`).

## Trous de design.md (le doc lui-même)

1. Le langage « pill active » (#311) et le langage NavRail/segmented n'y figurent pas — §3.2 prétend un langage universel démenti 3 fois (H3).
2. Aucune doctrine data-viz : que signifie l'accent dans un chart, quelle couleur pour une 2e série, le graphe tout-accent est-il une exception d'identité ? (M2, À-vérifier).
3. Pas de clause « marque tierce » pour les couleurs en dur ni d'exigence de variante dark pour les exceptions (M1, B1).
4. Filet intra-liste neutral-100 non documenté (B3) ; hover 50-vs-100-vs-200 non tranché (M3, B5) ; rôle de neutral-800 absent (B2).
5. La table §1 documente le dark de accent/tint/page/carte/filet/encre mais pas la BASCULE de plancher (500 clair → le dark remappe 500=0.708) — c'est dans index.css:71-72 seulement.

## Recommandations structurantes

1. **Réconcilier design.md avec les décisions réelles** : absorber #311 (pills) et le NavRail dans une table « rôle → rendu actif » (2 langages max), sinon le doc perd son statut de « toute déviation est un bug ».
2. **Poser une doctrine data-viz** (5 lignes suffisent) : accent = une seule sémantique (je recommande « achèvement/flux fermé » puisque 4 composants le font déjà — et alors changer le glyphe in_progress est exclu, donc plutôt l'inverse : accent = en-cours, séries done en neutral-700), série secondaire ≥ neutral-500, axes ≥ 10px neutral-500.
3. **Zéro hex sans variante dark** : convertir GRAPHIFY_BLUE et la rampe température en tokens à deux valeurs — le mécanisme `:root[data-theme=dark]` est déjà là, le coût est nul.
4. **Garde-fou automatisé** : un grep CI (`#[0-9a-f]{3,8}` en contexte string dans src/, `text-neutral-[34]00`/`fill-neutral-400` hors liste blanche décorative). Preuve du besoin : H1, H2, B4 sont dans des vues créées APRÈS l'audit #108 — la règle du plancher régresse déjà.
5. **Trancher les micro-échelles par rôle** : hover (50/100/200), filets (100/200), encre secondaire (800/900) — trois familles où deux valeurs coexistent pour un même rôle ; une ligne de doc chacune et un passage de normalisation.
