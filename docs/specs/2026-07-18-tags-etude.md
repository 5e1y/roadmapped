# Étude — pourquoi les agents frais ne taggent pas (fix ou kill)

Tâche #344 · 2026-07-18 · type 04-brainstorm · décision finale = Rémi

## Constat

Sur d'autres repos utilisant Roadmapped, les agents frais taggent peu leurs
tickets. Question à trancher d'abord : **les tags méritent-ils d'exister ?**
Si oui → fix pas cher. Si non → retrait propre façon archive (#154).

## Données (ce repo, dogfooding)

- 338 tâches, **264 (78 %) portent ≥1 tag** — mais ce repo est l'atelier de
  Rémi, briefs riches ; il ne reflète PAS un repo à agents frais. Le taux élevé
  ici vient du contexte humain, pas de la surface agent.
- **569 occurrences, 86 tags uniques.** **28 tags (33 %) utilisés une seule
  fois**, 15 utilisés 2–3 fois → **50 % du vocabulaire est un long-tail ≤3
  usages** : vocabulaire anarchique quand les tags SONT écrits.
- Tag `debt` : 14 usages, **load-bearing** (voir consommateurs).

## Hypothèses — confirmées/infirmées (preuves)

**(a) Le skill n'exige jamais de tags → CONFIRMÉE.** Chaque mention est optionnelle :
`SKILL.md:66-67` (`[--tags a,b]`), `references/formats.md:83` (`tags: [bug, perf]
# free-form, [] if none`), `references/setup.md:40` (« Set … `--tags` … »). Zéro
obligation, zéro nudge. Un agent en économie de tokens ne remplit que le requis
(`add` : `section` + `title` seuls sont `required`, `mcp-server.mjs:307`).

**(b) Vocabulaire libre, aucun feedback → CONFIRMÉE.** Le schéma MCP du param `tags`
est `{ type: 'array', items: { type: 'string' } }` — **sans description, sans enum,
sans exemples** dans `add` (`mcp-server.mjs:297`), `quick` (`:349`), `update`
(`:433`). L'agent **ne voit les tags existants NULLE PART** dans sa surface : pas
dans le schéma `add`, pas dans la sortie `list` (elle liste des tâches, pas le
vocabulaire), pas dans `brief`/`sitrep`, et aucune erreur (free-form, jamais
rejeté). Le SEUL endroit où le vocabulaire est exposé est le Creatable du
dashboard (`TaskPanel.tsx:401-402`, `allTags = …flatMap(t.tags)`) — **jamais vu
par l'agent.** Résultat : abstention, ou sprawl (86 tags, 50 % ≤3 usages).

**(c) Aucun payoff visible pour l'agent → CONFIRMÉE en grande partie.** Les
consommateurs riches sont **dashboard-only (humain)** : `TagGraph.tsx` (carte des
thèmes, rendu `Backlog.tsx:178`), filtre + chips tags (`Backlog.tsx:117,195`),
affichage 3 tags/ligne (`TaskRow.tsx:140`). Côté agent, un seul payoff visible :
la **convention `debt`** — `sitrep` flague les items ouverts (`render.ts:222-223`,
`active.filter(t => t.tags.includes('debt'))`) et `list --tag debt` sort le ledger.
Un agent frais qui n'ouvre jamais le dashboard n'a donc **aucune raison de tagger,
sauf `debt`.**

## Les tags méritent-ils d'exister ? → OUI

1. **`debt` est load-bearing** (`render.ts:222`) : c'est l'équivalent queryable du
   commentaire `ponytail:`, flaggé par sitrep. Kill tags = kill le ledger de dette
   → il faudrait un remplaçant.
2. **TagGraph = une feature entière** du dashboard (carte des thèmes). Kill = mort
   de TagGraph + du filtre Backlog.
3. **Côté humain, les tags SONT consommés** (filtre, graphe, autocomplete).

Le problème n'est donc pas le concept, c'est que **la surface agent est aveugle.**

## Options et coûts

| Option | Coût | Effet |
|---|---|---|
| **A. Kill complet** (façon #154) | L (retrait app+CLI+MCP+skill) + **remplaçant debt obligatoire** + perte TagGraph | Détruit de la valeur humaine réelle. Non. |
| **B. Intermédiaire** — tags gardés pour l'humain, retirés de la surface agent | M | **Incohérent** : `debt` EST une surface agent load-bearing. Il faudrait l'exempter → on retombe sur un fix. |
| **C. Fix pas cher** — rendre la surface agent tag-aware | **S** | Lève (a) et (b) sans rien casser. |

Détail du fix C :
- **Description dynamique du tool MCP** : `makeTools(ROOT, …)` a déjà `ROOT`
  (`mcp-server.mjs:82`). Calculer au boot les top-N tags en usage
  (`readTree(ROOT)` → comptage) et les injecter dans la `description` du param
  `tags` de `add`/`quick`/`update` (ex. « réutilise le vocabulaire existant :
  ux, design, graphify, kb, dashboard… ; `debt` est load-bearing »). Une fois au
  démarrage, coût token nul en régime.
- **+1 ligne dans le skill** : à `add`/`quick`, nudger « réutilise un tag existant
  du projet ; `debt` est load-bearing (ledger de dette) ». Pas d'obligation dure
  (un tag vide reste valide) — juste rendre le vocabulaire et le payoff visibles.

## RECOMMANDATION — FIX (option C), ne pas kill

Kill est cher (retrait L + remplaçant debt + perte TagGraph) et détruit une valeur
humaine bien consommée. L'intermédiaire est incohérent avec `debt`. Le vrai défaut
est un **trou de feedback dans la surface agent** — exactement le genre de chose
qu'une description dynamique + une ligne de skill corrigent pour un coût S. On ne
force pas le tag (un agent frugal doit pouvoir s'abstenir) ; on rend le vocabulaire
et le seul payoff agent (`debt`) **visibles**, ce qui suffit à faire converger le
vocabulaire et à récupérer le taggage utile.

## Tickets de suite proposés (titres prêts)

1. **[03-chore]** « MCP add/quick/update — injecter le vocabulaire de tags en usage
   dans la description du param `tags` (description dynamique au boot, top-N depuis
   readTree) » — tags: `mcp`, `token-economy`.
2. **[03-chore]** « Skill roadmapped — 1 ligne nudge : réutiliser un tag existant,
   `debt` load-bearing (à `add`/`quick`) » — tags: `skill`.
3. *(optionnel, plus tard)* **[04-brainstorm]** « Faut-il borner le vocabulaire de
   tags (enum souple / merge du long-tail ≤3 usages) ? » — tags: `process`,
   `data-model`. À n'ouvrir que si le fix ne suffit pas à endiguer le sprawl.
