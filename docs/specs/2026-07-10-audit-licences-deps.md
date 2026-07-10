# Audit des licences des dépendances (#218)

Date : 2026-07-10 · Verdict : **✅ compatible distribution MIT, aucun bloqueur.**

Roadmapped est distribué en open-source MIT (github:5e1y/roadmapped, installé
en devDep chez l'utilisateur). Question : l'arbre de dépendances contient-il du
copyleft (GPL/LGPL/AGPL) incompatible, ou des attributions obligatoires ?

## Méthode

Scan de l'intégralité de `node_modules` (277 paquets, deps transitives
comprises) — champ `license` de chaque `package.json`. Pas de nouvel outil
ajouté (ponytail : un walk de 20 lignes suffit, `license-checker` non installé).

## Répartition

| Licence | Paquets |
|---|---|
| MIT | 242 |
| ISC | 15 |
| Apache-2.0 | 7 |
| BSD-3-Clause | 4 |
| BSD-2-Clause | 3 |
| MPL-2.0 | 2 |
| MIT-0 | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| UNKNOWN | 1 |

**Aucune GPL / LGPL / AGPL.** Tout le reste est permissif ou copyleft faible au
niveau fichier.

## Les cas non-« MIT pur » à documenter

| Paquet | Licence | Rôle | Verdict |
|---|---|---|---|
| `lightningcss` (+ `-darwin-arm64`) | MPL-2.0 | build (Tailwind v4) | OK. MPL = copyleft **au niveau fichier** ; on l'utilise non modifié comme dépendance → aucune obligation au-delà de conserver ses avis. Non embarqué dans le runtime livré. |
| `caniuse-lite` | CC-BY-4.0 | données browserslist (build) | OK. Attribution à caniuse.com — satisfaite par le `LICENSE` que le paquet embarque. Non livré dans le bundle runtime. |
| `argparse` | Python-2.0 | dép. de `js-yaml` | OK. Permissive, compatible GPL/MIT. |
| `@csstools/color-helpers` | MIT-0 | build (Tailwind) | OK. Plus permissif que MIT (attribution non requise). |
| `trinil-react` | UNKNOWN | **notre** paquet (icônes/UI) | À corriger **dans son repo** : ajouter `license: MIT` à son `package.json`. Hors périmètre de ce repo ; suivi séparé. |

## Attributions

Aucune attribution agrégée (fichier `NOTICE`) requise : Roadmapped se distribue
**en source via npm/GitHub**, et npm conserve le `LICENSE` de chaque paquet dans
`node_modules/`. Les avis voyagent donc avec l'installation. Un `NOTICE`
concaténé ne deviendrait nécessaire que si l'on livrait un **bundle unique
minifié** — ce n'est pas le cas (le dashboard est bâti par Vite chez l'hôte).

## Suivi

- [ ] Poser `license: MIT` dans `trinil-react/package.json` (repo séparé).
