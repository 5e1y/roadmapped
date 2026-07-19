# DS Review 4 — Layout, shell, états (vide / chargement / erreur)

Périmètre : 8 vues (Overview, Backlog, Roadmap, Dependencies, Graph/KB, Activity, Docs, Notepad) + NavRail + ViewHeader + panneaux (SidePanel, TaskPanel, SectionPanel, KbNodePanel). Réf : docs/design.md (tri-couche §3.1, gabarit centré §1 Spacing : « mx-auto max-w-3xl px-6 py-8, loading/error states included »).

Verdict d'ensemble : le brief (« chaque écran agencé différemment, aucune structure commune ») est **exagéré**. Le squelette `flex h-full flex-col` + `<ViewHeader/>` + scroller interne est bien partagé par les 8 vues, la tri-couche est respectée partout (zéro `bg-white` sur une racine de vue, zéro hex codé en dur — le `bg-[#fafafa]` de RoadmapColumns pointé par design.md §3.1 est déjà corrigé en `bg-page`, src/components/RoadmapColumns.tsx:122). En revanche, **les états (vide/chargement/erreur) sont le vrai chantier** : ~6 registres visuels d'empty state, 2 langues mélangées, un header qui disparaît pendant le chargement sur 3 vues, et une vue (Overview) muette quand le serveur est injoignable.

---

## SÉVÉRITÉ HAUTE

### H1 — Le ViewHeader disparaît pendant loading/erreur sur Backlog, Roadmap et Dependencies (mais pas ailleurs)
- **Constat** :
  - `Backlog.tsx:54-81` — les 3 early returns (loading, loadError, validation errors) rendent le contenu NU, sans `<ViewHeader/>` (monté seulement ligne 121, après les gardes).
  - `RoadmapView.tsx:51-53` et `DependenciesView.tsx:19-21` — `RoadmapStateGuard` enveloppe TOUT, y compris le `<ViewHeader/>` qui vit dans `children` : pendant loading/erreur, pas de header.
  - À l'inverse : `OverviewView.tsx:142-148` (état `!tree`) et `GraphView.tsx:11-13` (états de KbView rendus SOUS le header du wrapper) **gardent** le header.
- **Conséquence** : au refresh, 3 vues font flasher le chrome (header apparaît après le fetch) ; sur écran d'erreur, la marque × repo, le ThemeToggle et « Report an issue » sont inaccessibles précisément quand on en a besoin. Deux conventions coexistent — design.md dit « the ViewHeader must be identical across all 4 tabs ».
- **Correction** : le header sort de la garde. Un `<ViewShell header={…}>` qui monte toujours ViewHeader et rend les états DANS la zone de contenu ; RoadmapStateGuard (et les gardes inline du Backlog) descendent d'un niveau.

### H2 — OverviewView ignore loadError et errors : écran menteur quand le serveur est injoignable
- **Constat** : `OverviewView.tsx:121` ne consomme que `tree` de `useTree()` ; `OverviewView.tsx:140-148` affiche « Overview — en attente du backlog… » pour TOUT `!tree`, y compris serveur mort ou source invalide. Backlog (`Backlog.tsx:57-64`) et RoadmapStateGuard (`RoadmapView.tsx:16-23`) affichent « Server unreachable » + le détail pour le même état.
- **Conséquence** : Overview attend indéfiniment avec un texte de chargement alors que c'est une erreur. Écran muet au sens du brief — le seul démontré.
- **Correction** : envelopper OverviewView dans RoadmapStateGuard (il existe déjà et fait exactement ça), ou le futur ViewShell.

### H3 — La garde d'état est dupliquée, et a déjà divergé
- **Constat** : `Backlog.tsx:54-81` réimplémente à la main les 3 états de `RoadmapStateGuard` (`RoadmapView.tsx:11-35`). Divergence déjà présente : le Backlog liste les erreurs de validation dans un `<ul>` carte (`Backlog.tsx:74-78`) + texte « Fix the offending files… », la garde dit « details in the Backlog » (`RoadmapView.tsx:30`). C'est voulu (le Backlog est la vue de détail) mais rien ne partage le gabarit titre/message — la prochaine retouche ne sera faite qu'à un endroit.
- **Correction** : un seul `<TreeStateGuard detail={boolean}>` (ou ViewShell), le Backlog passant `detail` pour la liste d'erreurs.

---

## SÉVÉRITÉ MOYENNE

### M1 — Empty states : ~6 registres visuels différents, aucun composant partagé
Recensement complet (aucun écran totalement muet, mais aucun gabarit commun) :
| Écran | Fichier:ligne | Registre |
|---|---|---|
| Backlog liste vide | TaskColumns.tsx:133-137 | boîte **border-dashed** centrée, text-xs |
| Activity vide | ActivityView.tsx:71-77 | **icône (Pulse) + titre font-medium + corps**, centré plein écran — le plus riche |
| Docs sans sélection | DocsView.tsx:126-131 | texte seul centré plein écran |
| Docs arbre vide | DocsView.tsx:115 | `<p>` nu px-4 dans le flanc |
| KB pas générée | KbView.tsx:127-153 | **héro pédagogique** : logo + h1 + `<pre>` + lien, max-w-xl, centré verticalement, aligné gauche |
| KB graphe vide | KbView.tsx:46-55 | h1 + p, **max-w-2xl, aligné haut** |
| Deps/graphe sans tâches | RoadmapGraph.tsx:267-273 | `<p>` px-6 py-8 **sans mx-auto ni max-w** (seul état non centré du produit) |
| Overview aperçu vide | OverviewView.tsx:188 | `<p>` text-xs centré dans la carte |
| Overview tags vide | OverviewView.tsx:216-218 | `<p>` text-xs py-12 dans la carte |
| FlowAreaChart vide | FlowAreaChart.tsx:60 | flex centré **min-h-[200px]** |
| KbNodePanel sans tickets | KbNodePanel.tsx:72 | `<p>` text-xs |
| KbGraph aucun match | KbGraph.tsx:332-336 | **pill flottante** coin haut-gauche (registre à part, mais justifié : le canvas reste visible) |
- **Constat** : registre (dashed / icône+titre+corps / p nu / héro), taille de texte (xs vs sm), alignement (centré vertical vs haut vs gauche) et largeur (xl / 2xl / 3xl / aucune) varient sans logique par type de contenu.
- **Correction** : un `<EmptyState icon? title? hint? action?>` avec 2 variantes (pleine zone / in-card), calé sur le registre d'ActivityView (le plus abouti). Le héro KB reste un cas à part assumé (onboarding), mais construit sur la même primitive.

### M2 — Bilinguisme FR/EN incohérent dans les états, parfois dans la même phrase
- **Constat** :
  - Loading : « Loading… » EN (Backlog.tsx:55, RoadmapView.tsx:14) vs « Chargement… » FR (KbView.tsx:31, DocsView.tsx:108 et 136).
  - Empty : « Nothing open » EN (TaskColumns.tsx:135), « Nothing to display » EN (RoadmapGraph.tsx:270) vs « Aucune activité pour cette session » FR (ActivityView.tsx:73), « Aucun ticket à afficher. » FR (OverviewView.tsx:188), « Sélectionne un document » FR (DocsView.tsx:129).
  - Mixte dans une phrase : « Node not found (le graphe a peut-être changé). » (KbNodePanel.tsx:31). Erreurs : « Server unreachable » EN vs « graph.json illisible » FR (KbView.tsx:37), « Impossible de charger ce document. » FR (DocsView.tsx:142). Panneaux : « Task not found (reload). » EN (TaskPanel.tsx:381), « Section not found. » EN (SectionPanel.tsx:163).
- **Correction** : trancher UNE langue produit (le chrome — « + task », « Search… », « New note » — est en anglais : l'anglais s'impose) et passer tous les états dessus. Un EmptyState/copie centralisée rend la dérive impossible.

### M3 — Gabarit « contenu centré » violé par les états KB, et py-6 orphelin sur Overview
- **Constat** : design.md §1 Spacing fixe `mx-auto max-w-3xl px-6 py-8` « loading/error states included ». Conformes : Backlog.tsx:55/59/67, RoadmapView.tsx:14/18/26, DocsView.tsx:136/154. Déviants : KbView.tsx:31 (loading `max-w-2xl`), KbView.tsx:36 et 48 (erreur/vide `max-w-2xl`), KbView.tsx:129 (`max-w-xl`), RoadmapGraph.tsx:269 (aucun max-w/mx-auto). Overview : `max-w-6xl px-6 py-6` (OverviewView.tsx:172) — le 6xl se défend (grille de cartes ≠ colonne de lecture) mais **py-6** dévie du py-8 canonique sans raison.
- **Correction** : états KB → max-w-3xl ; RoadmapGraph → gabarit centré ; Overview → py-8 (ou documenter un 2e gabarit « grille large » dans design.md).

### M4 — Erreurs : 3 patterns pour le même besoin, ErrorBanner sous-employé
- **Constat** :
  - Pattern A (garde) : h1 « Server unreachable » + `<p>` mono (RoadmapView.tsx:17-22, Backlog.tsx:58-63).
  - Pattern B (canonique DS) : `ErrorBanner` role=alert — utilisé par KbView.tsx:39 et DocsView.tsx:112 (arbre).
  - Pattern C (ad hoc) : DocsView.tsx:139-146, erreur de doc = 2 `<p>` centrés SANS ErrorBanner — dans le même fichier qui l'utilise 30 lignes plus haut.
  - Notepad : **tout est avalé** — `fetchNotes` catch → `[]` (NotepadView.tsx:26), `createNote` catch → rien (96), `save` catch → status idle (77). Serveur mort = liste vide silencieuse, aucun « Server unreachable » alors que les 3 vues tree l'affichent.
  - TaskPanel.tsx:381 : `!tree || !task` → « Task not found (reload) » — pendant que le tree CHARGE, le panneau affiche « not found » (mauvais message pour un état transitoire).
- **Correction** : ErrorBanner partout où une erreur s'affiche dans un flux de contenu ; le gabarit h1+p réservé aux erreurs plein-écran (et extrait) ; Notepad doit au minimum flasher l'échec de save (le flash pied de page existe déjà : NotepadView.tsx:131) ; TaskPanel : distinguer `!tree` (loading) de `!task` (not found).

---

## SÉVÉRITÉ BASSE

### B1 — Scroll : propriété du scroll incohérente entre vues et états
- **Constat** : `App.tsx:192` — `<main>` est `overflow-y-auto`, MAIS chaque vue saine pose son propre scroller interne (Backlog.tsx:174, OverviewView.tsx:171, ActivityView.tsx:69, DocsView.tsx:107+121, RoadmapColumns.tsx:229). Le scroll de `<main>` ne sert que les écrans d'état (qui n'ont pas de wrapper h-full) → deux propriétaires selon l'état de la vue. En plus : RoadmapView.tsx:54 et DependenciesView.tsx:22 posent un `overflow-auto` intermédiaire REDONDANT au-dessus de composants qui gèrent déjà leur overflow (RoadmapColumns.tsx:229 `overflow-x-auto` ; RoadmapGraph = canvas pan/zoom overflow-hidden) — trois niveaux scrollables imbriqués. `overscroll-contain` : présent uniquement sur Activity (ActivityView.tsx:69), absent de tous les autres scrollers.
- **Correction** : `<main>` en `overflow-hidden`, le scroll appartient TOUJOURS à la vue (le ViewShell le fournit) ; supprimer les wrappers overflow-auto de RoadmapView/DependenciesView ; overscroll-contain systématique sur le scroller de vue.

### B2 — Subheaders (la bande sous le header) : 3 traitements
- **Constat** : chips de filtres Backlog — `border-b bg-white`, contenu `mx-auto max-w-3xl px-6 py-2` (Backlog.tsx:147-148) ; toolbar KB — `bg-white px-4 py-1.5` pleine largeur (KbView.tsx:66) ; EpicBand — `px-6 py-1.5` **sans bg-white** (pose sur la page, EpicBand.tsx:147) ; bandeau warning Notepad — `bg-neutral-50 px-4 py-1.5` (NotepadView.tsx:228). Quatre paddings/fonds pour « une rangée d'outils sous le header ».
- **Correction** : décider si un subheader est une surface carte (bg-white + border-b) ou page, et unifier px (4 vs 6) — candidat `<ViewSubbar>`.

### B3 — Responsive : aucun point de rupture hors Overview, flancs figés
- **Constat** : seuls `lg:` d'Overview existent (OverviewView.tsx:173/202/210 — grep : aucun autre `sm:/md:/lg:` dans components/). Flancs figés `w-[420px]` (DocsView.tsx:105, NotepadView.tsx:235 — conformes au gabarit design.md, cohérents entre eux) + SidePanel `w-[380px]` (SidePanel.tsx:99) + rail 64px (NavRail.tsx:81) : en mode double panneau (App.tsx:99-109, 2×380) sur un 1280px, la vue garde ~456px ; Docs avec panneau ouvert : ~416px de prose. Rien ne casse (min-w-0 + truncate tiennent) mais rien ne s'adapte non plus. `h-[440px]` du graphe de tags (OverviewView.tsx:212) : figé mais documenté (KbGraph ne s'auto-dimensionne pas). La toolbar KB est la seule à `flex-wrap` (KbView.tsx:66) ; le cluster droit du ViewHeader (`shrink-0`, ViewHeader.tsx:46) ne wrap ni ne rétrécit — avec recherche w-56 + « + task » du Backlog, le titre tronque en premier, acceptable.
- **Correction** : pas d'urgence (app desktop) ; si on traite : panneau en overlay sous ~1100px, flanc Docs/Notes repliable.

### B4 — Loading : texte nu partout (cohérent), mais aucun état pour Notepad
- **Constat** : aucune vue n'a de skeleton — c'est UN registre (texte discret), tenable. Mais Notepad boot en silence (NotepadView.tsx:102-111) : liste vide + zone morte pendant le fetch initial, puis saut de layout quand la note s'ouvre. Et le « Loading… » vs « Chargement… » (cf. M2).
- **Correction** : même ligne « Loading… » centrée gabarit 3xl pendant le boot du Notepad.

---

## DÉJÀ COHÉRENT (à préserver)
- **RoadmapStateGuard partagé** Roadmap ↔ Dependencies (RoadmapView.tsx:11-35) — la bonne idée, à généraliser, pas à multiplier.
- **Tri-couche** : aucune racine de vue ne redéclare un fond ; `bg-page` utilisé pour le sticky de RoadmapColumns (122) conformément au fix demandé par design.md §3.1 ; cartes bg-white + filets neutral-200 partout (Card d'Overview:41, flancs Docs:105/Notepad:235, NavRail:81, SidePanel:99).
- **h-12 partagé** header de vue (ViewHeader.tsx:24) = header de panneau (SidePanel.tsx:101) — alignement parfait.
- **Squelette de vue** identique de fait dans les 8 vues (`flex h-full flex-col` + ViewHeader + `min-h-0 flex-1`) — il ne manque que son extraction.
- **Flancs 420px** Docs/Notepad identiques au gabarit design.md (py-2, rows px-4).
- **Langage sélection** (accent-tint + inset 2px) uniforme jusque dans les états : notes (NotepadView.tsx:249), cartes roadmap (RoadmapColumns.tsx:43), EpicCard (EpicBand.tsx:96).

## RECOMMANDATIONS (3-5)
1. **Extraire `<ViewShell>`** : monte ViewHeader (toujours, y compris pendant loading/erreur — corrige H1), fournit le scroller unique (`overflow-y-auto overscroll-contain`, corrige B1) et accepte `state` (loading/error/empty) rendu dans le gabarit centré canonique. Les 8 vues deviennent `<ViewShell header controls>…</ViewShell>`.
2. **Généraliser la garde** : RoadmapStateGuard devient `TreeStateGuard` unique (option `detail` pour la liste d'erreurs du Backlog) et enveloppe AUSSI Overview (corrige H2, H3) — sous le header, pas au-dessus.
3. **Créer `<EmptyState>`** (icône?, titre, corps, action?) sur le modèle ActivityView, avec variante in-card pour Overview — et l'utiliser dans les 12 emplacements recensés (M1).
4. **Trancher la langue des états** (anglais, comme le chrome) et passer M2 d'un coup — trivial une fois EmptyState/ErrorBanner centralisés.
5. **Amender design.md** : ajouter le 2e gabarit « grille large » (max-w-6xl py-8) pour Overview, et une section « États » qui fixe le registre (texte loading, EmptyState, ErrorBanner vs plein-écran) — aujourd'hui design.md ne dit rien des états vides, d'où la dérive.
