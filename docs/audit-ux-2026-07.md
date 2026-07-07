# Audit UX/UI — juillet 2026 (tâche #1)

**Méthode** : passe visuelle réelle au pixel (Playwright, viewport 1440×900, données = le backlog de lancement) sur les 5 vues + panneau, croisée avec 6 audits de code parallèles (un par zone de l'UI). Chaque finding est vérifiable dans les fichiers cités. Synthèse, tri et verdicts : Fable.

**Verdict global** : la base est saine (design monochrome cohérent, vue Graphe déjà très lisible, panneau complet) mais l'app « ment » à trois endroits : le mode Colonnes n'affiche pas les états disponible/verrouillé (alors que le Graphe le fait), Esc peut jeter une saisie en cours sans prévenir, et aucun champ ne confirme sa sauvegarde. Ce sont les priorités.

**Routage** : chaque finding pointe vers sa destination — *#7* = tâche de polissage (fix direct), *#2-#6* = matière pour la spec correspondante (panneau, création, graphe, docs, progression). Cocher ici au fur et à mesure (définition de fini de #7).

## Findings bloquants (résumé)

1. **Perte de saisie silencieuse sur Esc** — SidePanel écoute `keydown` global et démonte le panneau ; React ne déclenche pas `onBlur` au démontage → un champ en cours d'édition est perdu sans avertissement. Confirmé dans src/components/SidePanel.tsx:18. → *#7, fix immédiat*
2. **Le mode Colonnes n'affiche que `done`** — les cartes verrouillées et disponibles sont visuellement identiques (constaté au pixel : #7, #11, #13-15, #17-18 ressemblent aux disponibles). Le Graphe, lui, distingue les trois états. → *#7, réutiliser computeAvailability*

## Constats visuels (passe Playwright — captures)

- [ ] **[important]** [backlog] Les chips débordent en 2ᵉ ligne sur les titres longs (#6, #22) et cassent l'alignement des lignes → *#7* — réserver une zone chips fixe, tronquer avec « +n ».
- [ ] **[important]** [colonnes] Titres de cartes quasi tous tronqués à une ligne (l'info principale est illisible) → *#7* — autoriser 2 lignes + title en tooltip natif.
- [ ] **[important]** [shell] Sidebar quasi vide en vue Backlog : la spec V2 prévoit la liste des sections (accès direct/scroll) — espace mort aujourd'hui → *#7*.
- [ ] **[important]** [panel] Le textarea Détail (min-h 120px) rend illisible un detail long — lecture au lasso dans une lucarne → *#2* (mode lecture d'abord ?) ; à défaut auto-grow → *#7*.
- [ ] **[nice]** [backlog] « 22 tâches actives (1 faites) » : accord (« 1 faite ») ; « nextId 23 » est une info technique sans valeur pour l'humain → *#7*.
- [ ] **[nice]** [panel] Chemin du fichier YAML brut sur 2 lignes en tête de panneau — reléguer en pied de panneau → *#2*.
- [ ] **[nice]** [colonnes] Dernière colonne coupée au bord sans affordance de scroll horizontal → *#7*.
- [ ] **[nice]** [docs] Arbre replié par défaut (la vue paraît vide) et tutoiement « Sélectionne un document » incohérent avec le ton neutre du reste → *#5*.
- [ ] **[nice]** [graphe] La carte done #22 affiche des chips (core, M) que les cartes actives n'ont pas — contenu de carte incohérent selon l'état (cf. finding « Zone et taille » ci-dessous) → *#7*.

# Findings des auditeurs de code (46, triés par vue puis sévérité)

## Vue Backlog

- [ ] **[important]** L'état des accordéons (sections + sous-tâches) est perdu à chaque navigation, jamais persisté → *#7*
  - Fichiers : src/App.tsx, src/components/Backlog.tsx, src/components/SectionAccordion.tsx, src/components/TaskRow.tsx
  - Fix : Remonter l'état d'ouverture au niveau App/TreeProvider (ou le persister en localStorage par clé de section/tâche) et passer un `value`/`onValueChange` contrôlé à Accordion.Root, plus un état contrôlé pour les Collapsible de TaskRow. A minima, garder Backlog monté en le masquant en CSS (hidden) au lieu de le démonter dans MainView, pour préserver l'état natif Base UI entre les onglets. Idéalement ajouter un `defaultValue` ouvrant les sections `status==='open'` non vides au premier chargement.
- [ ] **[important]** Création de section : aucun état de chargement, double-soumission possible, erreurs réseau avalées → *#7*
  - Fichiers : src/components/Backlog.tsx
  - Fix : Ajouter un state `busy`, désactiver le bouton et court-circuiter onKey pendant l'appel (`disabled={busy}`), envelopper le fetch dans try/catch/finally et pousser le message d'échec dans `errors` (ex. « Échec réseau, réessayer »). Réinitialiser `busy` dans finally. Même traitement à prévoir côté panneaux de création de tâche.
- [ ] **[important]** Chips de tâche indifférenciés : code, zone, size, tags et source ont tous le même rendu gris → *#7*
  - Fichiers : src/components/TaskRow.tsx, src/components/Chip.tsx
  - Fix : Différencier les familles de chips en restant monochrome : préfixer/typer (ex. size en pastille pleine, tags avec un point, code en mono sans fond), ou varier subtilement le fond/bord entre catégories. Retirer le chip `source` de la ligne (le réserver au panneau détail) ou ne l'afficher que pour `source==='ai'`. Limiter/tronquer le nombre de tags affichés au-delà de N.
- [ ] **[important]** Une section vide, une fois dépliée, n'affiche rien (pas d'état vide) → *#7*
  - Fichiers : src/components/SectionAccordion.tsx
  - Fix : Afficher un état vide explicite quand `section.tasks.length === 0` : un texte discret « Aucune tâche » + un bouton « + première tâche » appelant openCreateTask(section.key), dans le style du reste (px-4 py-2.5 text-xs text-neutral-400).
- [ ] **[important]** Compteurs de tâches incohérents entre l'en-tête global et les en-têtes de section → *#7*
  - Fichiers : src/components/Backlog.tsx, src/components/SectionAccordion.tsx
  - Fix : Choisir une définition unique de « tâche ». Soit compter récursivement aussi dans SectionAccordion (réutiliser une fonction de comptage partagée), soit ne compter que le premier niveau partout et présenter les sous-tâches comme un sous-total distinct. L'essentiel est que la somme des sections = total de l'en-tête.
- [ ] **[nice]** Statut de section affiché en enum brut anglais dans une UI française → *#7*
  - Fichiers : src/components/SectionAccordion.tsx, src/components/glyphs.tsx
  - Fix : Mapper les statuts de section vers des libellés FR (ex. { done: 'terminée', dormant: 'en veille', abandoned: 'abandonnée' }) et, éventuellement, leur donner un rendu de chip distinct des tags (statut vs métadonnée).
- [ ] **[nice]** Aucun état vide global quand il n'y a aucune section, et rien n'invite à démarrer → *#7*
  - Fichiers : src/components/Backlog.tsx
  - Fix : Quand active.length === 0, afficher un état vide court (titre « Backlog vide », une phrase d'amorce) mettant en avant l'action « + section » plutôt que la ligne de compteurs à zéro.
- [ ] **[nice]** Formulaire de section : Échap/Annuler ne vide pas le champ, et les erreurs n'ont aucune affordance d'erreur → *#3*
  - Fichiers : src/components/Backlog.tsx, src/state/TreeContext.tsx
  - Fix : Réinitialiser `title` (et `errors`) dans les handlers Annuler/Escape pour repartir propre. Donner aux erreurs une affordance monochrome nette (bord/pastille à gauche, icône « ! », ou fond neutre-100) pour les distinguer d'un placeholder. Optionnellement, un discret indicateur de rechargement dans l'en-tête pendant reload.

## Side panel (tâche/section)

- [ ] **[bloquant]** Perte de saisie silencieuse quand on ferme avec Esc en cours d'édition → *#7*
  - Fichiers : src/components/SidePanel.tsx, src/components/TaskPanel.tsx, src/components/SectionPanel.tsx
  - Fix : Avant de fermer (handler Esc de SidePanel.tsx ligne 17-19 et bouton ✕ ligne 30), forcer la sauvegarde du champ actif : appeler (document.activeElement as HTMLElement)?.blur() puis close() dans un microtask, ou déplacer les listeners pour blur l'élément focus avant setTarget(null). Idéalement, aligner Esc et ✕ sur le même chemin qui blur d'abord.
- [ ] **[important]** Aucun feedback de sauvegarde : l'utilisateur ne sait jamais qu'un champ a été enregistré → *#7*
  - Fichiers : src/components/TaskPanel.tsx, src/components/SectionPanel.tsx
  - Fix : Ajouter un état de save par champ ou global (idle/saving/saved) : afficher un discret "Enregistré" éphémère (~1.5s, même pattern que setCopied) à côté du label du champ qui vient de sauver, ou un point/coche dans le Row. Réutiliser le vert "done" toléré pour la coche de succès reste cohérent avec la charte.
- [ ] **[important]** Les erreurs de validation s'affichent en haut du panneau, hors écran quand on édite un champ du bas → *#5*
  - Fichiers : src/components/TaskPanel.tsx, src/components/SectionPanel.tsx, src/components/SidePanel.tsx
  - Fix : Ancrer l'erreur près du champ concerné (le PATCH sait quel champ a échoué), ou à défaut scroller le bandeau dans la vue (errorRef.scrollIntoView) quand errors passe de vide à non-vide, et/ou marquer visuellement le champ fautif (bordure appuyée). Au minimum, remettre le focus/scroll sur l'erreur.
- [ ] **[important]** Les dépendances d'une tâche archivée sont totalement invisibles (info cachée) → *#5*
  - Fichiers : src/components/TaskPanel.tsx
  - Fix : En mode archived, remplacer le MultiCombobox éditable par un affichage lecture seule des dépendances (liste de chips #id titre non modifiables), au lieu de masquer tout le Row. Réutiliser dependItems/task.dependsOn pour résoudre les libellés.
- [ ] **[important]** Esc ferme le panneau entier même quand un menu Select/Combobox est ouvert → *#7*
  - Fichiers : src/components/SidePanel.tsx, src/components/ui.tsx
  - Fix : Ne fermer le panneau sur Esc que si aucun overlay Base UI n'est ouvert : écouter sur le conteneur plutôt que window, ou vérifier qu'aucun élément [data-open]/[role=listbox] n'est présent, ou s'appuyer sur le fait que Base UI stoppe la propagation de l'Escape quand le popup est ouvert (à vérifier — sinon gérer explicitement). À défaut, tester onKeyDownCapture et laisser le popup consommer l'Escape d'abord.
- [ ] **[important]** Normalisation silencieuse des champs CSV : la valeur affichée ment sur la valeur enregistrée → *#7*
  - Fichiers : src/components/TaskPanel.tsx
  - Fix : Après un save réussi, réafficher la valeur canonique dans le champ (passer ces champs en contrôlé, ou forcer e.currentTarget.value = task.<field> normalisé après reload). Pour Liens, avertir explicitement si des entrées non numériques ont été ignorées plutôt que de les jeter en silence.
- [ ] **[important]** Boutons d'action sans état de chargement : double-clic = doublons/actions répétées → *#7*
  - Fichiers : src/components/SectionPanel.tsx, src/components/TaskPanel.tsx
  - Fix : Ajouter un état pending (useState) mis à true au début de create/archive/remove et remis à false dans un finally ; désactiver le bouton (disabled) et changer son libellé ("Création…") pendant la requête. Cela couvre aussi la sauvegarde par champ le cas échéant.
- [ ] **[nice]** Les chips de dépendances ne sont pas tronqués et débordent sur les titres longs → *#7*
  - Fichiers : src/components/ui.tsx
  - Fix : Appliquer max-w-[...] + truncate (ou title=libellé pour le survol) sur le contenu du Combobox.Chip, cohérent avec le span.truncate déjà présent sur les items du dropdown.
- [ ] **[nice]** Le bandeau d'erreur est visuellement indistinct d'une boîte d'info neutre → *#7*
  - Fichiers : src/components/TaskPanel.tsx, src/components/SectionPanel.tsx
  - Fix : Donner au bandeau d'erreur un marqueur non coloré clair : un intitulé "Erreur" / une icône d'alerte, une bordure plus épaisse ou un fond plus contrasté (neutral-900 sur texte clair), pour le sortir du registre "info neutre" sans introduire de couleur.
- [ ] **[nice]** Bandeau d'erreur effacé par la réussite d'un autre champ, alors que la valeur fautive reste non enregistrée → *#7*
  - Fichiers : src/components/TaskPanel.tsx
  - Fix : Suivre les erreurs par champ (Record<field, string[]>) plutôt qu'un tableau global, afin qu'un succès sur un champ n'efface pas l'erreur d'un autre ; ou au minimum ne pas effacer les erreurs tant que le champ fautif n'a pas été re-sauvegardé avec succès.

## Roadmap — mode Colonnes

- [ ] **[bloquant]** La vue Colonnes n'affiche que done — les états "disponible" et "verrouillé" sont invisibles → *#2*
  - Fichiers : src/components/RoadmapColumns.tsx, src/lib/roadmap.ts, src/components/RoadmapGraph.tsx
  - Fix : Dans RoadmapColumns.tsx, importer computeAvailability depuis ../lib/roadmap, l'appeler une fois avec tree, et passer l'état (Availability) à TaskCard. Styliser la carte comme dans GraphCard : available = accent (bordure/point plus fort) + mention "Disponible", locked = teinte atténuée + "Prérequis manquants (#…)", done inchangé. Idéalement enrichir aussi le compteur d'en-tête de colonne (ligne 46) en "x done · y dispo · z bloquées" plutôt que le seul done/total.
- [ ] **[important]** Aucun état vide global : une roadmap sans section active affiche un écran blanc → *#7*
  - Fichiers : src/components/RoadmapColumns.tsx
  - Fix : Avant le return, si sections.length === 0, rendre un état vide explicite (ex. "Aucune section active. Crée une section dans le Backlog pour la voir apparaître ici.") avec le même style discret que les autres textes vides (text-neutral-500).
- [ ] **[important]** Les en-têtes de colonne (titre + compteur + barre) ne sont pas collants et disparaissent au scroll vertical → *#6*
  - Fichiers : src/components/RoadmapColumns.tsx, src/components/RoadmapView.tsx
  - Fix : Contraindre la rangée de colonnes à la hauteur du viewport (h-full sur le conteneur ligne 64) et donner à chaque colonne son propre scroll vertical interne, avec l'en-tête (lignes 43-49) en position sticky top-0 sur fond opaque. La barre horizontale reste alors ancrée en bas de l'écran et les en-têtes restent visibles.
- [ ] **[important]** Les sous-tâches sont invisibles et exclues des compteurs, sans le moindre indice sur la carte → *#7*
  - Fichiers : src/components/RoadmapColumns.tsx, src/lib/tasks.ts
  - Fix : Au minimum, afficher un indicateur de sous-tâches sur la carte quand task.subtasks.length > 0 (ex. "3/5 sous-tâches" ou un petit compteur), pour signaler le travail caché. Idéalement, décider explicitement si le compteur/barre de la colonne doit inclure les sous-tâches (flatten) et le rendre cohérent avec ce qui est affiché ; aujourd'hui c'est un angle mort silencieux.
- [ ] **[nice]** Le statut de section (dormant/done) et la note ne sont jamais restitués → *#7*
  - Fichiers : src/components/RoadmapColumns.tsx, src/lib/tasks.ts
  - Fix : Dans Column, afficher un badge discret pour tout status ≠ 'open' (ex. "dormant", "terminée") à côté du titre, et surfacer note en sous-titre (text-xs text-neutral-500) quand elle existe.
- [ ] **[nice]** Section vide : "0/0" et barre grise vide se lisent comme "0 % d'avancement" plutôt que "rien de planifié" → *#7*
  - Fichiers : src/components/RoadmapColumns.tsx
  - Fix : Quand tasks.length === 0, masquer le compteur et la barre de progression (ou remplacer par un tiret "—") et ne garder que le message d'état vide, pour ne pas suggérer une progression nulle là où il n'y a pas de périmètre.

## Roadmap — mode Graphe

- [ ] **[important]** Aucun zoom / pan / fit : le graphe n'est que scrollable et devient illisible à l'échelle → *#7*
  - Fichiers : src/components/RoadmapGraph.tsx, src/components/RoadmapView.tsx
  - Fix : Ajouter un contrôle de zoom (boutons +/- + molette Ctrl) et un pan (drag sur le fond), ou au minimum un bouton « ajuster à la largeur » qui applique un `transform: scale()` sur le `div.relative`. Idéalement une mini-carte. Le conteneur `overflow-auto` seul ne suffit pas au-delà de ~15 tâches.
- [ ] **[important]** Les cartes estompées laissent transparaître les arêtes (opacité posée sur tout le bouton) → *#7*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Ne pas mettre d'opacité sur le conteneur. Garder `bg-white` opaque et exprimer l'état estompé via la couleur du texte/de la bordure (ex. `text-neutral-400`, `border-neutral-200`) uniquement, ou dessiner un rectangle blanc plein sous chaque carte dans le SVG.
- [ ] **[important]** Une carte verrouillée cite des prérequis (#id) qui n'ont aucune carte dans le graphe → *#7*
  - Fichiers : src/components/RoadmapGraph.tsx, src/lib/roadmap.ts
  - Fix : Calculer `missing` à partir du même ensemble `nodeIds` que les arêtes, et/ou distinguer visuellement un prérequis hors-vue (« archivé/hors graphe ») au lieu de le lister comme un simple #id introuvable. Ne pas droper silencieusement les arêtes vers des prérequis existants mais non dessinés.
- [ ] **[important]** Arêtes sans direction (pas de flèche) et qui traversent les cartes des colonnes intermédiaires → *#7*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Ajouter des têtes de flèche (`marker-end`) pour la direction ; décaler les arêtes parallèles d'une même colonne sur des couloirs x distincts ; faire remonter les segments horizontaux dans les gouttières (COL_GAP) plutôt qu'au centre vertical des cartes traversées.
- [ ] **[important]** La couche topo GLOBALE sert de plancher de rangée par colonne → grandes bandes vides → *#2*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Calculer le plancher de rangée à partir de la profondeur INTRA-colonne (deps de la même section) et laisser les arêtes exprimer l'ordre inter-colonnes, ou compacter les rangées après placement. L'alignement vertical strict sur la couche globale n'apporte rien puisque les prérequis d'une autre colonne sont sur une autre abscisse.
- [ ] **[important]** Zone et taille affichées uniquement sur les cartes DONE — cachées sur les tâches actionnables → *#2*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Afficher les chips zone/size aussi sur les cartes `available` (et `locked`), en complément de la ligne de statut, plutôt que de les réserver à l'état `done`.
- [ ] **[important]** Aucune affordance de survol ni anneau de focus sur les cartes cliquables → *#2*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Ajouter un état de survol discret (`hover:border-neutral-400` ou léger fond) et un `focus-visible:ring-2 ring-neutral-900` pour rendre le focus clavier lisible et signaler l'interactivité.
- [ ] **[nice]** Aucun état vide → *#2*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Afficher un état vide explicite (« Aucune tâche à afficher dans le graphe ») quand `placed.length === 0`.
- [ ] **[nice]** Titres tronqués sans infobulle (cartes et labels de section) → *#2*
  - Fichiers : src/components/RoadmapGraph.tsx
  - Fix : Ajouter `title={task.title}` sur la carte et `title={s.title}` sur le label, et rendre le label `sticky top-0` pour qu'il reste visible au scroll.

## Vue Docs

- [ ] **[important]** La sidebar Docs n'est pas scrollable : les fichiers en bas sont inaccessibles → *#7*
  - Fichiers : src/components/Sidebar.tsx, src/App.tsx
  - Fix : Rendre la zone de l'arbre scrollable : ajouter `min-h-0` au <nav> et envelopper le bloc `view==='docs'` (ou l'ensemble liste + arbre) dans un conteneur `flex-1 min-h-0 overflow-y-auto`. Garder l'en-tête « Roadmaped » et la nav principale fixes, ne laisser scroller que l'arbre de fichiers.
- [ ] **[important]** Tri des fichiers non naturel : `10-x.md` passe avant `2-x.md` → *#2*
  - Fichiers : src/server/docs.ts
  - Fix : Utiliser un tri naturel : `a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })` pour les deux sorts (dirs et files).
- [ ] **[important]** Liens internes du markdown cassés : navigation hors SPA, ancres mortes, wikilinks bruts → *#7*
  - Fichiers : src/components/DocsView.tsx
  - Fix : Sur le conteneur `.doc-prose`, ajouter un onClick délégué qui inspecte `a[href]` : href commençant par `#` → preventDefault + scroll vers l'élément (et activer les id de headings via `marked` avec un heading-id/slugger) ; href relatif se terminant par `.md` (ou sans schéma) → preventDefault, résoudre relativement au docPath courant et appeler onSelectDoc ; href `http(s)` → laisser passer mais forcer `target=_blank rel=noopener`. Optionnellement, pré-transformer les `[[wikilinks]]` en liens .md avant parse.
- [ ] **[nice]** Extension `.md` affichée dans l'arbre et noms tronqués sans tooltip → *#2*
  - Fichiers : src/components/DocsTree.tsx, src/server/docs.ts
  - Fix : Afficher le nom sans l'extension `.md` (dériver un `label` à partir de `node.name`, en gardant `path` intact pour l'API), et ajouter `title={node.name}` sur le span du dossier et le bouton du fichier pour exposer le nom complet au survol.
- [ ] **[nice]** Tables larges débordent horizontalement (pas de conteneur scrollable comme pour <pre>) → *#4*
  - Fichiers : src/index.css, src/components/DocsView.tsx
  - Fix : Rendre les tables scrollables : `.doc-prose table { display: block; overflow-x: auto; }` (ou envelopper les tables via un renderer marked dans un `div` avec `overflow-x:auto`), en cohérence avec le traitement de `pre`.
- [ ] **[nice]** Incohérence de layout entre les états chargement / vide / erreur → *#7*
  - Fichiers : src/components/DocsView.tsx
  - Fix : Uniformiser : rendre l'état chargement dans le même gabarit que le contenu (ex. `mx-auto max-w-3xl px-8 py-10` avec un skeleton/placeholder discret) ou au minimum centré comme les états vide/erreur, pour éviter le déplacement de la zone de lecture.
- [ ] **[nice]** HTML brut du markdown rendu sans sanitisation (defense-in-depth manquante) → *#4*
  - Fichiers : src/components/DocsView.tsx
  - Fix : Ajouter une sanitisation légère du HTML rendu (DOMPurify sur le html, ou un renderer marked qui neutralise le HTML brut). Coût minime, supprime la surface même pour des docs non écrits par l'utilisateur.

## Shell global (nav, chargement, a11y)

- [ ] **[important]** La vue Roadmap avale les erreurs globales : écran vide sans message quand /api/tree échoue ou que le YAML est invalide → *#4*
  - Fichiers : src/components/RoadmapView.tsx, src/App.tsx, src/state/TreeContext.tsx, src/components/Backlog.tsx, src/components/RoadmapColumns.tsx
  - Fix : Remonter la gestion loading / loadError / errors au niveau du shell (App.tsx, dans MainView ou autour de <MainView/>), pour couvrir Backlog ET Roadmap d'un seul point : afficher « Serveur injoignable » + loadError si loadError, et l'écran de validation (comme Backlog l.84-100) si errors.length>0, avant de router vers la vue. À défaut, dupliquer dans RoadmapView.tsx les gardes loadError/errors présentes dans Backlog.tsx.
- [ ] **[important]** Aucun style focus-visible global : la navigation clavier est quasi invisible sur les contrôles du shell → *#4*
  - Fichiers : src/index.css, src/components/Sidebar.tsx, src/components/DocsTree.tsx, src/components/SidePanel.tsx
  - Fix : Ajouter dans index.css une règle globale monochrome, ex. `:focus-visible { outline: 2px solid #171717; outline-offset: 2px; border-radius: inherit; }`, et un offset clair/inverse pour les surfaces à fond noir (item de nav actif → outline blanc). Alternativement appliquer des utilitaires `focus-visible:ring-2 focus-visible:ring-neutral-900` (et ring blanc sur fond noir) sur chaque contrôle interactif du shell.
- [ ] **[important]** SidePanel : aucun transfert de focus à l'ouverture ni restauration à la fermeture → *#7*
  - Fichiers : src/components/SidePanel.tsx, src/App.tsx
  - Fix : Dans SidePanel (ou PanelHost dans App.tsx) : mémoriser `document.activeElement` à l'ouverture, déplacer le focus dans le panneau au montage (premier champ, ou le bouton ✕ / le <h2> rendu focusable), puis restaurer le focus sur l'élément mémorisé au démontage. Ajouter `role="dialog"` + `aria-label={title}` sur l'<aside>.
- [ ] **[nice]** Le titre de l'onglet ne reflète jamais la vue courante ni le document ouvert → *#7*
  - Fichiers : src/App.tsx, index.html
  - Fix : Dans Shell (App.tsx), un `useEffect([view, docPath])` qui met `document.title` à jour, ex. `Backlog · Roadmaped` / `Roadmap · Roadmaped` / `<nom du doc> · Roadmaped`.
- [ ] **[nice]** Dans la sidebar Docs, l'erreur de chargement est stylée exactement comme un placeholder vide → *#4*
  - Fichiers : src/components/Sidebar.tsx
  - Fix : Renforcer la ligne d'erreur : encre plus soutenue (`text-neutral-700`) et poids/label distinct (ex. préfixe « Erreur » en gras) pour la séparer des placeholders informatifs, tout en restant monochrome.
- [ ] **[nice]** L'état de navigation (vue + doc ouvert) n'est pas persisté : tout rechargement renvoie au Backlog → *#7*
  - Fichiers : src/App.tsx
  - Fix : Refléter view/docPath dans le hash d'URL (ex. `#/roadmap`, `#/docs/<path>`) et réhydrater l'état au montage, ou à défaut persister dans localStorage.

---
*Tâches concernées : #1 (cet audit), #7 (polissage — coche les items #7 ici), #2 #3 #4 #5 #6 (specs — reprendre les items routés).*
