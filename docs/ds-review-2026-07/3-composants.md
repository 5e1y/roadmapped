# DS Review — Dimension 3 : Composants & primitives réutilisables

Périmètre : toute l'app (`src/components/`, `src/App.tsx`). Référence : `docs/design.md`.
Méthode : chaque finding est démontré fichier:ligne, avec les emplacements qui divergent entre eux.
Verdict global : le socle `ui.tsx` (champs/combobox/boutons de panneau) est réellement partagé et bon ;
la réinvention vit **au-dessus** — pills actives, mini-lignes de tâche, barres de zoom, chips ad hoc,
boutons de header — codés à la main N fois avec des dialectes qui divergent.

---

## ✅ Primitives déjà bien partagées (à créditer avant d'accuser)

- `src/components/ui.tsx` — vrai mini-kit, source unique effective : `fieldCls`, `ghostCls`,
  `primaryBtn`/`actionBtn` (utilisés par TaskPanel.tsx:328,332,571,576,596,850 et
  SectionPanel.tsx:128,131), `Select` (3 peaux), `AddCombobox`, `TagsCombobox`, `EpicCombobox`,
  `MultiCombobox`, `ErrorBanner`, `ToastViewport`, `SavedTick`, `FieldError`, `GhostInput`,
  `AutoTextArea`/`GhostAutoTextArea`, `blurOnEnter`. Base UI partout dans les panneaux — conforme design.md §2.
- `Chip` (Chip.tsx) — consommé par RoadmapGraph.tsx:496, RoadmapColumns.tsx:142, TaskPanel.tsx:531.
- `FilterMenu` (ViewHeader.tsx:84-179) — réutilisé tel quel par KbView.tsx (2×) : le dropdown de filtre est bien UNE primitive.
- `ViewHeader` (ViewHeader.tsx:16) — le header h-12 est unique et partagé par les vues.
- `SidePanel` (SidePanel.tsx:94-127) — coquille unique des panneaux.
- `TempBadge`/`ThermoGlyph` (Temperature.tsx) — usage cohérent : RoadmapColumns.tsx:82, TaskRow.tsx:145, OverviewView.tsx:152.
- `KindGlyph`/`EpicGlyph` (glyphs.tsx) — le glyphe de statut n'est jamais recopié.
- Réutilisation transverse exemplaire : le visualiseur `KbGraph` sert le graphe des tags de l'Overview (OverviewView.tsx:214) au lieu d'un second moteur.

---

## 🔴 CRITIQUE

### C1 — La « pill active » (bord accent + tint) : ≥ 6 implémentations à la main, 2 dialectes divergents
Le langage « actif » des contrôles-pills est recodé inline partout, jamais extrait, et il a déjà **forké** :

**Dialecte A** (inactif `border-neutral-300` + `hover:bg-neutral-100`, actif SANS `font-medium`) :
- ViewHeader.tsx:105-109 (trigger FilterMenu) — `border-accent bg-accent-tint text-neutral-900` / `border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100`
- KbDisplayMenu.tsx:74-77 (trigger Display) — copie exacte de A
- KbView.tsx:91-100 (toggle `inferred`) — copie exacte de A

**Dialecte B** (inactif `border-neutral-200` + `hover:border-neutral-400` — hover par le BORD, pas le fond —, actif AVEC `font-medium`, count/icône `text-accent`) :
- TagGraph.tsx:103-113 — `border-accent bg-accent-tint font-medium text-neutral-900` / `border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-900`, count `text-accent` quand actif
- TypesRadar.tsx:85-95 — même string que TagGraph mais `text-[11px]` au lieu de `text-xs`

**Électron libre** : OverviewView.tsx:88-92 (Segmented) — actif `bg-accent-tint font-medium` SANS bord accent (aucun des deux dialectes).

Le commentaire de ViewHeader.tsx:100-102 revendique lui-même l'unité (« langage “actif” DS des pills bordées (cf. bouton inferred du KB, TagGraph/TypesRadar) ») — or TagGraph/TypesRadar ne rendent PAS la même chose (font-medium, bord 200, hover bord). L'unité est déclarée en commentaire, pas dans le code.
**Correction** : extraire `TogglePill` dans ui.tsx (props : `active`, `size: xs|11`, icône/count optionnels) et migrer les 6 sites ; trancher UN hover (fond ou bord) et UNE graisse d'actif dans design.md §2.

### C2 — Barre de zoom copiée ligne à ligne entre les deux graphes
- KbGraph.tsx:316-325 et RoadmapGraph.tsx:343-352 : le bloc `− / Fit / 100 % / +` est un copier-coller
  intégral (mêmes 4 boutons, mêmes classes `rounded-md border border-neutral-300 bg-white shadow-sm`,
  mêmes `border-l`, mêmes aria-labels). Seule différence : KbGraph ajoute `markInteracted()`.
  C'est LE cas d'école « widget réinventé au lieu d'un composant » : la prochaine retouche (taille cible,
  focus, disabled) devra être faite deux fois et sera oubliée une fois.
**Correction** : `ZoomControls({ zp, onInteract?, fit })` partagé (les deux consomment déjà le même hook `zp`).

### C3 — La « mini-ligne de tâche » (glyphe + #id + titre barré + méta droite) : 5 réimplémentations
Même contrat visuel et fonctionnel — glyphe statut, `#id` en `font-mono text-xs text-neutral-500`,
titre tronqué barré si done, méta ancrée à droite, toute la ligne ouvre le TaskPanel — recodé 5 fois :
- ui.tsx:218-236 (`RelOption`, items des dropdowns) — titre done `text-neutral-500 line-through`, sinon `text-neutral-900`
- TaskPanel.tsx:146-183 (`RelationRow`, deps/liens du panneau) — idem mais titre `text-neutral-800`, `hover:bg-neutral-100`
- KbNodePanel.tsx:79-90 (tickets d'un nœud KB) — recopie de RelationRow (`text-neutral-800`, `hover:bg-neutral-100`) sans le ✕
- OverviewView.tsx:106-118 (`PreviewRow`) — titre `text-neutral-900`, `hover:bg-neutral-50`, py-2
- ActivityView.tsx:31-58 (`EntryRow`) — variante feed : `#id` idem, titre `text-neutral-600`, `hover:bg-neutral-100`
Divergences concrètes : encre du titre 600/800/900 selon l'écran, hover 50 vs 100 (cf. C4), paddings py-1/py-2/py-2.5.
**Correction** : `TaskMiniRow({ task, meta?, onOpen?, removable? })` dans ui.tsx ; RelOption, RelationRow,
KbNodePanel et PreviewRow en deviennent des appels ; EntryRow peut rester spécifique mais hérite des tokens.

---

## 🟠 MAJEUR

### M1 — Deux gris de hover pour le MÊME contrat « ligne cliquable »
design.md §3.2 dit « le gris `bg-neutral-100` est réservé au hover » mais le code utilise DEUX gris :
- Camp `hover:bg-neutral-50` : TaskRow.tsx:73, TaskColumns.tsx:77 (+ « Show more » :157,166), EpicRow.tsx:235, OverviewView.tsx:111 (PreviewRow), NotepadView.tsx:249 (liste des notes)
- Camp `hover:bg-neutral-100` : ActivityView.tsx:54, DocsTree.tsx:51 et :80, KbNodePanel.tsx:82, TaskPanel.tsx:164 et :251, NotepadView.tsx:239 (« New note » — les DEUX camps dans le même fichier)
Démonstration la plus nette : les deux flancs jumeaux `w-[420px] ... bg-white py-2` — DocsView.tsx:105 (lignes DocsTree en hover **100**) vs NotepadView.tsx:235 (lignes de notes en hover **50**). Deux écrans au layout identique, deux hovers différents.
**Correction** : trancher UN gris de hover de ligne dans design.md (ou une règle surface→gris explicite) et le porter par la primitive de ligne (C3), pas par 12 strings.

### M2 — Chips ad hoc hors `Chip.tsx` + variantes manquantes
`Chip` ne couvre que label/mono/strong → chaque besoin nouveau se recode à côté :
- Backlog.tsx:22-35 (`RemovableChip`, filtres actifs) — pill **rounded-md** ; design.md §1 : les chips sont CARRÉES (rounded-md = contrôles h-12 du header uniquement). Composant local, non partagé, avec son propre ✕.
- KbView.tsx:109 (badge « peut-être obsolète ») — chip accent **rounded** fabriquée inline (`rounded border border-accent bg-accent-tint px-1.5 py-0.5`) : ni Chip, ni carrée.
- ui.tsx:585-595 (chip de `MultiCombobox`) — `bg-neutral-100 px-1.5 py-0.5 text-xs` SANS bordure, vs ui.tsx:413-423 (chip de `TagsCombobox`) — texte nu `#tag` sans fond ni bordure. Deux rendus de « chip supprimable » dans le même fichier kit.
**Correction** : étendre `Chip` (variantes `removable`, `accent`, éventuellement `count`) et migrer RemovableChip + badge stale ; harmoniser (ou documenter) la chip MultiCombobox.

### M3 — Bouton primaire : 3 codages à la main qui divergent
- ui.tsx:34-35 (`primaryBtn`, canonique) — `rounded ... px-2.5 py-1 text-xs ... disabled:bg-neutral-300`
- Backlog.tsx:132-138 (« + task » du header) — string recopiée en `rounded-md`, sans état disabled. design.md §2 prévoit la variante header (« same colors in rounded-md ») mais aucune constante ne l'incarne → copie inline.
- UpdateNotice.tsx:145 (« Update now ») — 3e dialecte : `font-medium`, `py-1.5`, `disabled:cursor-not-allowed disabled:opacity-70` (vs `disabled:bg-neutral-300` du canon).
**Correction** : exporter `headerPrimaryBtn` (ou `btnPrimary({ size: 'panel'|'header' })`) depuis ui.tsx ; UpdateNotice s'aligne sur le canon disabled.

### M4 — Bouton icône-seule : copies non extraites, 2 divergences
- ViewHeader.tsx:52-61 (lien Bug) ↔ ThemeToggle.tsx:18-28 : classe identique
  (`rounded-md border border-neutral-300 bg-white px-2 py-1 text-neutral-600 ... hover:bg-neutral-100`)
  ET le hack d'alignement `my-0.5` dupliqué sur l'icône (ThemeToggle.tsx:25-27 documente le hack, ViewHeader.tsx:60 le recopie sans le commentaire). Le commentaire ViewHeader.tsx:51 assume : « même idiome que le toggle » — l'idiome est un copier-coller.
- UpdateNotice.tsx:47 (bouton Copy) — cousin en `rounded` (4px) + `text-[11px] text-neutral-700` : 3e rendu d'icône-bouton bordé.
- ✕/icônes nus des panneaux : SidePanel.tsx:108 et :119 (`rounded p-1 ... hover:bg-neutral-100`) vs le ✕ hover-reveal (M5) en `hover:bg-neutral-200` — deux fonds de hover pour le même geste p-1.
**Correction** : `IconButton({ variant: 'header'|'inline', ... })` dans ui.tsx ; le hack `my-0.5` vit une seule fois.

### M5 — Le « ✕ révélé au survol » : 4 copies, 1 divergente, la bonne primitive existe mais n'est pas exportée
- TaskPanel.tsx:132-144 (`RemoveButton`) — LE composant propre… local au fichier.
- ui.tsx:549-557 (✕ d'EpicCombobox) — même string inline recopiée.
- RoadmapColumns.tsx:133-140 — même string inline recopiée.
- NotepadView.tsx:260-268 — divergent : pas de `rounded p-1`, pas de `hover:bg-neutral-200` (juste `hover:text-neutral-700`) — cible plus petite, rendu différent pour le même geste « supprimer l'élément de la ligne ».
**Correction** : exporter `RemoveButton` (HoverRemove) depuis ui.tsx, remplacer les 3 copies.

---

## 🟡 MOYEN

### m1 — Input de recherche de header : 2 rendus
- Backlog.tsx:122-131 — icône Search, `text-neutral-900`, `placeholder:text-neutral-500`, `focus:border-neutral-900`
- KbView.tsx:66-74 — SANS icône, `text-neutral-800`, `placeholder:text-neutral-400` (sous le plancher neutral-500 de design.md §1 pour du texte porteur de sens — le placeholder Backlog est à 500), `focus:border-neutral-400` (focus quasi invisible vs border-900 du Backlog et du `fieldCls`).
**Correction** : `HeaderSearchInput` unique (icône incluse), focus aligné sur le canon border-900.

### m2 — Radii hors vocabulaire : la règle « deux radii » n'est pas tenue par les surfaces flottantes
design.md §1 : surfaces/popups/chips = carrés ; `rounded-md` réservé aux contrôles h-12 et cartes flottantes de graphe.
- OverviewView.tsx:41 (Card) — **`rounded-lg`** : radius qui n'existe pas dans le vocabulaire DS, sur une surface censée être carrée (les surfaces homologues sont carrées : TaskColumns.tsx:151 et :183, Backlog.tsx:74, EpicBand.tsx:95).
- ViewHeader.tsx:116 (popup FilterMenu) et KbDisplayMenu.tsx:83 — popups **`rounded-md`**, alors que tous les popups du kit sont carrés (ui.tsx:278, :335, :432, :519, :606) et le popup UpdateNotice.tsx:106 aussi.
- Deux registres d'élévation de popup coexistent : `shadow-sm` sans animation (FilterMenu, Select/Combobox) vs `shadow-lg` + scale/opacity animés (UpdateNotice.tsx:106, Toast ui.tsx:166).
**Correction** : trancher (probablement : popups carrés `shadow-sm`, un seul registre animé documenté) ; Card → carrée ou amender design.md.

### m3 — `Card` de l'Overview : primitive locale non partagée
OverviewView.tsx:39-48 — la seule « Card » de l'app est une fonction privée du fichier (coquille tri-couche + titre). Tant qu'un seul écran en a besoin, YAGNI défendable — mais elle est déjà en délit de radius (m2) précisément parce qu'aucune primitive de surface ne l'encadre. À extraire au premier second usage.

### m4 — Ghost fait-main dans TaskPanel
TaskPanel.tsx:713-729 (zone détail markdown, `role="button"`) — `cursor-text border border-transparent px-1.5 py-1 transition-colors hover:bg-neutral-100` : recopie partielle de `ghostCls` (ui.tsx:25-26) sans `rounded` ni le contrat focus (`focus:border-neutral-300 focus:bg-white`) — l'élément repose sur le `:focus-visible` global seul, rendu différent des autres ghosts au focus. Devrait composer `ghostCls`.

### m5 — Segmented : une seule implémentation… locale
OverviewView.tsx:78-97 — le seul segmented control de l'app est privé au fichier. Pas un doublon aujourd'hui (l'ex-toggle Columns/Graph n'existe plus dans le code actuel — vérifié : aucun autre `role="group"` segmenté), mais son style actif ne matche aucun des deux dialectes de pill (C1) : 3e langage d'« actif » pour un contrôle de sélection. À extraire avec/comme `TogglePill`.

---

## ⚪ MINEUR

- **NavRail actif sans filet** : NavRail.tsx:66 — `bg-accent-tint text-accent` sans le `shadow-[inset_2px_0...]` du langage sélection universel (§3.2) que suivent TaskRow.tsx:73, DocsTree.tsx:80, NotepadView.tsx:249, RoadmapColumns.tsx:43, EpicBand.tsx:96. Probablement délibéré (rail d'icônes) — **à vérifier**/documenter dans design.md.
- **EpicCard active garde `border-neutral-200`** (EpicBand.tsx:95-97) là où les autres états actifs bordés passent `border-accent` (C1) — mélange des deux langages (pill vs ligne sélectionnée) sur un même élément.
- **Commentaire mensonger dans le kit** : ui.tsx:168-170 dit le Toast « aligné sur le popup Activity (…, rounded-md) » — la classe réelle (ui.tsx:166) n'a AUCUN rounded. Le code a raison (popups carrés), le commentaire propage un faux canon.
- **Timestamp Activity sous le plancher** : ActivityView.tsx:46 — `text-neutral-400` sur l'heure (porteuse de sens) ; plancher §1 = neutral-500 (dimension a11y, signalé car la primitive EntryRow le fige).
- **« Clear all » du Backlog** (Backlog.tsx:160-166) et « Clear filter » du FilterMenu (ViewHeader.tsx:166-172) : même action, deux rendus (pill rounded-md autonome vs ligne de pied de popup) — acceptable vu les contextes, à unifier si un 3e apparaît.

---

## Recommandations prioritaires

1. **`TogglePill`** dans ui.tsx (active/size/icon/count) — absorbe FilterMenu trigger, KbDisplayMenu, KbView inferred, TagGraph, TypesRadar, Segmented : 6 sites, 3 dialectes → 1. Le plus gros rendement de tout l'audit.
2. **`TaskMiniRow` + trancher LE gris de hover de ligne** (design.md) — absorbe RelOption/RelationRow/KbNodePanel/PreviewRow et ferme la fracture 50/100 (C3+M1) d'un coup.
3. **Exporter ce qui existe déjà en local** : `RemoveButton` (TaskPanel → ui.tsx), `headerPrimaryBtn`, `IconButton` header (le duo Bug/ThemeToggle) — trois extractions à coût quasi nul qui suppriment 8 copies.
4. **`ZoomControls`** partagé KbGraph/RoadmapGraph — copie ligne à ligne démontrée, extraction mécanique.
5. **Police des radii** : Card Overview `rounded-lg` → carré, popups FilterMenu/KbDisplayMenu `rounded-md` → carrés, `RemovableChip` → variante `Chip removable` carrée ; puis un grep CI `rounded-lg|rounded-xl` pour tenir la règle « deux radii ».
