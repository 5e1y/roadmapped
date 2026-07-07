# Spec — Panneau de détail de tâche v2 (« lecture d'abord »)

**Date** : 2026-07-07 · **Statut** : DRAFT — en attente d'approbation Rémi
**Tâche** : #2 · **Nourrie par** : docs/audit-ux-2026-07.md (items routés *#2*)
**Brainstorm** : 4 questions tranchées avec Rémi le 2026-07-07 (paradigme, navigation, done guidé, feedback).

## Contexte

Le panneau actuel (TaskPanel.tsx) est un formulaire permanent : chaque champ est un input, même
quand on ne fait que lire — cas majoritaire. L'audit UX a montré que la lecture y est pénible
(détail dans un textarea de 120px, chemin technique en tête, dépendances en ids nus) et l'édition
risquée (aucun feedback de sauvegarde, erreurs affichées hors écran, perte de saisie possible).

## Décisions (et alternatives écartées)

1. **Paradigme « lecture d'abord, édition au clic »** (pattern Linear/Notion). Le panneau est une
   page lisible ; cliquer un champ le rend éditable, blur/Entrée sauvegarde. *Écartés* : formulaire
   permanent réorganisé (lire ≠ lire-dans-des-inputs), toggle Lire/Éditer (un mode mental de plus).
2. **Navigation en place avec pile** : cliquer une tâche liée charge sa fiche dans le panneau,
   bouton ← et Esc remontent la pile avant de fermer. *Écartés* : remplacement sec (on perd son
   fil), aller-à-la-tâche dans la vue (brusque, dépendant de la vue active).
3. **Done guidé** : bouton d'action contextuel (Démarrer / Terminer…) ; « Terminer… » ouvre un
   mini-formulaire inline — outcome **requis**, vérification et commit optionnels. Parité avec la
   discipline CLI. *Écartés* : statut libre + rappel (changelog troué), strict-partout (rigide).
4. **Feedback inline par champ** : ✓ fugace sur le champ sauvé ; erreur de validation SOUS le champ
   fautif, saisie conservée ; Toast (Base UI) réservé aux erreurs réseau/rollback. *Écartés* :
   barre d'état en pied (loin du geste), toasts-pour-tout (bruyant, lien champ↔erreur perdu).

**Contrainte transverse (Rémi)** : composants **Base UI au maximum** — Collapsible, Select,
Combobox, Menu, Tooltip, Toast, Dialog… avant tout composant maison.

## Design

### Structure du panneau (haut → bas)

1. **En-tête** : `#id` + glyphe de statut + bouton ← (si pile non vide) + ✕. Titre en gros
   (éditable au clic). Ligne de chips : statut · size · zone · code · tags (cliquables → édition).
2. **Action de cycle de vie** : bouton contextuel — `todo` → « Démarrer » ; `in_progress` →
   « Terminer… » (mini-formulaire inline : outcome requis, vérification, commit, release) ;
   `done` → « Archiver ». Le Select de statut reste accessible en mode édition de la chip statut
   pour les corrections (rollback d'un done, retour à todo), mais **toute transition vers done,
   quel que soit le chemin, passe par le mini-formulaire** — pas de contournement du done guidé.
3. **Détail** : rendu **markdown** (lib `marked`, styles typographiques de la vue Docs), pleine
   hauteur naturelle. Clic → textarea auto-grow ; Cmd/Ctrl+Entrée ou blur sauvegarde.
4. **Relations** (listes de titres cliquables, navigation pile) :
   - *Dépend de* : titre + état (✓ done / disponible / verrouillée) ; les archivées AFFICHÉES
     avec badge « archivée » (fini les deps invisibles).
   - *Bloque* : **dépendances inverses, calculées** (nouveau) — les tâches dont `dependsOn`
     contient cette tâche.
   - *Sous-tâches* : liste avec glyphes de statut + compteur x/y.
   - *Liens* (`links`) : titres cliquables.
   - Édition : « Dépend de » et « Liens » gardent le MultiCombobox Base UI (au clic sur ✎).
5. **Références** (`refs`) : liste verticale, un chemin par ligne (fini l'input CSV illisible) ;
   édition en textarea une-ref-par-ligne. Les refs `docs/**/*.md` sont cliquables → vue Docs.
6. **Consignation** (bloc read-only) : dates, commit, outcome, vérification, release — rempli par
   le done guidé ou le CLI. Éditable au clic (correction), pas mis en avant.
7. **Pied** : chemin du fichier YAML (déplacé de l'en-tête), bouton « Copier le brief agent ».

### Comportements transverses

- **Esc en cascade** : menu/combobox ouvert → le ferme (comportement Base UI natif, le keydown
  global ne doit plus court-circuiter) ; champ en édition → blur + sauvegarde ; sinon → dépile la
  navigation ; pile vide → ferme le panneau. Plus AUCUNE perte de saisie par Esc.
- **Focus** : à l'ouverture, focus sur le panneau (aria-label = titre) ; à la fermeture, retour au
  déclencheur. Tab circule dans le panneau (pas de piège).
- **Champs CSV honnêtes** : tags édités en chips + input (ajout/suppression unitaire) ; ce qui est
  affiché est exactement ce qui est enregistré (fini la normalisation silencieuse).
- **Archivée = lecture seule** : la fiche se consulte et se navigue normalement, bandeau
  « archivée », aucune édition au clic.
- **Boutons d'action** (Terminer, Archiver, Supprimer) : état busy pendant l'appel, double-clic
  impossible.

### API / données

- Aucun nouveau champ YAML. « Bloque » et l'état des deps sont **calculés** côté client depuis
  l'arbre (`computeAvailability` existant dans src/lib/roadmap.ts).
- `PATCH /api/tasks/:id` inchangé. Le done guidé envoie `{status:'done', outcome, verification,
  commit, release}` en un seul PATCH (updateTask le supporte déjà).

## Périmètre / hors-périmètre

**Dans** : TaskPanel réécrit, SidePanel (pile + Esc en cascade + focus), SectionPanel aligné sur
le même paradigme lecture-d'abord, wiring des refs vers la vue Docs.
**Hors** : création de tâche (spec #3), éditeur markdown riche (textarea suffit), historique des
modifications, wikilinks doc→tâche (V3), tout changement de schéma YAML.

## Critères de fini

1. Ouvrir une tâche = lecture confortable sans un seul input visible ; détail markdown rendu.
2. Naviguer #2 → dep → dep, revenir par ← puis Esc jusqu'à fermeture : la pile est exacte.
3. Terminer une tâche depuis l'UI exige un outcome et l'écrit dans le YAML (relu sur disque).
4. Éditer un champ → ✓ visible ; provoquer une erreur de validation → message sous le champ,
   saisie conservée ; couper le serveur → toast réseau.
5. Esc ne peut plus perdre une saisie (testé : édition en cours + Esc + rouvrir = valeur sauvée).
6. `npm run test` et `npm run build` verts ; composants Base UI utilisés partout où un équivalent
   existe.
