# DS Review 5 — Interaction, motion, accessibilité

**Périmètre** : toute l'app (`src/`), état du code au 2026-07-19. Référence : `docs/design.md` ; base : `docs/audit-a11y-2026-07.md` (re-vérifié sur le code actuel — beaucoup de findings de juillet sont FIXÉS, voir « Déjà solide »).
**Échelle** : bloquant = non conforme et pénalisant · gênant = non conforme mais contournable · mineur = confort/cohérence. Tout finding = constat démontré fichier:ligne ; les points incertains sont marqués « à vérifier ».

---

## BLOQUANT

### B1 — Nœuds du graphe KB inaccessibles au clavier (action non redondante, souris seule)
- **Constat** : `KbGraph.tsx:560-575` — les nœuds sont des `<circle>` SVG avec `onClick={() => onOpen(node.id)}`, `onPointerEnter/Leave`, `cursor-pointer`… mais **aucun `tabIndex`, aucun `role`, aucun handler clavier**. Ouvrir l'inspecteur `KbNodePanel` (et le mode double nœud+ticket #313) n'est possible **qu'à la souris**. La recherche (`KbView.tsx:67-74`) cadre les résultats mais n'offre aucun moyen d'en OUVRIR un.
- Contraste interne : les nœuds du graphe de dépendances sont, eux, de vrais `<button>` focusables (`RoadmapGraph.tsx:457-461`, avec `onFocus`/`onBlur` qui pilotent même le surlignage). Les deux graphes ne parlent pas la même langue.
- **Règle violée** : design.md §3.5 (« No mouse-only clickable zone carrying a non-redundant action ») + WCAG 2.1.1.
- **Fix** : soit `<g role="button" tabIndex={0}` + Enter/Espace (roving tabindex si 869 nœuds = trop de tabs), soit un chemin redondant — la liste des résultats de recherche en items focusables qui appellent `onNodeClick`. Vues touchées : Graph (GraphView), KbView, pas l'Overview (`onNodeClick` no-op, `OverviewView.tsx:213`).

---

## GÊNANT

### G1 — Focus perdu après action : le motif n°1 de l'audit #107 subsiste dans 4 endroits (hors panneaux, qui sont fixés)
1. `TaskColumns.tsx:153-170` — « Show N more » / « Show less » : le bouton cliqué se **démonte** (`setShowAll`) → focus sur `body`. Fix : refocus sur la liste ou le bouton jumeau.
2. `Backlog.tsx:22-35` (+ usages :150-166) — `RemovableChip` : le ✕ retire le chip qui le porte, et « Clear all » se démonte lui-même (`hasFilters` devient false) → focus sur `body`. Fix : refocus sur la barre de chips / le champ recherche.
3. `NotepadView.tsx:258-266` — ✕ de suppression de note : après `removeNote` la ligne disparaît, aucun repositionnement (pattern `removeAndRefocus` de `TaskPanel.tsx:445-454` PAS appliqué ici).
4. `TaskPanel.tsx:542` (titre) et `:899` (log outcome/verification) — les `GhostAutoTextArea` font `e.currentTarget.blur()` sur Enter/⌘Enter **sans refocus**, contrairement à `blurOnEnter` (`ui.tsx:70-75`) qui restaure le focus pour les `GhostInput`. Deux comportements pour le même geste « Enter = valider » selon que le champ ghost est input ou textarea.

### G2 — Contraste : reliquats sous le plancher `neutral-500` (design.md §1) sur du texte porteur de sens
- `ActivityView.tsx:46` — horodatage d'entrée en `text-neutral-400` (2.58:1) : donnée informative (l'heure de l'événement), pas décorative.
- `TaskPanel.tsx:255` et `KbNodePanel.tsx:55` — `sourceLocation` en `text-neutral-400`.
- `TaskPanel.tsx:266` — libellé « via 1 hop » en `text-neutral-400` (c'est une info structurante de la liste).
- `KbView.tsx:73` — `placeholder:text-neutral-400` alors que le canon est `placeholder:text-neutral-500` (`ui.tsx:329`, `Backlog.tsx:129`) — régression locale du fix #108.
- `FlowAreaChart.tsx:106,127-129` — étiquettes d'axes `fill-neutral-400` à **9px** : double infraction (plancher couleur + « nothing below 10px », design.md §1).
- Exempts vérifiés : `ViewHeader.tsx:35` (× aria-hidden), `UpdateNotice.tsx:125` (flèche aria-hidden), `ActivityView.tsx:72` (icône d'empty state aria-hidden), disabled (`ui.tsx:17`), labels dim du KB (`KbGraph.tsx:597`, état atténué volontaire).

### G3 — Deux recettes de recherche de header
`KbView.tsx:67-74` vs `Backlog.tsx:122-131`. La recherche KB : `focus:border-neutral-400` (indicateur souris à 2.58:1, sous les 3:1 non-texte) et sans icône ; la recherche Backlog : `focus:border-neutral-900` + icône Search + `placeholder:500`. Même rôle, deux rendus, deux forces de focus. (Le clavier reste sauvé partout par le `:focus-visible` global non-layered — vérifié `index.css:340-343`.)

### G4 — Cibles de pointeur minuscules (WCAG 2.5.8 : ≥ 24px, cible ~40px du DS non tenue sur les croix)
- `ui.tsx:419` et `:591` — `Combobox.ChipRemove` : `Cross size={8}` **sans padding** → cible ~8×12px. (L'équivalent clavier ←/Backspace existe, mais la cible souris/tactile reste sous tout seuil.)
- `Backlog.tsx:30` — ✕ de chip de filtre : `size-4` = 16×16px.
- `NotepadView.tsx:263-266` — ✕ de note : texte nu sans padding (~14×20px), action **destructive**.
- `TaskPanel.tsx:132-143`, `ui.tsx:549-557` — `RemoveButton`/✕ epic : `p-1` + Cross 9 ≈ 17px.
- `ui.tsx:177-180` — `Toast.Close` : `p-0.5` + Cross 10 ≈ 15px.
- `TaskRow.tsx:80-86` — chevron de sous-tâches : `px-0.5` + glyphe 11px → ~15px de large (self-stretch ne sauve que la hauteur).
- `SidePanel.tsx:104-122` — ← et ✕ d'en-tête : `p-1` + 13/14 ≈ 21-22px, juste sous 24.
- **Fix systémique** : un utilitaire de padding minimal (p-1.5/p-2) sur toutes les croix + `min-h`/`min-w` 24px ; garder le rendu discret via l'icône petite dans une hitbox large.

### G5 — Hover de rangée : deux gris pour le même gabarit
Le registre implicite est : rangée de liste = `hover:bg-neutral-50` (TaskRow.tsx:73, EpicRow.tsx:235, TaskColumns.tsx:77,157,166, RoadmapColumns.tsx:171, RoadmapGraph.tsx:577, OverviewView.tsx:111, NotepadView.tsx:249) ; contrôles/boutons et lignes de panneau = `hover:bg-neutral-100` (ghostCls, actionBtn, FilterMenu…). Déviants sur le gabarit « rangée de liste » :
- `DocsTree.tsx:51` et `:80` — dossiers/fichiers de l'arbre en `hover:bg-neutral-100`.
- `ActivityView.tsx:54` — entrées du feed en `hover:bg-neutral-100`.
- `NotepadView.tsx:239` — « New note » en `hover:bg-neutral-100` **juste au-dessus** des rangées de notes en `hover:bg-neutral-50` (:249) : les deux intensités se côtoient dans la même liste.
Signifiant en dark (#269) : `neutral-50` est calibré « survol de rangée sur carte » (`index.css:66`) — les déviants sortent de ce calibrage.

### G6 — `rounded-lg` sur les cartes de l'Overview
`OverviewView.tsx:41` — `rounded-lg` (8px) : rayon hors système (design.md §1 : deux rayons seulement, et **surfaces carrées** — cards/accordions/popups sans radius). Seule occurrence du code ; toutes les autres surfaces sont carrées. Fix : retirer, ou décision explicite dans design.md.

### G7 — Langue de l'UI mixte FR/EN (et `lang="en"` global)
`index.html:2` déclare `lang="en"`, or : ActivityView.tsx:73-76, OverviewView.tsx:75-80 (`aria-label="Choisir l'aperçu"`), :145, :155 (« j »), :188, :216-218, KbView.tsx:31,37-52,109-115, KbNodePanel.tsx:31,72,87, DocsView.tsx:106-143, FlowAreaChart.tsx:61,82-85 sont en **français**, quand Backlog/TaskPanel/Roadmap/toasts sont en **anglais** (« Nothing open », « Task finished! »…). Incohérence de voix + prononciation lecteur d'écran fausse sur la moitié des vues (WCAG 3.1.2). Décider UNE langue (l'anglais domine) et migrer les vues récentes (#372-#377 semblent être la source de la dérive).

---

## MINEUR

### M1 — `transition-colors` au cas par cas, sans règle
~55 `hover:bg-*` ; la transition est présente ou absente sans logique : `TaskColumns.tsx` 5 hovers/0 transitions, `TaskRow.tsx:73` 0, `ActivityView.tsx:54` 0, `KbNodePanel.tsx:82` 0, `NotepadView` 8/1 — contre ui.tsx/RoadmapGraph/UpdateNotice systématiques. Même à l'intérieur d'un composant : `DocsTree.tsx:77` (fichier, transition) vs `:51` (dossier, sans) ; `ViewHeader.tsx:105` (trigger, transition) vs `:130` (options, sans). Durées/easing : seuls 3 réglages explicites existent (150ms `ui.tsx:166`/`UpdateNotice.tsx:106`/`.chev index.css:115`, 260ms tween `useZoomPan.ts:137`, 300/450ms kb `index.css:181,187`) — pas de token partagé.

### M2 — `cursor-default` sur les options de menus vs règle #120
`index.css:104` pose `cursor: pointer` sur `[role="option"]` (« tout ce qui est cliquable », #120), mais TOUS les items Select/Combobox le neutralisent : `ui.tsx:283,342,439,526,613` (`cursor-default`, la classe utilitaire bat le `@layer base`). Convention macOS assumée ou oubli ? Les deux règles se contredisent dans le code — à trancher et documenter (si voulu, retirer `[role="option"]` de la règle globale).

### M3 — Labels du rail à 10px
`NavRail.tsx:58` — `text-[10px]` : design.md §1 « existing 10px to be bumped to 11px ». Le commentaire du composant assume le choix (bande de 64px) mais c'est une dérogation non écrite dans design.md. (Les 9px de `KbGraph.tsx:482` sont sur canvas zoomable — exemption défendable, à documenter aussi.)

### M4 — `scrollIntoView({ behavior: 'smooth' })` non gardé
`DocsView.tsx:75` — seul mouvement du code qui ignore `prefers-reduced-motion` (tout le reste est gardé, cf. « Déjà solide »). Fix : `matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'`.

### M5 — Textarea du Notepad : seul focusable sans indicateur
`NotepadView.tsx:337` — `style={{ outline: 'none' }}` inline tue le `:focus-visible` global (le commentaire du code l'assume ; audit #107 l'avait noté mineur, caret = compensation). Toujours vrai. Statut : dérogation assumée, à inscrire dans design.md si conservée.

### M6 — `role="status"` sur le point NEW statique
`TaskRow.tsx:99-105` — le badge NEW est un `<span role="status" aria-label=…>` : `status` est une live region (annonce à l'insertion) posée ici sur un marqueur d'état passif au milieu d'une liste re-rendue — sémantiquement faux, risque d'annonces parasites au reload. `aria-label` sur un `<span role="img">` (ou texte sr-only) suffit.

### M7 — Compteur « unread » d'Activity orphelin
`LiveActivity.tsx:63-71,87,102` — `unread`/`open`/`setOpen` sont maintenus mais **plus consommés nulle part** (grep : zéro usage hors provider) depuis la suppression de l'overlay header (#372/#377). Conséquence UX : plus AUCUN indicateur de non-lus — l'item Activity du rail (NavRail) ne signale rien quand des événements arrivent. À vérifier si assumé ; sinon : pastille accent sur l'item du rail (même idiome que le point du trigger UpdateNotice, `UpdateNotice.tsx:102`) et suppression du state mort.

### M8 — Trois familles « actif » ; design.md n'en documente qu'une
- Rangées : `bg-accent-tint` + filet inset (design.md §3.2) — appliqué partout (TaskRow:73, DocsTree:80, NotepadView:249, RoadmapColumns:43, RoadmapGraph:450,577, EpicCard:96, EpicBand:165). ✓
- Pills : `border-accent bg-accent-tint text-neutral-900` — cohérentes entre elles (ViewHeader.tsx:107, KbView.tsx:97, KbDisplayMenu.tsx:75, TypesRadar.tsx:87, TagGraph.tsx:105, chip stale KbView.tsx:109) mais famille absente de design.md (#311 la mentionne en commentaire seulement).
- Déviants : Segmented de l'Overview (`OverviewView.tsx:90`) = tint SANS bordure accent (ni filet) ; NavRail (`NavRail.tsx:66`) = tint + `text-accent` sur l'icône. Deux nouveaux idiomes en une semaine → mettre design.md à jour ou aligner Segmented sur la famille pill.

### M9 — Bordure d'affordance quasi invisible sur les pills radar/tags
`TypesRadar.tsx:88` et `TagGraph.tsx:106` — état repos `border-neutral-200` (1.26:1) pour des CONTRÔLES, quand tous les autres pills interactifs du chrome sont `border-neutral-300` (ViewHeader:108, KbView:97, ThemeToggle:23…). design.md §1 réserve neutral-200 aux filets non-interactifs.

### M10 — Focus souris des champs ghost faible (assumé ?)
`ui.tsx:26` — `focus:border-neutral-300` (1.48:1) + fond blanc comme seul signal de focus **souris** (le clavier a l'outline global). Conforme à la lettre de design.md §2/§3.3, mais l'état « je suis dans le champ » après clic est presque invisible sur carte blanche. À vérifier avec Rémi — pas un bug de conformité, une marge de confort.

---

## Déjà solide (vérifié dans le code actuel)

- **:focus-visible global** : `index.css:340-343`, hors `@layer` → bat les utilitaires `focus:outline-none` (tous vérifiés inoffensifs au clavier, sauf M5 inline).
- **Cursor #120** : règle globale `index.css:103-107` (button, rôles ARIA, label[for], summary, hors disabled) ; `cursor-grab/grabbing` sur les 2 graphes ; `cursor-text` sur les zones d'édition ; curseur pointer dynamique du backdrop Notepad (`NotepadView.tsx:206`).
- **prefers-reduced-motion : couverture quasi totale** — `.chev`, `pulse-live`, `live-entry-in`, `kb-in`/`kb-edges-in` (index.css:120-194), tween zoom (`useZoomPan.ts:215`), mascotte figée (`BirdMascot.tsx:39,59`), pipeline KB statique (`KbGraph.tsx:49-74`, `KbContext.tsx:68`), toasts/popovers `motion-reduce:transition-none` (`ui.tsx:166`, `UpdateNotice.tsx:106`), `motion-safe:animate-pulse` (`UpdateNotice.tsx:152`). Seule fuite : M4.
- **Icône-seule = aria-label partout** : SidePanel ←/✕, ThemeToggle, lien bug (ViewHeader:56), zoom −/100%/+ des 2 graphes, RemoveButton, ✕ epic, ChipRemove, Toast.Close, ✕ notes/chips.
- **Révélé au hover ⇒ révélé au focus** : `focus-visible:opacity-100` systématique (ui.tsx:554, TaskPanel.tsx:139, NotepadView.tsx:265, RoadmapColumns.tsx:138) — fix #115 appliqué.
- **Gestion du focus des panneaux** : SidePanel Esc en cascade capture-phase + restauration du déclencheur avec `isConnected` (SidePanel.tsx:48-91) ; `AddCombobox` refocus post-remontage (ui.tsx:314-316) ; `removeAndRefocus` des listes (TaskPanel.tsx:445-454) ; refocus lecture après édition du détail (TaskPanel.tsx:704-706) ; `blurOnEnter` restitue le focus (ui.tsx:70-75). Les 6 findings « focus » de l'audit #107 côté panneaux sont fixés.
- **ARIA d'état** : `aria-current="page"` (NavRail:57, DocsTree:76) ; `aria-pressed` sur tous les toggles (FilterMenu:155,159, EpicCard:92, Segmented:88, TypesRadar:78, TagGraph:96, inferred KbView:94) ; `aria-expanded` natif Base UI + explicite (EpicBand:182, EpicGraphNode:537) ; `role="group"` des radars (fix TeamsRadar `role=img` de l'audit) ; `role="alert"` ErrorBanner ; glyphes `role="img"` + label (glyphs.tsx) ; noms accessibles riches des triggers plein-rang (EpicRow:238, TaskColumns:80).
- **Clavier des graphes** : viewport `tabIndex=0 role="application"` + aria-label d'instructions, flèches=pan, +/−=zoom, 0=reset (useZoomPan.ts:319-336, RoadmapGraph.tsx:357-368, KbGraph.tsx:340-354) ; détail : le focus clavier d'une carte déclenche le surlignage amont/aval comme le survol (RoadmapGraph.tsx:460).
- **Feedback** : registre toast unique (ToastViewport partagé, erreurs réseau seulement + « Task finished! » 9s/limit 5 pause au survol, LiveActivity.tsx:140) ; SavedTick/FieldError/ErrorBanner uniformes dans les 2 panneaux ; badge NEW cohérent (pose seenTasks, effacement à l'ouverture TaskPanel.tsx:378-380) ; `live-entry-in` garde `receivedAt` (ActivityView.tsx:35).
- **Anti-flash thème** : `index.html:6-17` inline avant paint, miroir de theme.ts ; `color-scheme` posé (index.css:57-59).
- **Fixes d'audit confirmés disparus** : select natif du quick-add (plus aucun `<select>` dans src/components), ambre/rouge Notepad (bandeau neutre NotepadView.tsx:228), DocsTree actif accent-tint+filet (DocsTree.tsx:80), détail Enter+Espace+aria-label (TaskPanel.tsx:718-721), Esc hors panneau ne ferme plus (SidePanel.tsx:66), confirmation de suppression de note (NotepadView.tsx:261).

---

## Recommandations (3-5)

1. **Un chemin clavier pour les nœuds KB** (B1) : soit nœuds focusables (roving tabindex), soit liste de résultats de recherche activable — c'est le seul vrai mur d'accessibilité restant.
2. **Un token de transition** : `--transition-fast: 150ms ease` (+ éventuellement `--transition-move: 260ms cubic-bezier(...)` pour le zoom) et une règle design.md : « tout hover de couleur porte transition-colors » — puis passe mécanique sur les ~30 hovers sans transition (M1) et sur les deux gris de hover (G5 : rangée=50, contrôle=100, écrit noir sur blanc).
3. **Une classe de croix** : un composant/`removeBtnCls` unique (icône ≤10px dans une hitbox ≥24px, `p-1.5` + `focus-visible:opacity-100`) remplaçant les 7 recettes de ✕ recensées (G4) — règle en même temps la moitié des cibles trop petites.
4. **Compléter design.md §3.2** avec les familles « actif » réellement en usage (rangée / pill accent / rail) et aligner le Segmented de l'Overview sur la famille pill (M8) ; en profiter pour trancher M2 (cursor des options) et M3/M5 (dérogations 10px et outline Notepad) — que toute dérogation soit écrite.
5. **Décider la langue** (G7) : une passe unique EN sur ActivityView/OverviewView/KbView/KbNodePanel/DocsView/FlowAreaChart (ou `lang` corrigé si le FR gagne) + boucler les 4 pertes de focus restantes (G1) et les 6 textes sous plancher (G2) — trois heures de travail mécanique qui ferment l'écart avec l'audit #115.
