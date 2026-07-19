# DS Review 2 — Typographie & espacement

Périmètre : tous les écrans (Backlog, Overview, Roadmap, Dependencies, Graph, Activity, Docs, Notepad), rail, header, panneaux. Réf : `docs/design.md` (§1 Micro-labels, §1 Spacing templates). Tous les chemins sont relatifs à `/Users/rcourtillon/Documents/Roadmapped/`.

Verdict d'ensemble : la DA est **loin d'être un bordel** — les registres structurants (h-12 partagé, titres de panneau, #id mono, labels de champ 11px medium) sont tenus. Mais la couche « méta » (11 vs 12px), le rythme vertical des lignes de liste et les cartes dupliquées Roadmap/Dependencies ont dérivé, souvent en contradiction avec un commentaire de code qui revendique la cohérence.

---

## SÉVÉRITÉ HAUTE

### H1 — `text-[10px]` du NavRail viole la règle micro-texte du DS
- **`src/components/NavRail.tsx:58`** : labels du rail en `text-[10px] font-medium`.
- **Constat** : `docs/design.md:41` dit explicitement « Micro-text: nothing below 10px; **existing 10px to be bumped to 11px** (audit §3) ». Le rail (composant récent, #370) a réintroduit du 10px. C'est le seul 10px HTML de l'app.
- **Correction** : `text-[11px]` (le niveau méta canonique), le rail de 64px l'absorbe (« Overview » à 11px medium ≈ 52px).

### H2 — Le rythme vertical des lignes de liste : 4 paddings pour le même rôle, hauteurs désalignées dans une même liste
- **`src/components/TaskRow.tsx:92`** : ligne tâche `py-2.5` (≈40px de haut).
- **`src/components/EpicRow.tsx:235`** et **`src/components/TaskColumns.tsx:77`** : lignes groupe (epic, release) `py-[5px]` — valeur arbitraire hors échelle Tailwind (py-1=4, py-1.5=6). La ligne release (texte nu, ≈30px) et la ligne epic (input ghost dedans, ≈36px) sont **frères directs des TaskRow (≈40px) dans la même liste bordée** du Backlog → trois hauteurs de rangée dans un seul bloc `divide-y`. (Hauteurs calculées, à vérifier au pixel ; l'écart de classes, lui, est factuel.)
- **`src/components/OverviewView.tsx:111`** : PreviewRow — même contrat que TaskRow (ouvre le TaskPanel, même anatomie #id+titre+méta) — `py-2` au lieu de `py-2.5`.
- **`src/components/NotepadView.tsx:248`** / **`src/components/DocsTree.tsx:51,77`** : lignes de flanc `py-1.5`.
- **Constat** : aucune règle ne dit quelle densité va où ; le `py-[5px]` d'EpicRow semble compenser le `py-0.5` de l'input ghost interne, puis a été copié tel quel sur ReleaseSection qui n'a pas d'input — la compensation devient une erreur.
- **Correction** : 2 densités nommées — `row` (py-2.5, listes principales) et `row-compact` (py-1.5, flancs) — et pour les lignes-groupe, viser la MÊME hauteur totale que `row` (padding calculé une fois, documenté, ou hauteur fixe `h-10`).

### H3 — La « même » carte de tâche diverge entre Roadmap et Dependencies
- **`src/components/RoadmapColumns.tsx:52`** : TaskCard `px-3 py-2 gap-1` (densifiée en #246, commentaire ligne 50).
- **`src/components/RoadmapGraph.tsx:462`** : GraphCard `px-3 py-2.5 gap-1.5` — le commentaire de RoadmapColumns:24-27 revendique pourtant « rend les trois états comme GraphCard pour que les deux modes soient cohérents ».
- **Constat** : la densification #246 n'a été appliquée qu'à un des deux jumeaux. Même contenu (glyphe, #id, titre, état, temp), deux gabarits.
- **Correction** : extraire UNE carte (ou au moins une constante de classes partagée `taskCardCls`) consommée par les deux vues.

### H4 — Titre d'epic : 3 rendus, dont un corps 13px unique dans l'app
- **`src/components/EpicRow.tsx:184`** : `text-sm font-medium` (liste Backlog).
- **`src/components/RoadmapGraph.tsx:546`** : `text-sm font-medium` (nœud graphe).
- **`src/components/EpicBand.tsx:102`** : `text-[13px] font-medium` — seul 13px du code.
- **Constat** : même rôle (titre d'epic), même graisse, mais la bande Roadmap invente un corps intermédiaire.
- **Correction** : `text-sm` partout ; si la carte de bande est trop large, jouer sur `w-48` ou le truncate, pas sur un corps hors échelle.

### H5 — Tags `#foo` : 11px dans les lignes, 12px dans le panneau — et `text-[12px]` doublonne `text-xs`
- **`src/components/TaskRow.tsx:138,141`** : tags de ligne `text-[11px]`.
- **`src/components/ui.tsx:388,389,416,427`** : tags du TagsCombobox (panneau) `text-[12px]` — soit littéralement `text-xs` (12px) réécrit en arbitraire, une 3e écriture pour rien.
- **Constat** : même objet sémantique (tag), deux corps ; et une valeur arbitraire qui duplique un token existant (grep `text-[12px]` : 4 occurrences, toutes ui.tsx).
- **Correction** : trancher UN corps pour les tags (11px, registre méta) ; interdire `text-[12px]` (lint : arbitraire ≡ token existant).

### H6 — En-tête de jour d'Activity : un 3e registre de label inventé
- **`src/components/ActivityView.tsx:83`** : `text-[11px] font-semibold uppercase tracking-wide`.
- **Constat** : design.md §1 fixe **deux niveaux seulement** de micro-labels (`text-xs font-medium` en-têtes de liste de vue / `text-[11px] font-medium` labels de panneau). Activity introduit semibold + uppercase + tracking-wide — seul uppercase et seul tracking-wide de l'app (grep) ; les en-têtes homologues du Backlog (`src/components/TaskColumns.tsx:141,175`) sont `text-xs font-medium` sans uppercase.
- **Correction** : aligner sur le niveau « en-tête de liste de vue » : `text-xs font-medium text-neutral-500`, casse normale.

---

## SÉVÉRITÉ MOYENNE

### M1 — Dates relatives : mono 11px partout… sauf Activity (12px) et TaskPanel (pas mono)
- Canon de fait : `font-mono text-[11px] text-neutral-500` — `src/components/TaskRow.tsx:120`, `src/components/DocsTree.tsx:88`, `src/components/NotepadView.tsx:255`, `src/components/OverviewView.tsx:155,158,162`.
- **`src/components/ActivityView.tsx:46`** : timestamp `font-mono text-xs` (+ `text-neutral-400`, sous le plancher de contraste — dimension couleur).
- **`src/components/TaskPanel.tsx:882-883`** : « created/completed … » en `text-xs` NON mono ; **`src/components/TaskPanel.tsx:838-843`** : date de feedback `text-[11px]` non mono.
- **Correction** : une classe `metaDate` = `font-mono text-[11px] text-neutral-500`, consommée partout.

### M2 — Compteurs `done/total` : mono 11px partout sauf l'en-tête de colonne Roadmap
- Canon : `font-mono text-[11px]` — `src/components/EpicRow.tsx:251`, `src/components/TaskColumns.tsx:85,143,177`, `src/components/EpicBand.tsx:112,155`.
- **`src/components/RoadmapColumns.tsx:144`** : `font-mono text-xs`.
- **Correction** : text-[11px] (ou décision inverse, mais UNE valeur).

### M3 — Chemins de fichiers mono : 12px dans le corps, 11px en pied de panneau
- **`src/components/TaskPanel.tsx:217,222`** (refs) et **`src/components/KbNodePanel.tsx:52`** : `font-mono text-xs`.
- **`src/components/TaskPanel.tsx:921`** et **`src/components/SectionPanel.tsx:237`** (pied « chemin technique ») : `font-mono text-[11px]`.
- **Constat** : même type de contenu (chemin repo-relatif) à deux corps dans le même panneau. Défendable (pied = relégué), mais non écrit.
- **Correction** : documenter (« pied de panneau = 11px, chemins dans le corps = xs ») ou unifier.

### M4 — Boutons : la taille sert de hiérarchie (12 vs 11px) et le bouton d'update dévie du canon
- **`src/components/ui.tsx:35`** `primaryBtn` = `px-2.5 py-1 text-xs` ; **`src/components/ui.tsx:37`** `actionBtn` = `px-2.5 py-1 text-[11px]`. Primaire et secondaire côte à côte (TaskPanel:571-598) ont donc des hauteurs/corps différents pour un même niveau d'action — la hiérarchie est déjà portée par le fond noir.
- **`src/components/UpdateNotice.tsx:145`** : primaire réécrit à la main `py-1.5 text-xs font-medium` — 3 divergences vs `primaryBtn` (py, graisse) alors que design.md §2 définit LE bouton canonique.
- **Correction** : `actionBtn` passe à `text-xs` (même boîte que primaryBtn) ; UpdateNotice consomme `primaryBtn`.

### M5 — Rythme interne des panneaux : gap-4 vs gap-5, gap-0.5 vs gap-1
- Racines : `src/components/TaskPanel.tsx:504`, `src/components/SectionPanel.tsx:191`, `src/components/KbNodePanel.tsx:35` = `gap-5` ; **`src/components/SectionPanel.tsx:93`** (CreateTaskPanel) = `gap-4`. Deux panneaux rendus dans la même coquille SidePanel n'ont pas le même rythme de sections.
- Dans TaskPanel, sections équivalentes : Type/Temperature/Epic `gap-0.5` (610, 629, 664) vs Detail/Depends/Links/Refs/Feedback `gap-1` (680, 735, 761, 784, 820) — label→contenu espacé différemment selon la section.
- **Correction** : `gap-5` racine partout ; `gap-1` label→contenu partout.

### M6 — Labels de champ : medium dans le DoneForm, normal dans le Log
- **`src/components/TaskPanel.tsx:296,305,310,314`** (DoneForm) : `text-[11px] font-medium`.
- **`src/components/TaskPanel.tsx:892`** (Log : outcome/verification/commit/release) : `text-[11px]` SANS font-medium — même rôle (label de champ de panneau), design.md §1 impose `text-[11px] font-medium`.
- **Correction** : `font-medium` sur les labels du Log (ou factoriser `SectionLabel`/`Field` — trois implémentations locales existent : TaskPanel:106, SectionPanel:23, KbNodePanel:47).

### M7 — États vides / erreurs : trois registres typographiques
- Registre A (canon) : `text-lg font-semibold tracking-tight` + corps text-sm — `src/components/Backlog.tsx:60,68`, `src/components/RoadmapView.tsx:19,27`, `src/components/KbView.tsx:37,49,133`.
- Registre B : `text-sm font-medium` + corps `text-xs` centré verticalement — **`src/components/ActivityView.tsx:73-74`**.
- Registre C : simple `text-sm text-neutral-500` — **`src/components/DocsView.tsx:128,141-143`**, `src/components/OverviewView.tsx:145`.
- Et les conteneurs dévient du gabarit canonique `mx-auto max-w-3xl px-6 py-8` (design.md §1, « loading/error states included ») : **`src/components/KbView.tsx:31,36,48`** = `max-w-2xl`, **`src/components/KbView.tsx:129`** = `max-w-xl`.
- **Correction** : un composant `EmptyState` (titre lg semibold, corps sm, gabarit max-w-3xl px-6 py-8) pour tout le monde.

### M8 — Barres sous-header pleine largeur : px-4 vs px-6, py-1.5 vs py-2
- `src/components/EpicBand.tsx:147` : `px-6 py-1.5` ; **`src/components/KbView.tsx:66`** : `px-4 py-1.5` ; `src/components/Backlog.tsx:148` : `py-2` (px-6 via conteneur) ; `src/components/NotepadView.tsx:228` : `px-4 py-1.5`.
- **Constat** : même rôle (bande outils/filtres sous le ViewHeader), deux retraits horizontaux — le contenu ne s'aligne pas d'une vue à l'autre alors que le ViewHeader, lui, est fixe (px-4).
- **Correction** : trancher (px-4 comme le ViewHeader, ou px-6 comme les corps de vue) et l'écrire dans design.md.

### M9 — Rangées « déplier plus » : trois gabarits pour la même fonction
- **`src/components/TaskColumns.tsx:157,166`** (« Show N more ») : `px-4 py-2.5 text-xs` ;
- **`src/components/RoadmapColumns.tsx:171`** (« +N done » colonne) : `px-3 py-1.5 text-xs` ;
- **`src/components/EpicBand.tsx:185`** (« + N done » epics) : `px-2.5` sans py, `text-xs`.
- **Correction** : un idiome « expander » unique (au minimum même py).

### M10 — Pilules de graphe : radar 11px vs tags 12px
- **`src/components/TypesRadar.tsx:85`** : `px-1.5 py-0.5 text-[11px]` ; **`src/components/TagGraph.tsx:103`** : `px-1.5 py-0.5 text-xs`. Même idiome revendiqué (le commentaire d'OverviewView:77 dit « même idiome que … les axes du radar »).
- **Correction** : même corps (11px).

### M11 — Pieds de popup : « Clear filter » 12px vs « Hide for this session » 11px
- `src/components/ViewHeader.tsx:169` et `src/components/KbDisplayMenu.tsx:112` : `text-xs` ; **`src/components/UpdateNotice.tsx:160`** : `text-[11px]`.
- **Correction** : `text-xs` (2 contre 1).

### M12 — Micro-typo SVG sous le plancher 10px
- **`src/components/FlowAreaChart.tsx:106,128`** : `fontSize="9"` (viewBox 720 — rendu <10px dès que la carte fait <800px de large ; à vérifier au rendu).
- **`src/components/KbGraph.tsx:482,596`** : `LABEL_FONT = 9` pour les labels de nœuds (dépend du zoom ; à vérifier au fit par défaut).
- **Correction** : 10-11 en unités viewBox + garde-fou min à l'écran, ou labels HTML.

### M13 — « Fichiers » (flanc Docs) : niveau label de panneau pour un en-tête de liste de vue
- **`src/components/DocsView.tsx:106`** : `text-[11px] font-medium` — design.md §1 réserve ce niveau aux labels de panneau ; les en-têtes de liste de vue sont `text-xs font-medium` (TaskColumns:141, OverviewView:43, EpicBand:151). Le flanc Notepad, lui, n'a pas d'en-tête du tout (asymétrie Docs/Notes).
- **Correction** : `text-xs font-medium` (et décider si le flanc Notes en reçoit un).

### M14 — Ghost vs field : le texte saute de 2px horizontaux entre les deux peaux
- **`src/components/ui.tsx:17`** `fieldCls` = `px-2 py-1.5` ; **`src/components/ui.tsx:26`** `ghostCls` = `px-1.5 py-1`.
- **Constat** : dans un même panneau les deux peaux cohabitent (DoneForm en field, reste en ghost) — les bords de texte ne tombent pas sur la même verticale ; et le « px-1.5 » du ghost est ce qui force tous les labels à porter `px-1.5` à la main (TaskPanel:106 etc.) pour s'aligner.
- **Correction** : même padding horizontal pour les deux peaux (px-1.5 ou px-2), l'alignement des labels en découle.

### M15 — Recherches de header : deux traitements (Backlog vs KB)
- `src/components/Backlog.tsx:129` : `py-1 pl-7 pr-2 text-xs`, icône, `placeholder:text-neutral-500`, `focus:border-neutral-900` ; **`src/components/KbView.tsx:73`** : `px-2.5 py-1 text-xs`, sans icône, `placeholder:text-neutral-400` (sous plancher contraste), `focus:border-neutral-400`.
- **Correction** : un composant `HeaderSearch` unique.

---

## SÉVÉRITÉ BASSE

- **B1** — `src/components/OverviewView.tsx:172` : `max-w-6xl px-6 py-6` vs gabarit canonique `py-8` (max-w élargi défendable pour une grille ; le py-6 casse le rythme vertical commun).
- **B2** — `src/components/DocsTree.tsx:77` : `items-baseline` pour une ligne titre+date mono, quand le même motif est `items-center` dans NotepadView:248 et TaskRow:73. À unifier (baseline est en fait le meilleur choix quand une date mono plus petite cohabite avec du text-sm).
- **B3** — `src/components/NotepadView.tsx:239` : « New note » `py-2` vs lignes de notes `py-1.5` juste en dessous — deux hauteurs dans le même flanc.
- **B4** — `src/components/ViewHeader.tsx:35` : `font-light` — unique occurrence de light (décision Rémi documentée dans le commentaire : assumé, à consigner dans design.md pour qu'elle ne soit pas « corrigée »).
- **B5** — `src/index.css:222` : `.doc-prose` base 0.9375rem (15px) — seul 15px de l'app (panneau markdown = 14px via `doc-prose--panel`). Défendable en lecture longue ; à écrire.
- **B6** — `src/components/NotepadView.tsx:33` : éditeur `text-[2rem]` (32px) — géant assumé « écriture d'abord » ; hors échelle mais volontaire (commentaire). À consigner.
- **B7** — `src/components/TaskPanel.tsx:381` : « Task not found » en `text-sm` nu, hors des trois registres d'état vide (cf. M7).
- **B8** — Backlog.tsx:176 + TaskColumns.tsx:139 : double `flex flex-col gap-8` imbriqué (le wrapper du Backlog est mort) — bruit, pas de bug visuel.
- **B9** — Hors dimension mais vu au passage : `src/components/OverviewView.tsx:41` `rounded-lg` sur les cartes Overview — design.md §1 impose cartes CARRÉES (rounded-md réservé header/flottants ; rounded-lg n'existe nulle part ailleurs). Copy FR (Overview/Docs/KbView) vs EN (reste) — dimension contenu.

---

## Usage du mono — inventaire (globalement SAIN)

Politique de fait : mono = valeur technique. Cohérent pour : **#id** (`font-mono text-xs` : TaskRow:106, TaskPanel:513, ui.tsx:224, OverviewView:113, RoadmapGraph:468,583, KbNodePanel:85 — impeccable), slugs d'epic (ui.tsx:489,515), stats KB (KbView:107), versions (UpdateNotice:123), meta du header (ViewHeader:40), température (Temperature:109), raccourci ⇧⌘C + compteurs Notepad (NotepadView:341). Dérives : dates (M1), compteurs (M2), chemins (M3), et les **messages d'erreur en mono** (ui.tsx:56 FieldError, ui.tsx:91 ErrorBanner) — de la prose en mono, choix discutable mais appliqué uniformément : à documenter comme registre « erreur ».

## Ce qui est DÉJÀ cohérent (à verrouiller tel quel)

- **h-12 partagé** ViewHeader:24 / SidePanel:101 — la seule hauteur de header, respectée.
- **Titres de panneau** : `text-base font-semibold leading-snug tracking-tight` — TaskPanel:548, SectionPanel:209, KbNodePanel:37 (parité y compris px-1.5, commentaire SectionPanel:207 l'atteste).
- **Titre de coquille de panneau** `text-sm font-semibold tracking-tight` (SidePanel:113) — un cran sous le titre de contenu, logique.
- **États vides à en-tête** `text-lg font-semibold tracking-tight` — Backlog/Roadmap/KbView identiques au caractère près.
- **Labels de champ de panneau** `text-[11px] font-medium text-neutral-500` — TaskPanel:106, SectionPanel:26,217, KbNodePanel:47,63,70.
- **En-têtes de liste de vue** `text-xs font-medium text-neutral-500` — TaskColumns:141,175, OverviewView:43, EpicBand:151.
- **Items de popup** `px-2.5 py-1.5 text-sm` — Select, AddCombobox, TagsCombobox, EpicCombobox, MultiCombobox, FilterMenu (py-1.5 text-xs pour ce dernier, corps réduit cohérent avec son trigger).
- **Contrôles de header** `rounded-md px-2.5 py-1 text-xs` — FilterMenu trigger, boutons KbView, UpdateNotice trigger, « + task », EmptyState KbView:148 : même gabarit partout.
- **Zoom flottants** identiques RoadmapGraph:343-351 / KbGraph:318-324 (à factoriser, mais cohérents).
- **tracking-tight** systématique sur tous les titres (10 fichiers), unique tracking-wide = H6.
- **px-4** comme retrait des lignes pleine largeur (TaskRow, ActivityView, NotepadView, DocsTree BASE_PADDING_PX=16, PreviewRow) — conforme design.md §1.

---

## Recos structurantes

1. **Nommer l'échelle typo dans design.md §1 et la porter en constantes** (à côté de `fieldCls`/`primaryBtn` dans ui.tsx) : `display` = text-lg semibold tracking-tight (états vides) · `title` = text-base semibold leading-snug tracking-tight (titres de panneau) · `heading` = text-sm semibold tracking-tight (coquilles, colonnes) · `body` = text-sm · `control` = text-xs (boutons, inputs de header, en-têtes de liste avec font-medium) · `meta` = text-[11px] (+ `font-mono` pour dates/compteurs/chemins). Interdire par lint tout `text-[Npx]` arbitraire (13, 12, 10) : chaque taille existante doit mapper sur un de ces six niveaux.
2. **Fixer le rythme des lignes de liste** : deux densités (`py-2.5` liste principale, `py-1.5` flanc), et les lignes-groupe (epic, release) alignées sur la hauteur de la densité de leur liste — supprimer `py-[5px]` (valeur hors échelle, copiée-collée avec sa raison d'être perdue).
3. **Une carte de tâche, une seule** : factoriser TaskCard (RoadmapColumns) et GraphCard (RoadmapGraph) sur une base de classes commune — c'est le seul endroit où deux écrans revendiquent la cohérence en commentaire tout en divergeant en code.
4. **Factoriser les micro-composants dupliqués** qui sont la source des dérives : `SectionLabel`/`Field` (3 copies), `EmptyState` (3 registres), `HeaderSearch` (2 copies), expander « show more » (3 gabarits), pied de popup (3 corps). Chaque copie locale est une dérive en attente.
5. **Étendre design.md §1 Spacing** au non-couvert : retrait des barres sous-header (px-4 vs px-6), gap racine des panneaux (gap-5), gap label→contenu (gap-1), plancher typo SVG (≥10 unités viewBox + garde au rendu). La section actuelle ne norme que le contenu centré et le flanc — tout le reste a dérivé faute de règle.
