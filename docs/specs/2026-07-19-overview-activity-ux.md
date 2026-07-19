# Spec — Remaniement UX : Backlog épuré, Overview, Activity

Tâche #… · 2026-07-19 · type 04-brainstorm · décisions verrouillées avec Rémi

## Intention (Rémi)

Simplifier le flow : le **Backlog** redevient une liste pure, toutes les
visualisations migrent dans un **Overview** dédié, l'**Activity** devient un
onglet plein (fini l'overlay du header). Moins de bruit dans chaque écran, plus
de clarté UI, continuité du design system (le graphe de tags réutilise le
visualiseur Graphify).

## Décisions verrouillées

- **Overview par étapes** : d'abord squelette + les 2 graphes migrés + l'aperçu
  5 tickets ; puis le chart créés-vs-fermés dans un 2e temps.
- **Graphe de tags = KbGraph réutilisé tel quel** (adapter les tags au contrat
  de données, pas de nouveau visualiseur) — continuité DS.
- **Créés vs fermés = buckets hebdomadaires**.

## Constaté (repérage, ancres)

- Backlog flanc gauche : `Backlog.tsx` — `TypesRadar` l.173 + `TagGraph` l.174-181
  dans le `<div>` flanc l.169-183 (masqué quand un panneau est ouvert). Les chips
  de filtre actif (l.188-211) sont HORS du flanc et survivent sans lui.
- `TypesRadar.tsx` : radar 9 axes (types), rayon ∝ tickets ouverts. Props
  `counts: Map<key,count>`, `selected`, `onSelect`.
- `TagGraph.tsx` + `tagGraph.ts` : graphe nodal maison ; `tagGraph(tasks)` →
  `{nodes:{tag,count}[], edges:{a,b,weight}[]}` (co-occurrence, plafond 16).
- `KbGraph.tsx` : visualiseur cible. Props `{graph: KbGraphData, filters, query}`.
  `KbGraphData = {generatedAt, nodes: KbNode[], edges: KbEdge[], stats}`.
  `KbNode = {id,label,fileType,sourceFile,sourceLocation,community,rationale?}`,
  `KbEdge = {source,target,relation,confidence,weight}`. Couplage : KbSimDriver,
  kbLayout, kbFilter, et le clic-nœud ouvre `KbNodePanel` via `usePanel`.
- Activity : `LiveActivityMenu.tsx` (Popover du header) + état
  `state/LiveActivity.tsx` (`log: LiveEntry[]`, session, plafond 200, alimenté par
  le diff SSE `useTree().lastChange` → `eventsFromDiff`). `LiveEntry.at` = HH:MM:SS,
  `receivedAt` = epoch ms. Header : `ViewHeader.tsx` rend `<LiveActivityMenu/>` l.50.
- Helpers tickets (`roadmap.ts`) : `temperature()`, `nextQueue()` (temp desc),
  `ageInDays()` (NON exporté). Manquent : tri par ancienneté/récence exportés, et
  un bucketiseur créés-vs-fermés par semaine (aucun n'existe).

## Architecture cible

### Navigation (View → 8)
`'backlog' | 'overview' | 'roadmap' | 'dependencies' | 'graph' | 'activity' | 'docs' | 'notepad'`
Rail : mascotte · **séparateur** · Overview · Backlog · Roadmap · Dependencies ·
séparateur · Graph · Activity · Docs · Notes (ordre à affiner au build, mais
Overview en tête du groupe travail). Le bouton Activity QUITTE le header.

### Backlog
Retirer le `<div>` flanc gauche (radar + tag graph + leurs calculs/imports) →
liste pleine largeur. Les chips de filtre actif restent.

### Overview (nouvel écran, par étapes)
- **Étape 1** : squelette en grille de cartes (design.md tri-couche) contenant :
  1. le radar par type (TypesRadar déplacé) ;
  2. le graphe nodal des tags **via KbGraph** — adapter `tagGraph(tasks)` à
     `KbGraphData` (tag→KbNode `id=label=tag`, community par cluster ou 0,
     fileType factice ; co-occurrence→KbEdge `confidence:'EXTRACTED'`), `filters`
     neutre, clic-nœud NEUTRALISÉ (pas de KbNodePanel : un tag n'est pas un nœud
     de code) — soit no-op, soit à terme un filtre ;
  3. un aperçu **5 tickets** avec **3 bascules** : 5 plus urgents (température
     desc), 5 plus anciens (createdAt/id asc), 5 derniers ajoutés (createdAt/id
     desc). Une seule bascule active à la fois, état de session.
- **Étape 2** : chart **créés vs fermés par semaine** (buckets ISO-semaine sur
  createdAt vs completedAt) — burn-up implicite « on crée à l'infini ».

### Activity (nouvel écran)
Feed timestampé plein écran, version étendue de l'overlay : réutilise
`useLiveActivity().log`. `LiveEntry.at` n'a que l'heure → dériver le jour depuis
`receivedAt` pour grouper par jour (« Aujourd'hui », « Hier », date). Plus de
détail par entrée que l'overlay (verbe, #id + titre, heure). Reste session-only
(l'historique complet = git log, décision existante).

## Hors périmètre (assumé)

- Pas de persistance de l'activité (git log reste la source d'historique).
- Pas de nouvelles métriques au-delà de créés-vs-fermés + les 3 tris (on pose le
  cadre ; d'autres viz viendront par tickets séparés si besoin).
- Le clic sur un tag dans le graphe Overview : neutralisé étape 1 ; un filtrage
  tag→tickets est un ticket ultérieur (pas dans ce lot).

## Tickets d'exécution

1. **[05-design]** Rail + plomberie nav : séparateur mascotte↔items, items
   Overview & Activity, View→8, routes MainView (stubs Overview/Activity),
   retrait du bouton Activity du header. localStorage/title à 8 valeurs.
2. **[05-design]** Backlog → colonne unique : retrait radar + tag graph du flanc.
3. **[03-chore]** Helpers Overview : exporter `ageInDays`, ajouter tris
   `byAgeAsc`/`byRecentAdded`, bucketiseur `createdVsClosedByWeek` + tests.
4. **[02-feature]** Overview étape 1 : squelette + radar déplacé + graphe tags via
   KbGraph (adaptateur tagGraph→KbGraphData) + aperçu 5 tickets à 3 bascules. Dép 1,3.
5. **[02-feature]** Overview étape 2 : chart créés-vs-fermés hebdomadaire. Dép 3,4.
6. **[02-feature]** Activity : onglet feed timestampé (log groupé par jour). Dép 1.
