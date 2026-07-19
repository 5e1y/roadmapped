# DS Review 7 — Langage de forme sémantique (arrondi/angle, sélection, encodages)

Périmètre : la forme encode-t-elle un SENS cohérent à travers l'app. Orthogonal aux
audits 1-6 (tokens, typo, composants, layout, interaction, iconographie) — non refaits.
Réf : `docs/design.md` §1 « Corner radii — two radii, one rule » (l.43-51) et §3.2
« Universal active/selected language » (l.86-88). Tous les chemins sous
`/Users/rcourtillon/Documents/Roadmapped/`.

## Verdict d'entrée — la doctrine arrondi/angle

**Elle EXISTE et elle est écrite** (design.md:43-51). Ce n'est PAS « arrondi = interactif » :
le rayon encode la **strate du conteneur**, pas l'interactivité —

- **0 (carré)** : tout ce qui est cousu à la surface — cartes, accordéons, popups,
  bannières, toasts, chips, rangées de liste ;
- **`rounded` 4px** : contrôle posé dans le corps d'une vue/panneau ;
- **`rounded-md` 6px** : chrome du header h-12 + cartes flottantes de graphe ;
- **`rounded-full`** : barres de progression uniquement.

Donc « chips carrées mais cliquables » (EpicBand.tsx:165) ne contredit rien : la
cliquabilité n'est pas la variable. **La doctrine est largement suivie** (Backlog,
panneau, Roadmap, ui.tsx : fieldCls/ghostCls/actionBtn tous `rounded` 4px —
ui.tsx:17,26,35,37 ; chips métadonnées carrées — Chip.tsx:12) **avec 8 écarts
démontrés ci-dessous, dont 2 structurels** (cartes Overview `rounded-lg` ; popups
scindés en deux familles de rayon). Écart aggravant : design.md dit « popups =
carrés » alors que la moitié des popups du code sont `rounded-md` — doc et code se
contredisent depuis #311.

Le langage de sélection, lui, existe en DEUX registres dont un seul est écrit :

- **Registre 1 (écrit, §3.2)** — élément COURANT d'une liste : `bg-accent-tint` +
  `shadow-[inset_2px_0_0_var(--color-accent)]`.
- **Registre 2 (non écrit, seulement en commentaire ViewHeader.tsx:100-102, #311)** —
  contrôle ENCLENCHÉ (pill arrondie) : `border-accent` + `bg-accent-tint`, parce que
  « un demi-filet inset jurait avec le rounded-md ». Règle implicite dérivable :
  *la barre inset ne se pose jamais sur un coin arrondi*. Nulle part dans design.md.

---

## CRITIQUE

Aucun finding au sens « casse l'usage ». Les deux pires sont en Haute : le registre 1,
pourtant qualifié d'« universel » par design.md §3.2, n'est pas propagé aux deux vues
les plus récentes (Overview #375, Activity #377) — dont une avec un commentaire qui
affirme le contraire du code.

## HAUTE

**H1 — Overview : l'aperçu 5 tickets ouvre le panneau mais ne signale jamais le
ticket courant ; le commentaire ment.**
- `src/components/OverviewView.tsx:104` : « Toute la ligne ouvre le TaskPanel
  (usePanel.openTask) — même contrat que TaskRow. » Faux pour la moitié du contrat.
- `OverviewView.tsx:106-117` (`PreviewRow`) : `hover:bg-neutral-50` seulement — aucun
  `isOpenInPanel`, aucun tint/inset. Comparer `TaskRow.tsx:64,73`.
- Constat : on clique une ligne, le panneau s'ouvre par-dessus, la ligne reste
  visuellement identique à ses voisines. Le langage « universel » s'arrête à la
  frontière de la vue.
- Correction : `PreviewRow` lit `top` via `usePanel()` (déjà importé l.7) ;
  `const current = top?.type === 'task' && top.id === task.id` ; classe
  `current ? 'bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-neutral-50'`.
  Une ligne, même recette que TaskRow.tsx:73.

**H2 — Activity : même trou.**
- `src/components/ActivityView.tsx:54` (`EntryRow`) : `onOpenTask(entry.id)` ouvre le
  panneau, classe = `hover:bg-neutral-100` seul. Aucune notion d'entrée courante alors
  que la tâche ouverte reste affichée à côté du feed.
- Nuance honnête : plusieurs entrées peuvent référencer le même `#id` — le highlight
  s'appliquerait à toutes. C'est acceptable (elles parlent toutes du ticket ouvert) ;
  à défaut, décider et DOCUMENTER l'exemption dans design.md. En l'état c'est un trou
  silencieux, pas une exemption.
- Correction : même recette (`top?.type === 'task' && top.id === entry.id`), ou
  exemption écrite.

**H3 — Cartes Overview `rounded-lg` : rayon hors doctrine, unique dans toute l'app.**
- `src/components/OverviewView.tsx:41` : `rounded-lg border border-neutral-200
  bg-white` sur les `<section>` de la grille. design.md:49 : surfaces = carrées.
  `rounded-lg` (8px) n'apparaît nulle part ailleurs (grep `rounded-lg` : 1 occurrence).
- Constat : les cartes inertes de l'Overview sont PLUS arrondies que n'importe quel
  contrôle interactif de l'app — le rayon y est inversement corrélé au sens qu'il
  porte partout ailleurs. Les cartes homologues sont carrées : GraphCard
  (RoadmapGraph.tsx:450-454), EpicCard (EpicBand.tsx:94), cartes RoadmapColumns.
- Correction : carré (aligne Overview sur Roadmap/EpicBand). Si Rémi tient à
  différencier « carte de dashboard posée sur la page », l'acter dans design.md —
  mais alors 6px (le rayon « flottant » existant), jamais un 3e rayon.

**H4 — Popups : deux familles de rayon, et design.md contredit la moitié du code.**
- Carrés (conformes à design.md:49) : `src/components/ui.tsx:278` (Select.Popup),
  `335`, `432`, `519`, `606` (Combobox.Popup) ; Toast `ui.tsx:166`.
- `rounded-md` (contraires à design.md:49) : `src/components/ViewHeader.tsx:116`
  (FilterMenu Popover.Popup), `src/components/KbDisplayMenu.tsx:83` (Popover.Popup).
- Constat : le même objet sémantique (surface flottante ancrée à un trigger) a deux
  formes selon le fichier. #311 a arrondi les popovers du header sans répercuter ni
  sur design.md ni sur les popups de ui.tsx.
- Correction (au choix, mais trancher) : (a) doctrine « tout ce qui FLOTTE au-dessus
  de la page = rounded-md » → migrer ui.tsx:278/335/432/519/606 (+ Toast) et amender
  design.md:49 ; ou (b) « tout popup = carré » → migrer ViewHeader:116 et
  KbDisplayMenu:83. (a) est la plus défendable sémantiquement : cousu = 0, contrôle
  dans le flux = 4px, détaché du flux = 6px — c'est déjà la logique des overlays de
  graphe (KbGraph.tsx:316,328,648, RoadmapGraph.tsx:343, tous rounded-md).

**H5 — KbView : un badge INERTE porte le costume exact du toggle ACTIF, dans la même
toolbar que deux vrais toggles.**
- `src/components/KbView.tsx:109` : badge « peut-être obsolète » = `rounded border
  border-accent bg-accent-tint` — pixel pour pixel le registre 2 « contrôle
  enclenché » de KbView.tsx:97 (toggle inferred) et KbDisplayMenu.tsx:75, qui
  siègent à quelques centimètres dans la même barre.
- Constat : la forme dit « ceci est un contrôle pressé », le sens est « warning de
  staleness ». C'est le faux-ami le plus net de l'app : même costume, sens opposé
  (inerte vs interactif). L'accent « point d'attention » (design.md:15) n'autorise
  pas à copier la silhouette d'un état interactif.
- Correction : registre monochrome emphatique (celui des erreurs, design.md §1) —
  ex. `border-neutral-300 bg-neutral-100 text-neutral-600`, ou texte nu
  `text-neutral-500` comme les stats voisines. Garder l'accent uniquement si
  l'élément devient cliquable (relancer l'update).

## MOYENNE

**M1 — « Filtre actif » parle trois dialectes.**
- Dialecte A (registre 1, tint + inset) : EpicBand.tsx:96 (carte epic filtrante,
  `aria-pressed`) et EpicBand.tsx:165 (chip rappel du filtre, bande repliée).
- Dialecte B (registre 2, border-accent + tint) : ViewHeader.tsx:107 (FilterMenu),
  KbView.tsx:97, KbDisplayMenu.tsx:75.
- Dialecte C (aucun signal accent) : Backlog.tsx:24 (`RemovableChip`, pilule neutre —
  décision Rémi documentée l.15-18 : « trait sur un côté + coins arrondis = moche » ;
  sa présence vaut signal).
- Constat : le même sens (« un filtre est posé ») s'exprime différemment selon la
  vue ; la variable qui choisit A vs B est le rayon du support (carré → inset,
  arrondi → border pleine, #311) — règle cohérente mais écrite nulle part. C est une
  décision produit assumée (le chip n'EST que quand le filtre existe) — légitime,
  à écrire aussi.
- Correction : pas de migration ; écrire la règle de compatibilité dans design.md
  (§ doctrine recommandée ci-dessous) pour que A/B/C cessent d'être du folklore oral.

**M2 — Segmented (Overview) : trahit l'idiome qu'il revendique.**
- `src/components/OverviewView.tsx:74-76` : « même idiome que le toggle inferred de
  KbView et les axes du radar ». Ces idiomes = `border-accent` + tint
  (KbView.tsx:97, TypesRadar.tsx:87). Or `OverviewView.tsx:90` : actif =
  `bg-accent-tint font-medium` SANS border-accent.
- Aggravant rayon : wrapper `rounded-md` (OverviewView.tsx:80) dans le CORPS d'une
  carte — design.md:45 réserve le corps à `rounded` 4px (les options internes l.89
  sont, elles, correctement `rounded`).
- Correction : soit ajouter `border-accent` à l'option active (mais un segmented à
  bord accent interne est lourd), soit acter que « segmented interne : tint seul
  suffit, le wrapper borde déjà » — et corriger le commentaire. Wrapper → `rounded`.

**M3 — Notepad : `accent-tint` au SURVOL et comme zone de drop — le tint prend
trois sens.**
- `src/components/NotepadView.tsx:301` : ligne-fichier survolée →
  `bg-accent-tint decoration-accent`. §3.2 : le gris est le hover, le tint est la
  sélection — ici le tint EST le hover. Un utilisateur entraîné lit « courant/actif »
  là où il n'y a qu'un survol.
- `NotepadView.tsx:284` : `dragging → bg-accent-tint` sur toute la zone d'édition
  (commentaire l.283 l'assume : « le registre actif du dashboard »). 3e sens :
  « cible de drop imminente ».
- Constat : dans le seul NotepadView, le tint veut dire sélection (l.249, conforme),
  hover (l.301), drop (l.284).
- Correction : hover ligne-fichier → `bg-neutral-100 decoration-accent` (l'accent
  reste sur la décoration, le fond redevient hover standard). Drop : acceptable si
  écrit (« tint plein-conteneur = drop target »), sinon préférer un
  `outline-dashed outline-accent` qui ne singe pas la sélection.

**M4 — Hover de rangée à deux intensités, sans règle — jusque dans le même fichier.**
- `hover:bg-neutral-50` : TaskRow.tsx:73, OverviewView.tsx:111, RoadmapGraph.tsx:577,
  TaskColumns.tsx:77,157,166, NotepadView.tsx:249.
- `hover:bg-neutral-100` : ActivityView.tsx:54, DocsTree.tsx:51,80,
  KbNodePanel.tsx:82, TaskPanel.tsx:164 (RelationRow), NotepadView.tsx:239.
- Constat : même famille d'éléments (rangée pleine-largeur sur fond card qui ouvre
  quelque chose), deux forces de hover ; NotepadView mixe les deux à 10 lignes
  d'écart (:239 « New note » = 100, :249 rangées de notes = 50). L'intensité
  n'encode rien. (Chevauche peut-être l'audit interaction — angle retenu ici :
  absence de sémantique, pas l'a11y.)
- Correction : une règle d'une ligne — ex. « hover de rangée = neutral-50 sur card,
  neutral-100 réservé aux contrôles compacts (boutons, options de popup) » — puis
  aligner les 5 déviants de la liste concernée.

**M5 — RemovableChip et « Clear all » : rounded-md dans le corps + « chips =
carrées » contredit.**
- `src/components/Backlog.tsx:24` : chip filtre supprimable `rounded-md`, rendue dans
  la barre de filtres actifs SOUS le header (Backlog.tsx ~145-160), pas dans le h-12.
  `Backlog.tsx:163` : « Clear all » `rounded-md`, même barre.
- Constat : design.md:47 réserve rounded-md au header h-12 + flottants ; design.md:50
  dit chips = carrées. Deux entorses au même endroit. La décision Rémi (l.15-18) ne
  couvre que l'absence de liseré accent, pas le rayon.
- Correction : soit `rounded` 4px (contrôles du corps), soit étendre la doctrine :
  « la barre de filtres actifs prolonge le header → registre header » — une phrase
  dans design.md et l'écart disparaît. Trancher, ne pas laisser tacite.

**M6 — La barre-à-gauche est polysémique : trois sens sur le même canal.**
- Sélection : inset 2px accent — TaskRow.tsx:73, RoadmapGraph.tsx:450,577,
  RoadmapColumns.tsx:43, EpicBand.tsx:96,165, NotepadView.tsx:249, DocsTree.tsx:80.
- Imbrication : `border-l` 1px neutral-200 — TaskRow.tsx:151, EpicRow.tsx:265.
- Erreur : `border-l-4` neutral-900 — ui.tsx:85 (ErrorBanner, design.md:75 l'acte).
- Constat : trois sens différenciés par couleur ET épaisseur (2px accent / 1px gris /
  4px noir) — en pratique lisible, et une TaskRow sélectionnée dont les sous-tâches
  sont dépliées juxtapose bien barre accent puis barre grise sans collision de sens.
  MAIS la grille de décodage n'est écrite nulle part : c'est une cohérence de fait,
  pas de droit — le prochain composant qui pose un `border-l-2 accent` pour autre
  chose la casse sans le savoir.
- Correction : écrire le tableau des trois poids dans design.md (cf. doctrine
  recommandée). Aucune migration de code.

## BASSE

**B1 — `rounded-full` : la doctrine dit « progress bars only », le code a raison
contre elle.** Dots légitimes : TaskRow.tsx:101 (badge NEW accent),
UpdateNotice.tsx:102 (update dispo), FlowAreaChart.tsx:82,85 (légende). Jauges
conformes : RoadmapColumns.tsx:17, EpicRow.tsx:277, RoadmapGraph.tsx:553. Correction :
amender design.md:51 → « jauges + pastilles-points (un point est un cercle) ».
Convergence positive : le dot accent veut dire « nouveau » aux deux endroits où il
existe (TaskRow:101, UpdateNotice:102).

**B2 — `rounded-[3px]` : rayon hors échelle.** ViewHeader.tsx:137 (case à cocher du
FilterMenu). 4px existe ; un 3e rayon arbitraire pour 1px de différence. → `rounded`.

**B3 — Commentaire mensonger sur le Toast.** ui.tsx:168 : « Aligné sur le popup
Activity (filet neutral-200, shadow-lg, rounded-md…) » — le Toast (ui.tsx:166) est
CARRÉ (conforme design.md:49) et le « popup Activity » de référence a été supprimé
en #377 (ActivityView.tsx:8-10). Le code est bon, le commentaire enverra le prochain
contributeur arrondir le toast. → corriger le commentaire.

**B4 — Zone grise doctrine : les toolbars de vue.** KbView.tsx:73 (search), :96
(inferred), KbDisplayMenu.tsx:74 — `rounded-md` dans une toolbar de vue
(KbView.tsx:66, `px-4 py-1.5`) qui n'est PAS le header h-12 de design.md:47. Lecture
charitable : c'est un header de vue → registre header. À écrire (« tout bandeau
d'outils sommital = registre header ») sinon c'est un écart. KbView.tsx:148 en
revanche (bouton « En savoir plus », empty state, plein corps) devrait être
`rounded` 4px sans ambiguïté.

**B5 — L'accent comme couleur de SÉRIE dataviz.** FlowAreaChart.tsx:85 : accent =
« Fermés » (vs neutral-400 = « Créés »). 4e emploi de l'accent (ni actif, ni
sélection, ni attention). Inévitable en monochrome ; à documenter (« en dataviz,
l'accent marque la série la plus signifiante ») pour qu'il reste UNE série accent
par chart. Bon voisinage : Temperature.tsx:20 choisit exprès un bleu acier ≠ accent
« jamais confondu avec actif » — c'est la preuve que l'équipe sait faire.

**B6 — NavRail : dialecte propre.** NavRail.tsx:64-66 : `rounded-md` (ni header h-12
ni flottant) + actif = tint + `text-accent` sans border ni inset. Langage du rail
déjà traité par l'audit tokens — noté ici uniquement comme 3e variante du « actif »
à couvrir par la doctrine écrite (le rail est un chrome d'app : exemption
défendable, à écrire).

## Ce qui est DÉJÀ cohérent (à préserver)

- **Registre 1 bien propagé sur 7 surfaces** : TaskRow.tsx:73 ; RoadmapGraph.tsx:450
  (GraphCard — commentaire l.448 explicite « Sélection = langage du Backlog ») et
  :577 (liste latérale) ; RoadmapColumns.tsx:43 ; EpicBand.tsx:96,165 ;
  NotepadView.tsx:249 ; DocsTree.tsx:80 (ex-déviant gris, corrigé #113 avec
  commentaire citant §3.2).
- **KbGraph : traduction SVG fidèle du registre** — nœud dont l'inspecteur est
  ouvert = accent plein + halo (KbGraph.tsx:498-499, 513-514, 549-556, #320) ;
  hover/recherche = opacités intermédiaires, jamais le plein. Le plein accent
  reste réservé au courant : la hiérarchie du registre survit au changement de
  médium.
- **Hover de carte ≠ hover de rangée, systématique** : les cartes foncent leur
  BORDURE (EpicBand.tsx:97, RoadmapGraph.tsx:454 `hover:border-neutral-400`), les
  rangées teintent leur FOND. Distinction forme/sens propre : surface bordée parle
  par son bord, surface pleine-largeur par son fond.
- **Chips métadonnées** : carrées et inertes partout (Chip.tsx:12), trois familles
  monochromes documentées — conforme design.md:50,77.
- **Contrôles du corps** : fieldCls, ghostCls, boutons primaires/actionBtn tous
  `rounded` 4px (ui.tsx:17,26,35,37) ; Select compact documenté « rounded 4px comme
  tout contrôle du corps (design.md §1) » (ui.tsx:256).
- **Overlays flottants de graphe** : rounded-md homogène (KbGraph.tsx:316,328,333,648,
  RoadmapGraph.tsx:343) — conforme design.md:47.
- **Absences de sélection JUSTIFIÉES** : TaskPanel RelationRow (TaskPanel.tsx:158-178)
  et voisins KbNodePanel (KbNodePanel.tsx:82) — le sujet du panneau EST l'élément
  courant, ses relations ne peuvent pas l'être en même temps ; hover seul correct.
- **Convergence audit 6** : pointillé `3 3` = arête inférée/secondaire, cohérent
  dans les deux graphes (KbGraph.tsx:378,442,465,469) — non re-détaillé ici.

## (a) Doctrine de forme recommandée pour design.md

À insérer en §1 (remplace « Corner radii ») + §3.2bis :

1. **Le rayon encode la strate, jamais l'interactivité.**
   - `0` — cousu à la surface : rangées, cartes de liste/grille, chips, accordéons,
     bannières, toasts. (Les cartes Overview rentrent ici.)
   - `rounded` 4px — contrôle posé dans le corps d'une vue ou d'un panneau.
   - `rounded-md` 6px — chrome détaché du flux : contrôles du header ET de toute
     toolbar sommitale de vue, popups/popovers ancrés, overlays flottants de graphe.
     (Décision à acter : ui.tsx Select/Combobox popups migrent vers rounded-md — ou
     l'inverse, mais UNE famille.)
   - `rounded-full` — jauges et pastilles-points.
   - Trois rayons, zéro exception : `rounded-lg`, `rounded-[3px]` etc. sont des bugs.
2. **Deux registres « accent » et une règle de compatibilité.**
   - Registre COURANT (listes/cartes, hôtes carrés) : `bg-accent-tint` +
     `shadow-[inset_2px_0_0_var(--color-accent)]`. Obligatoire sur TOUTE surface où
     un item peut être « l'élément ouvert dans le panneau » — y compris Overview et
     Activity. Exemptions listées nommément (rail).
   - Registre ENCLENCHÉ (toggles/pills, hôtes arrondis) : `border-accent` +
     `bg-accent-tint`. **La barre inset ne se pose jamais sur un coin arrondi**
     (#311) — c'est le critère de choix entre les deux.
   - Le tint n'est JAMAIS un hover (le hover est gris) et JAMAIS posé sur un élément
     inerte (un warning est monochrome). Cas drop-target : à trancher explicitement.
3. **Canal barre-à-gauche — trois poids, trois sens** :
   `inset 2px accent` = élément courant · `border-l 1px neutral-200` = imbrication ·
   `border-l-4 neutral-900` = erreur. Toute nouvelle barre gauche choisit dans ce
   tableau ou n'existe pas.
4. **Accent en dataviz** : une seule série accent par chart (la plus signifiante),
   le reste en neutres ; les encodages « état » (température) prennent une teinte
   hors accent (précédent : Temperature.tsx:20).

## (b) Recommandations priorisées

1. **Propager le registre courant à Overview et Activity** (H1, H2) —
   OverviewView.tsx:111 et ActivityView.tsx:54, une ligne chacun, recette
   TaskRow.tsx:73. Corriger le commentaire mensonger OverviewView.tsx:104.
2. **Trancher le rayon des popups et supprimer rounded-lg** (H3, H4) — une famille
   de popup (recommandé : rounded-md partout → ui.tsx:278,335,432,519,606) ; cartes
   Overview (OverviewView.tsx:41) → carrées ; amender design.md:47-49.
3. **Déshabiller le badge stale de KbView** (H5) — KbView.tsx:109 passe au registre
   monochrome ; le costume border-accent+tint redevient exclusif aux contrôles
   enclenchés.
4. **Écrire la doctrine (a) dans design.md** (M1, M6, B4, B6) — les deux registres,
   la règle inset/coin-arrondi, le tableau barre-gauche, le statut des toolbars de
   vue et du rail. Zéro code, tue la moitié des dérives futures.
5. **Nettoyage du tint et du hover** (M2, M3, M4) — NotepadView.tsx:301 hover → gris,
   Segmented aligné ou commentaire corrigé, une règle de force de hover et alignement
   des déviants.
