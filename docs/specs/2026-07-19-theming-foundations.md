# Spec — Fondations theming : palette sémantique, recettes d'état, tokens de forme

2026-07-19 · type 04-brainstorm · epic `theming-foundations`
Prérequis : l'epic `ds-consistency` (base token propre) doit être clos (C4 inclus).

## Intention (Rémi)

Refonte UI + repasse DS pour ALLÉGER, qui pose les FONDATIONS du multi-theming.
Le cœur de la demande : **un jeu FERMÉ et petit de « recettes » sémantiques** —
un `active` identique partout, un `hover` unique, un `selected` unique, etc. —
chacune définie UNE fois et appelée modulairement dans les éléments ; **plus une
palette plafonnée à ~9 couleurs**. Couleur ET forme/densité tokenisées. But final :
re-skinner l'app = éditer une poignée de définitions ⇒ un thème est trivial.

## L'acquis (la fondation existe à moitié)

Le mode sombre (#269) est DÉJÀ un swap de tokens (`:root[data-theme="dark"]`),
zéro variante `dark:` — l'architecture « un thème = un set de tokens » est en place
pour 2 thèmes. La repasse `ds-consistency` a tué les hex en dur et posé les 2
premières recettes (`rowStateClass` #380, `TogglePill` #381). Ce lot GÉNÉRALISE
ça : de 2 thèmes numériques → N thèmes sémantiques ; de 2 recettes → un système
complet ; d'une échelle piochée au jugé → 9 rôles nommés.

## Décisions verrouillées

- **Portée d'un thème** : couleur + forme/densité (tokeniser la forme, pas que la couleur).
- **Modèle** : thèmes INTÉGRÉS nommés, l'utilisateur en pique un (sélecteur).
- **Palette** : ≤ 9 couleurs, SÉMANTIQUES (rôles), pas une échelle numérique.
- **États** : un jeu fermé de recettes modulaires ; un `active` (etc.) unique partout.

## 1. Le contrat de tokens (le cœur)

### 1a. Palette sémantique — 9 rôles (proposition, à valider)

Remplace l'échelle `neutral-50…900` (10 pas ad hoc) + accent/tint/page/card par
9 RÔLES. Chaque élément appelle un rôle, jamais un numéro :

| Rôle (token) | Ex. valeur light | Rôle |
|---|---|---|
| `--bg` (page) | #fafafa | fond de page |
| `--surface` (card) | #ffffff | cartes, panneaux, flancs, popups |
| `--surface-hover` | #f5f5f5 | survol de rangée/surface |
| `--border` | #e5e5e5 | filets, séparateurs, bordures inertes |
| `--text` | #171717 | texte primaire (encre) |
| `--text-muted` | #737373 | méta, labels (plancher contraste #108) |
| `--text-faint` | #a3a3a3 | désactivé / décoratif SEULEMENT |
| `--accent` | #2563eb | actif, sélection, in_progress |
| `--accent-bg` | #eef3fd | fond d'accent (tint : sélection, toggle actif) |

9 tokens. Chaque thème (dont light/dark actuels) = ces 9 valeurs. Migration : tout
`neutral-N`/`bg-white`/`accent-tint` du code → le rôle correspondant (codemod
guidé par une table de correspondance N→rôle ; le gros du travail du lot).
*Note contraste* : `text-faint` n'est JAMAIS du texte porteur de sens (garde #108).

### 1b. Tokens de FORME/densité

Le thème porte aussi (aujourd'hui en dur dans les classes) :
- **rayons** : `--radius-control` (4px), `--radius-chrome` (6px) — déjà 2 rayons (design.md §1), à passer en tokens.
- **densité** : une échelle d'espacement de rangée/gap tokenisée (`--row-y`, `--gap`)
  — c'est le levier « alléger » (un thème « aéré » = `--row-y` plus grand) et « dense ».
- **poids de trait** viz : `--stroke` (1.5) déjà unifié (#386).

### 1c. Recettes d'état — jeu FERMÉ, modulaire

Un module unique (ex. `src/lib/stateStyles.ts` ou dans `ui.tsx`) exporte LA recette
de chaque état sémantique ; les éléments l'APPELLENT, ne la réécrivent jamais :

| Recette | Sémantique | Aujourd'hui |
|---|---|---|
| `current(on)` | rangée courante (ouverte dans le panneau) | `rowStateClass` (#380) ✓ |
| `toggled(on)` | contrôle enclenché | `TogglePill` (#381) ✓ |
| `hover` | survol de rangée / surface | dispersé (neutral-50 vs 100) |
| `disabled` | inactif | dispersé |
| `invalid` | erreur de champ | ErrorBanner + ad hoc |
| `focus` | focus visible | global `:focus-visible` ✓ |

Les 2 premières existent — le lot COMPLÈTE le jeu et migre tous les inlines dessus.
« Petit et fermé » = on ne crée pas de 7e recette sans décision.

## 2. Modèle de thème

- Un thème = un objet `{ nom, tokens: {les 9 couleurs + forme} }`, rendu comme un
  bloc `:root[data-theme="<nom>"]` (généralise le mécanisme light/dark existant).
- **Registre** de thèmes intégrés (light, dark, + les nouveaux) + un **sélecteur**
  (le ThemeToggle actuel évolue en sélecteur N-thèmes) + persistance (`ui:theme`,
  déjà là ; l'anti-flash script gère déjà `data-theme`).
- La page **Design System** (#388) devient le banc d'essai : elle rend déjà tous
  les tokens/états — changer de thème dessus les fait tous basculer, preuve vivante.

## 3. Phasage

- **P1 — Contrat** : figer la table des 9 rôles (light+dark) + tokens de forme +
  le jeu de recettes. Écrire le CSS des tokens + les recettes. **Gate de validation
  Rémi** (la table couleur a un rayon d'explosion max).
- **P2 — Migration** : codemod `neutral-N`/hex → rôles sémantiques sur toute l'app ;
  migrer tous les états inline sur les recettes. Le gros du diff. Tests + captures.
- **P3 — Registre + sélecteur** : N thèmes, picker, persistance. Ajouter 1-2 thèmes
  de démo pour prouver la bascule (dont un « aéré » qui joue sur la densité).
- **P4 — Alléger** : une fois tout tokenisé, régler les tokens (moins de filets,
  plus d'air, type plus léger) — ça propage partout d'un coup. C'est LA refonte
  visuelle, devenue un réglage de tokens plutôt qu'une passe fichier par fichier.

## 4. Risques / stratégie

- **Rayon d'explosion de P2** : chaque `neutral-N` de l'app change. Mitigation :
  table de correspondance validée en P1, codemod scripté + revue, captures avant/après
  clair ET sombre, suite verte à chaque étape.
- **Perte de nuance** : passer de 10 neutres à ~3 rôles de gris (border/muted/faint)
  peut aplatir des hiérarchies fines. Mitigation : la table P1 mappe chaque usage
  actuel à un rôle ; les cas qui n'entrent pas révèlent un vrai besoin (à trancher,
  pas à multiplier les tokens en douce).
- **design.md** : §1 (Tokens) est réécrit autour des 9 rôles + tokens de forme ; §3.2
  (états) pointe les recettes. Le doc reste la source de vérité.

## Tickets (proposés — P1 d'abord, gate avant P2)

1. **[04-brainstorm]** P1 — figer la table des 9 rôles sémantiques (light+dark, mapping
   depuis l'échelle actuelle) + tokens de forme + jeu de recettes. Livrable : la table
   validée + design.md §1 réécrit. GATE Rémi avant migration.
2. **[03-chore]** P1b — poser la couche token (CSS des 9 rôles × thèmes + module de
   recettes d'état), sans encore migrer les usages.
3. **[03-chore]** P2 — codemod : migrer tout le code sur les rôles + recettes.
4. **[02-feature]** P3 — registre de thèmes + sélecteur N-thèmes + persistance.
5. **[05-design]** P4 — thème(s) allégé(s) : régler les tokens (air, filets, poids).
