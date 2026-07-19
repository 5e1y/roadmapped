# DS Review 6 — Iconographie & langage visuel (glyphs, graphes, charts, radar)

Périmètre : toute l'app (`src/components/`). Réf : `docs/design.md`.
Méthode : chaque constat vérifié dans le source (fichier:ligne). Doute explicite = « à vérifier ».
Fait structurant : **design.md ne contient AUCUNE section iconographie/data-viz** — tokens, radii, spacing, composants oui ; tailles d'icônes, poids de trait SVG, grammaire des pointillés : rien. La dérive ci-dessous n'a donc aucun référentiel à violer… ni à respecter.

---

## SÉVÉRITÉ ÉLEVÉE

### E1 — TagGraph.tsx : visualiseur mort, second langage visuel en dette
- **Fichiers** : `src/components/TagGraph.tsx:12` (export `TagGraph`), `src/lib/tagGraph.ts`, `src/lib/tagGraph.test.ts`
- **Constat** : `grep` sur tout `src/` — le composant `TagGraph` n'est **importé nulle part** (seules mentions : commentaires dans `KbGraph.tsx:512`, `ViewHeader.tsx:101`, `lib/tagKbGraph.ts:9`, et sa propre lib + tests). Depuis #375, l'Overview rend le graphe de tags via `KbGraph` + adaptateur `tagKbGraph` (`OverviewView.tsx:9,213`). TagGraph portait un langage DIFFÉRENT du visualiseur retenu : arêtes en **accent** (`TagGraph.tsx:56` `stroke="var(--color-accent)"`) là où KbGraph les fait neutres (`KbGraph.tsx:437` neutral-500), labels `text-xs` (`TagGraph.tsx:103`) vs `text-[11px]` du radar (`TypesRadar.tsx:85`).
- **Correction** : supprimer `TagGraph.tsx` + `lib/tagGraph.ts` + `tagGraph.test.ts` (le chemin vivant est `tagKbGraph`). Dette visuelle ET risque de résurrection d'un langage divergent.

### E2 — Grammaire du pointillé CONTRADICTOIRE entre les deux graphes
- **Fichiers** : `KbGraph.tsx:441-442, 464-465` vs `RoadmapGraph.tsx:398-399`
- **Constat** : même motif `strokeDasharray="3 3"`, deux sens opposés.
  - KbGraph : plein = arête EXTRACTED, pointillé = INFERRED/AMBIGUOUS (sémantique de provenance, doc en tête de fichier `KbGraph.tsx:15-16`).
  - RoadmapGraph : le pointillé est l'état **par défaut ET dim** de toute arête de dépendance ; le plein est réservé au chemin survolé (`strokeDasharray={tone === 'strong' ? undefined : '3 3'}`).
  Un utilisateur qui apprend « pointillé = incertain » sur le Graph lit ensuite TOUTES les dépendances de la vue Deps comme incertaines — alors qu'elles sont des liens durs.
- **Correction** : réserver le pointillé à UNE sémantique (l'incertain/inféré). RoadmapGraph : arêtes par défaut pleines à opacité réduite (le langage dim/strong par la couleur neutral-200/500/900 existe déjà et suffit).

### E3 — Poids de trait « emphase » : 3 valeurs pour le même rôle, non-scaling-stroke à moitié appliqué
- **Fichiers** : `TypesRadar.tsx:60` (polygone accent `strokeWidth={2}`), `FlowAreaChart.tsx:117-118` (crêtes `1.5`), `KbGraph.tsx:376,467` (focus `1.5`), `KbGraph.tsx:567` (nœud `1.5`), `RoadmapGraph.tsx:398` (chemin fort `1.25`)
- **Constat** : le « trait de donnée mis en avant » vaut 2 au radar, 1.5 au chart et au KB, **1.25** au roadmap. Aucune valeur documentée. En plus :
  - `vectorEffect="non-scaling-stroke"` est systématique dans TypesRadar (`:54,58,60`) et KbGraph (`:441,464,556,568`)…
  - …mais **absent de RoadmapGraph** (`:393-401`, aucun vectorEffect) qui EST zoomable (`useZoomPan`, `:308`) : dézoomé, ses arêtes s'amincissent sous le pixel pendant que celles du KB restent constantes ;
  - …et absent de FlowAreaChart (`:88` `viewBox` + `className="w-full"`) : le trait scale avec la largeur du conteneur — sur la carte `lg:col-span-2` (~1100px pour un viewBox de 720), la crête « 1.5 » rend ~2.3px, plus grasse que le polygone du radar voisin.
- **Correction** : échelle unique (1 = grille/arête de base, 1.5 = donnée/emphase), `non-scaling-stroke` obligatoire sur toute viz zoomable ou responsive. À écrire dans design.md.

---

## SÉVÉRITÉ MOYENNE

### M1 — Deux gris de grille différents sur la MÊME page Overview
- **Fichiers** : `TypesRadar.tsx:54,58` (anneaux + axes `var(--color-neutral-300)`) vs `FlowAreaChart.tsx:105` (repères Y `var(--color-neutral-200)`)
- **Constat** : deux grilles purement décoratives, côte à côte dans la même grille de cartes (`OverviewView.tsx:175,202`), deux encres. design.md:39 autorise 300 ET 200 pour le décoratif mais n'arbitre pas — résultat : le radar a une grille plus sombre que le chart.
- **Correction** : un seul token de grille data-viz (proposition : neutral-200, le même que les filets de règle).

### M2 — Rareté de l'accent : le radar est le seul à peindre ses points en accent PLEIN hors sélection
- **Fichiers** : `TypesRadar.tsx:63` (`fill="var(--color-accent)"`, opacité 1, sur chaque sommet) vs `KbGraph.tsx:513-524` (repos `fillOpacity 0.2`, « Le plein accent est réservé au nœud SÉLECTIONNÉ — même doctrine de rareté »)
- **Constat** : la doctrine écrite dans KbGraph (et qu'appliquait feu TagGraph, `TagGraph.tsx:63-65,74`) est contredite par le radar : 9 pastilles accent pleines en permanence, sélection ou pas. Le polygone, lui, respecte le registre (fill 0.12 / stroke accent — même famille que les pastilles KB).
- **Correction** : sommets du radar en `fillOpacity` ~0.85-0.9 au repos (registre « match » de KbGraph:521), plein réservé au type sélectionné.

### M3 — Les lignes d'aperçu de l'Overview sont les seules lignes-tâche SANS glyphe d'état
- **Fichiers** : `OverviewView.tsx:106-118` (`PreviewRow` : #id + titre + hint, aucun glyphe) vs `TaskRow.tsx:96`, `RoadmapColumns.tsx:57`, `RoadmapGraph.tsx:467,582`, `KbNodePanel.tsx:84`, `ui.tsx:223` (toutes ouvrent sur `KindGlyph`)
- **Constat** : partout ailleurs, une ligne/carte de tâche commence par le glyphe cercle/diamant. L'aperçu « Urgents/Anciens/Récents » casse le gabarit — un ticket in_progress n'y est pas distinguable d'un todo.
- **Correction** : préfixer `PreviewRow` d'un `KindGlyph` (le composant existe, coût nul).

### M4 — Tailles d'icônes : dérive libre, y compris DANS un même cluster
- **Constat** (inventaire exhaustif `grep size={`) : valeurs utilisées 8, 9, 10, 11, 12, 13, 14, 18, 22, 28. Cas démontrés de même-rôle/tailles-différentes :
  - **Même header de panneau** : `SidePanel.tsx:110` ArrowLeft **14** vs `SidePanel.tsx:121` Cross **13** ;
  - **Cross (fermer/retirer)** : 8 (`ui.tsx:420,592`), 9 (`ui.tsx:556`, `TaskPanel.tsx:141`), 10 (`ui.tsx:181`), 13 (`SidePanel.tsx:121`) — 4 tailles pour le même geste ;
  - **Check (validation/option cochée)** : 10 (`ui.tsx:44,287,449,531,617`, `TaskPanel.tsx:839`, `UpdateNotice.tsx:49`), 11 (`ViewHeader.tsx:142`), 12 (`ui.tsx:172`) ;
  - **Chevrons d'affordance** : 9 (`ViewHeader.tsx:112`), 10 (`ui.tsx:273`), 11 (`glyphs.tsx:19`) ;
  - **Pictos d'état vide** : Pulse 22 (`ActivityView.tsx:72`) vs GraphifyMark 28 (`KbView.tsx:131`).
  Les registres 12 (boutons outils : `ThemeToggle.tsx:27`, `KbView.tsx:100`, `KbDisplayMenu.tsx:78`, `ViewHeader.tsx:60`, `RoadmapColumns.tsx:140`) et 18 (rail, `NavRail.tsx:70`) sont, eux, tenus.
- **Correction** : échelle canonique par contexte dans design.md (ex. 10 = micro-action dans chip/option ; 12 = bouton outil ; 14 = header de panneau ; 18 = rail ; 22-24 = état vide) puis normaliser.

### M5 — Deux familles de trait dans le MÊME slot : glyphe maison (1px plein) vs trinil (trait scalé ~0.7px)
- **Fichiers** : `TaskRow.tsx:95-96`, `RoadmapColumns.tsx:56-57`, `RoadmapGraph.tsx:466-467,581-582`, `TaskPanel.tsx:511-512` (ternaire `LockLocked size={11}` ⟷ `KindGlyph`)
- **Constat** : les glyphes maison = viewBox 10, `strokeWidth 1`, rendus à 10px → trait 1px net. Trinil (`node_modules/trinil-react/dist/index.js`) = viewBox 24, `strokeWidth 1.5` **scalant** : à `size={11}`, trait effectif ≈ 0.69px. Le `vectorEffect: "non-scaling-stroke"` que trinil pose est sur l'élément `<svg>` racine, or `vector-effect` n'est **pas hérité** par les `<path>` enfants — il est donc sans effet (**à vérifier au rendu**, mais la spec SVG est claire). Résultat : dans une colonne de lignes, le cadenas « locked » est visiblement plus maigre que le cercle todo qu'il remplace.
- **Correction** : soit un `LockGlyph` maison au gabarit 10/stroke 1 de la famille, soit compenser (`strokeWidth` prop trinil ≈ 2.2 à size 11 pour matcher 1px).

### M6 — glyphs.tsx : mécanisme d'encre mixte (currentColor vs var figée) dans le même composant
- **Fichiers** : `glyphs.tsx:52, 83, 116` (état todo : `stroke="var(--color-neutral-500)"` figé) vs `glyphs.tsx:36, 67, 100` (done/in_progress : `currentColor` piloté par `text-neutral-900`/`text-accent`)
- **Constat** : la classe d'encre posée sur le `<svg>` est ignorée à l'état todo — un consommateur qui re-teinte le glyphe par className verra done/in_progress changer et todo rester gris. Deux mécanismes pour trois états d'un même glyphe.
- **Correction** : tout en `currentColor`, la classe portant `text-neutral-500` à todo (comportement identique, mécanisme unique).

---

## SÉVÉRITÉ MINEURE

### m1 — Attribution et a11y de KbGraph fuient dans le graphe de TAGS
- **Fichiers** : `KbGraph.tsx:338` (`<PoweredByGraphify />` inconditionnel), `KbGraph.tsx:344` (`aria-label="Knowledge graph — …"`), consommé en mode tags par `OverviewView.tsx:213`
- **Constat** : le graphe des tags (données = tags des tickets, pas Graphify) affiche quand même la carte « powered by Graphify » et s'annonce « Knowledge graph » aux lecteurs d'écran. L'override `onNodeClick` (#375) a neutralisé le clic mais pas le chrome.
- **Correction** : prop de mode (ou masquer PoweredBy + adapter l'aria-label quand `onNodeClick` est fourni).

### m2 — Légende : le chart en a une, les graphes non
- **Fichiers** : `FlowAreaChart.tsx:80-87` (légende HTML pastilles neutre/accent) vs `KbGraph.tsx` (aucune légende plein=extracted / pointillé=inferred ; seul indice : le toggle « inferred », `KbView.tsx:91-102`)
- **Constat** : l'encodage le plus sémantique de l'app (provenance des arêtes) n'est expliqué nulle part à l'écran.
- **Correction** : micro-légende au registre de celle du chart (11px, neutral-500) dans le coin du canvas KB.

### m3 — Textes SVG sous le plancher micro-texte du DS
- **Fichiers** : `KbGraph.tsx:482` (`LABEL_FONT = 9`), `FlowAreaChart.tsx:106,128` (`fontSize="9"`, `fill-neutral-400`) vs design.md:41 (« nothing below 10px ») et design.md:36 (neutral-400 non conforme pour du texte informatif)
- **Constat** : nuance — ces tailles sont en unités viewBox : le chart rend ~13px sur carte large (720→~1100px), les labels KB grossissent au zoom. Mais à petite largeur / zoom 100 %, on est sous 10px et en neutral-400 sur les axes. **À vérifier au rendu aux breakpoints étroits.**
- **Correction** : 10-11 unités + neutral-500, ou labels HTML à police fixe (le pattern existait : TypesRadar).

### m4 — Rampe température : le « tiède » est un neutral-400 clair codé en dur
- **Fichier** : `Temperature.tsx:21` (`[163, 163, 163] // tiède — neutral-400`) ; exception monochrome documentée `Temperature.tsx:5-8`
- **Constat** : l'exception couvre la rampe froid→chaud, soit. Mais le stop médian prétend « se fond[re] dans le DS » — vrai en light uniquement : en dark, neutral-400 vaut une autre valeur et le mercure tiède ne se fond plus (design.md:28 : « a hardcoded hex is a dark-mode bug »). **À vérifier visuellement en dark.**
- **Correction** : lire le stop médian depuis `--color-neutral-400` (getComputedStyle ou variable interpolée), garder froid/chaud en dur (exception assumée).

### m5 — Scories et commentaires périmés
- `TypesRadar.tsx:63` : `vectorEffect="non-scaling-stroke"` sur un `<circle>` SANS stroke — attribut mort (copié de la ligne 60).
- `RoadmapColumns.tsx:26` : « done : coche (StatusGlyph) » — StatusGlyph done est un cercle PLEIN (`glyphs.tsx:109`), aucune coche. Commentaire d'une itération disparue.
- `glyphs.tsx:16-18` : workaround inversion ChevronLeft/Right de trinil 1.3.9 — documenté, signalé ; à re-vérifier à chaque bump de trinil (le fix silencieux retournerait tous les chevrons).

### m6 — Le cadre des data-viz déroge à la règle des radii
- **Fichier** : `OverviewView.tsx:41` (`rounded-lg` sur la Card) vs design.md:43-51 (surfaces/cartes = carrées ; `rounded-md` réservé aux contrôles h-12 et cartes flottantes ; `rounded-lg` n'existe pas dans le système)
- **Constat** : les 4 cartes qui encadrent radar/chart/graphe/aperçu sont les seules surfaces arrondies `lg` de l'app — le contenant des viz jure avec le reste (frontière avec la dimension « surfaces », signalé ici car c'est LE cadre du langage data-viz).

### m7 — Vocabulaire d'état : Activity parle une autre langue (assumé ? à trancher)
- **Fichier** : `ActivityView.tsx:21-29` (`finished: Check`, `started: Play`, trinil) vs famille encre (done = cercle plein) partout ailleurs
- **Constat** : « finished » est rendu par une coche, alors que « done » est un cercle plein dans 6 autres surfaces. Défendable (événements ≠ états), mais c'est la seule vue où l'état d'une tâche s'exprime hors famille glyphes — non documenté.
- Accessoirement : légendes/labels FR (`FlowAreaChart.tsx:88` « Créés vs fermés », `TypesRadar.tsx:51` « Charge par type », `KbGraph.tsx:329` « Graphe tronqué… ») vs EN (`RoadmapGraph.tsx:361` « Dependency graph — drag… », `KbGraph.tsx:344`) — mix FR/EN dans les aria/labels des viz.

---

## DÉJÀ UNIFIÉ (à préserver)

- **La famille de glyphes d'état est exemplaire** : cercle (tâche) / diamant (jalon) / carré (epic), même viewBox 10×10, même strokeWidth 1, même langage d'encre trois états (vide / demi-ACCENT gauche / plein) — le demi-rempli est géométriquement le même (moitié GAUCHE) dans les trois formes (`glyphs.tsx:49, 80, 113`). Consommée partout via `KindGlyph`/`EpicGlyph` : Backlog (`TaskRow.tsx:96`), Roadmap colonnes (`RoadmapColumns.tsx:57`) ET graphe (`RoadmapGraph.tsx:467,545,582`), TaskPanel (`:166,512`), KbNodePanel (`:84`), EpicBand (`:101`), options de combobox (`ui.tsx:223`). Zéro divergence trouvée. `pulse-live` sur in_progress systématique.
- **Tags dans KbGraph** (décision #375, `lib/tagKbGraph.ts`) : un seul visualiseur nodal vivant — bonne continuité, il ne manque que l'enterrement de TagGraph (E1).
- **Cluster de zoom identique** au pixel entre les deux graphes (`KbGraph.tsx:316-325` ≡ `RoadmapGraph.tsx:343-352` : − / Fit / 100 % / +).
- **Langage dim/strong partagé** : neutral-200 (atténué) / neutral-500 (base) / neutral-900 (chemin fort) dans les deux graphes (`KbGraph.tsx:437,467` ; `RoadmapGraph.tsx:249`).
- **Tokens partout** : toutes les viz encrent en `var(--color-*)` (dark-ready) ; seules couleurs en dur = bleu de marque Graphify (`KbGraph.tsx:612`, légitime, documenté) et rampe température (exception Rémi documentée, cf. m4).
- **Icônes trinil comme source unique d'icônes génériques** : plus aucun pictogramme bespoke hors glyphes de statut/thermomètre/mascotte — les icônes faites main du rail (1er jet #370) ont bien été remplacées (`NavRail.tsx:6-8`), rail homogène à 18.
- **Mascotte** : un seul lieu dans l'app (tête du NavRail, `NavRail.tsx:85`) + favicon = asset officiel #216 (`index.html:19-20`) ; pas de duplication header (retirée), homepage dans le repo externe. Cohérent. (Concordance d'orientation favicon ↔ sprite « regarde à droite », `BirdMascot.tsx:41-42` : à vérifier visuellement, le PNG n'est pas inspectable ici.)

---

## RECOMMANDATIONS (3-5)

1. **Écrire la section manquante « Iconographie & data-viz » de design.md** — c'est la cause racine : échelle de tailles d'icônes par contexte (10/12/14/18/22), échelle de traits SVG (1 grille neutral-200, 1.5 donnée, non-scaling-stroke obligatoire sur viz zoomable/responsive), grammaire du pointillé (= incertain/inféré, rien d'autre), doctrine accent (plein = sélection uniquement, y compris au radar).
2. **Supprimer TagGraph** (`TagGraph.tsx` + `lib/tagGraph.ts` + test) — dette morte porteuse d'un langage divergent.
3. **Réconcilier les deux graphes** : arêtes roadmap pleines par défaut (le pointillé rendu à l'inféré du KB), chemin fort 1.25→1.5, `vectorEffect` sur les arêtes roadmap, mode « tags » de KbGraph sans chrome Graphify.
4. **Normaliser les glyphes vs trinil dans le slot de statut** : LockGlyph au gabarit maison (ou strokeWidth compensé), et glyphs.tsx tout-currentColor.
5. **Petites mises au niveau Overview** : KindGlyph dans PreviewRow, grille radar 300→200 (alignée sur le chart), pastilles radar hors sélection dé-saturées, Card `rounded-lg`→registre DS.
