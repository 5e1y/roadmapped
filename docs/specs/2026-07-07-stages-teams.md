# Spec — Stages fixes (Idea→Mature) + Teams : refactor de l'organisation

**Date** : 2026-07-07 · **Statut** : DRAFT — en attente d'approbation Rémi
**Tâche** : #39 · **Référence visuelle** : docs/assets/refs/inspo-stages-*.png
**Décisions Rémi** : stages fixes de lancement produit ; teams fixes ; stages stricts avec
vides estompés ; `team` obligatoire, enum fixe, **remplace `zone`**.

## Vision

Roadmaped assume son identité : **un outil pour lancer un produit**, pas un backlog
générique. La roadmap de tout projet suit LA séquence universelle d'un lancement — les
colonnes ne sont plus configurables, elles racontent toujours la même histoire, du premier
éclair d'idée à l'entreprise mature. Chaque tâche porte l'équipe métier qui la réalise :
le **stage** dit *quand*, la **team** dit *qui*.

## Modèle de données

### Stages — les 8 sections canoniques (STRICT)

Les sections libres disparaissent. `docs/tasks/` contient exactement ces 8 dossiers :

| Dossier | Titre | Esprit (note par défaut à l'init) |
|---|---|---|
| `01-idea` | Idea Stage | L'idée initiale, sa validation, le problème/la cible. |
| `02-initial` | Initial Stage | Nom, repo, structure juridique — l'existence du projet. |
| `03-identity` | Identity Stage | Marque, domaine, présence sociale, positionnement. |
| `04-build` | Build Stage | Construire le produit ET ses fondations business (site, emails, comptabilité). |
| `05-gtm` | GTM Stage | Go-to-market : contenu, outbound, acquisition payante. |
| `06-launch` | Launch Stage | Lancer : produit, site, moteur de contenu, qualification. |
| `07-scale` | Scale Stage | Monitoring, SEO, communauté, deals, billing, support. |
| `08-mature` | Mature Stage | Referral, legal & compliance, intégrations avancées. |

- **Validation stricte** : `validate` rejette tout dossier de section hors de ce set
  (slugs exacts), et exige la présence des 8. `_archive/` reste le miroir des stages.
- `_section.yaml` conserve son format (`title`, `status`, `note`) : `title` est fixé au
  titre canonique (validation), `status` garde `open|done|dormant` (un stage traversé se
  marque `done`), `note` reste libre — pré-remplie à l'init avec l'esprit du stage
  (embryon des best practices, enrichi plus tard par le starter kit, cf. #12).
- **La création de section disparaît** : CLI (pas de commande), API `POST /api/sections`
  supprimée, bouton « + section » retiré du dashboard. Le setup crée les 8 stages.

### Team — nouveau champ, obligatoire, REMPLACE `zone`

```yaml
team: engineering   # marketing | sales | support | operations | finance | legal | engineering | design
```

- **Enum stricte** (8 valeurs, minuscules), **obligatoire** sur toute tâche active
  (la validation rejette null/absent/valeur inconnue). Sous-tâches comprises.
- **`zone` est supprimé du schéma** : type, parse, FIELD_ORDER (team prend sa place),
  validation, CLI (`--zone` → erreur « flag inconnu », `--team` requis sur `add`),
  panneau (Select ghost 8 valeurs au lieu de l'input libre), cartes, brief agent.
- L'information « quelle partie du code » vit déjà dans `refs` (fichiers) et les tags —
  perte assumée (décision Rémi).

### Invariants nouveaux (validate.ts)

1. Ensemble de sections actives = exactement les 8 slugs canoniques.
2. `title` de chaque `_section.yaml` = titre canonique du stage.
3. `team` présent et ∈ enum sur toute tâche active (l'archive n'est pas re-validée,
   comme aujourd'hui — les tâches archivées AVANT ce refactor gardent `zone`).

## Vues (dashboard)

- **Roadmap (Colonnes + Graphe)** : toujours les 8 colonnes, dans l'ordre. **Stage vide =
  estompé** : en-tête gris clair, compteur « 0 », colonne resserrée (~180px) sans corps —
  le chemin complet reste visible (référence : l'app des screens), l'énergie va aux stages
  peuplés. Un stage `done` s'affiche normalement (coche + barre pleine).
- **Backlog** : accordéons = les 8 stages (mêmes règles d'estompage pour les vides,
  repliés par défaut). « + tâche » partout ; « + section » supprimé.
- **Badge team** : sur chaque ligne (Backlog) et carte (Colonnes/Graphe), chip monochrome
  discrète (`eng`, `mkt`, `sales`… abréviations 3-5 car.). Le panneau affiche la team en
  Select ghost.
- **Filtre team** : dans la sidebar (sous la liste des stages), liste des 8 teams avec
  compteur ; clic = filtre toutes les vues (multi-sélection, persisté en localStorage).
  Une team sans tâche est estompée.

## CLI & skill

- `add --section <stage> --title … --team <team>` (requis) ; `update --team` ;
  `list --team <t>` (filtre) ; `show`/`next`/`roadmap` affichent la team.
- Le brief agent (« Copier le brief agent ») remplace `Zone :` par `Team :`.
- `skills/roadmaped/` : SKILL.md, formats.md (schéma team + stages canoniques), setup.md
  (l'init crée les 8 stages ; l'inventaire de l'existant se mappe vers les stages),
  workflows.md (le découpage d'une spec choisit stage + team par tâche).

## Migration du backlog actuel (ce repo)

Script one-shot (jetable, hors CLI) qui déplace les fichiers et réécrit les YAML, puis
`validate`. Mapping proposé (aligné sur l'app de référence : « Build marketing website »
est en Build, « Launch marketing website » en Launch) :

| Tâches actuelles | Stage cible | Team |
|---|---|---|
| 01-produit (toutes : panneau, specs UX, accent…) | `04-build` | engineering (design pour #4 graphe v2 si souhaité) |
| 02-open-source #8 #9 #10 #11 #12 | `04-build` | engineering |
| 02-open-source #13 (publication repo) | `06-launch` | engineering |
| 03-skill-claude #14 (préparer) | `04-build` | engineering |
| 03-skill-claude #15 (publier marketplace) | `06-launch` | engineering |
| 04-site #16 (copy) | `03-identity` | marketing |
| 04-site #17 (build landing) | `04-build` | marketing |
| 04-site #18 (déploiement + domaine) | `06-launch` | marketing |
| 05-lancement #19 (stratégie comms) #20 (contenus) | `05-gtm` | marketing |
| 05-lancement #21 (lancement coordonné) | `06-launch` | marketing |
| #39 (cette spec) et suites | `04-build` | engineering |

`01-idea` et `02-initial` naissent `done` de fait (l'idée et le repo existent) — on y crée
a posteriori 2-3 tâches déjà faites (« Idée initiale », « Préparer le repo ») pour que la
progression raconte l'histoire vraie, comme dans l'app de référence. `07-scale` et
`08-mature` naissent vides (estompés).

## Périmètre / hors-périmètre

**Dans** : schéma + validation, CLI, API, les 3 vues + panneau + filtre team, migration de
ce repo, mise à jour du skill et du guide (sections concernées).
**Hors** (chantiers suivants, déjà trackés) : starter kit de docs best practices par
domaine et notes de stage enrichies (→ spec #12 distribution), skills « stratégie de
lancement » (→ section 03), progression globale et milestones bloquants (→ spec #6 — les
stages fixes lui simplifient la vie), icônes/pixel-art des cartes (« le fun ensuite »).

## Critères de fini

1. `validate` rejette : un 9e dossier de section, un slug non canonique, une tâche sans
   team ou avec une team inconnue (tests TDD).
2. Ce repo migré : 8 stages, toutes les tâches actives portent une team, `validate` OK,
   `next` sert une tâche sensée du stage le plus tôt.
3. Roadmap : 8 colonnes toujours affichées, stages vides estompés et resserrés
   (capture) ; badge team sur cartes et lignes ; filtre team fonctionnel et persisté.
4. Panneau : team éditable en Select ghost (8 valeurs), plus aucune trace de zone dans
   l'UI ni le brief agent.
5. CLI : `add` sans `--team` refuse ; `--zone` = flag inconnu ; skill/références à jour
   (le cycle add→start→done rejoué de bout en bout dans un sandbox).
6. `npm run test` + `npm run build` verts.
