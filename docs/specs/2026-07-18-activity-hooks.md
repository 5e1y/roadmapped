# Spec — Flux d'activité agent ultra précis (hooks Claude Code → onglet Activity)

Tâche #351 · 2026-07-18 · type 04-brainstorm · statut : validée dans son principe par Rémi (« go »)

## Le besoin (verbatim Rémi)

> « Avoir la main sur tout ce que fait l'agent pour avoir un onglet activité
> ultra précis. » — c'était le cœur de l'idée « terminal intégré ».

Aujourd'hui l'activité live du dashboard est **dérivée** : fs.watch sur
`docs/tasks/` (mutations de tickets) + le compteur d'usage (#345, appels
CLI/MCP). On voit les *conséquences* du travail de l'agent, jamais le travail
lui-même (éditions de fichiers, commandes, lectures).

## Le principe : la donnée structurée à la source, pas un terminal à parser

Un terminal embarqué (PTY) donnerait un flux de texte à re-parser, avec des
fondations lourdes (WebSocket, auth locale obligatoire — un PTY exposé en HTTP
local est de l'exécution de code offerte). Les **hooks Claude Code** donnent
la même information en JSON propre, à la source : un hook `PostToolUse`
reçoit chaque tool call de l'agent (tool, paramètres, session) sur stdin.

Le terminal redevient un nice-to-have cosmétique. Rien dans cette spec ne le
bloque plus tard ; rien n'en dépend.

## Architecture (tout le socle existe déjà)

```
Claude Code ── PostToolUse hook ──▶ POST /api/activity ──▶ ring buffer (mémoire)
                (script minuscule)          │                     │
                                            └── SSE /api/events ──▶ onglet Activity
```

- **Hook** : entrée `PostToolUse` (matcher `*`) dans `.claude/settings.json`
  du repo hôte, installée par le même mécanisme idempotent que le hook
  SessionStart (#122, `ensureSessionHook`, `scripts/install.mjs:168` — même
  logique marker-block : nos entrées reconnaissables, celles des autres
  préservées). Le script (`scripts/activity-hook.mjs`) lit le JSON stdin,
  extrait `{ts, session, tool, target}` et POST vers le dashboard. **Timeout
  court + échec silencieux** : dashboard éteint → le hook sort 0 immédiatement,
  l'agent n'est JAMAIS ralenti ni bloqué (même doctrine que usageLog #345).
- **`target`** : la donnée utile par tool — `file_path` pour Edit/Write/Read,
  la commande (tronquée ~120 chars) pour Bash, le nom du tool MCP + l'id de
  tâche si présent pour `mcp__roadmapped__*`. Une petite table de mapping,
  défaut = nom du tool seul. On ne transmet JAMAIS le contenu (ni diff, ni
  sortie) : métadonnées seulement — c'est ce qui rend l'opt-out simple à
  raisonner.
- **Serveur** : route `POST /api/activity` (pattern exact de `/api/usage`,
  `src/server/api.ts`) → **ring buffer mémoire** (500 événements, pas de
  fichier : l'activité est un flux, pas une archive — le compteur #345 garde
  les agrégats durables) → push SSE `activity` sur `/api/events` (socle #185,
  `src/server/api.ts:267`).
- **UI** : l'onglet Activity existant (LiveActivity/LiveActivityMenu) gagne la
  timeline temps réel : « édite src/foo.ts », « lance npx vitest », « done
  #341 ». Groupement par session, et **corrélation au ticket** : un événement
  est rattaché au ticket in_progress courant au moment T (jointure temporelle
  simple ; plusieurs in_progress → non attribué plutôt que mal attribué).
- **Événements CLI directs** (Rémi dans son terminal, hors agent) : déjà
  couverts par le fs.watch existant — hors périmètre ici.

## Décisions

1. **Métadonnées, jamais de contenu** — la timeline dit *ce que* l'agent fait,
   pas *ce qu'il écrit*. Simple, lisible, pas de question de fuite.
2. **Ring buffer, pas de persistance** — 500 événements en mémoire, perdus au
   restart du dashboard : c'est un flux live. Les agrégats durables restent au
   compteur #345.
3. **Fire-and-forget partout** — hook silencieux (exit 0 toujours), POST avec
   timeout ~300 ms ; le pire cas est « pas de ligne dans la timeline », jamais
   « l'agent attend ».
4. **Opt-in à l'install, opt-out à tout moment** — l'installation du hook est
   proposée par `roadmapped upgrade`/`init` (défaut OUI, question posée, même
   philosophie que la KB #324) ; retrait = supprimer l'entrée marker-block.
5. **Multi-repo prêt** — le hook lit le port du dashboard depuis le mécanisme
   d'annonce existant (#274) ; repo sans dashboard ouvert → échec silencieux.

## Ce que ça ne fait pas (assumé)

- Pas de capture des agents non-Claude-Code (Cursor, etc.) — le hook est un
  contrat Claude Code. Le jour où un autre hôte compte, même endpoint, autre
  émetteur.
- Pas de replay historique après restart (décision 2).
- Le format stdin exact du hook PostToolUse (noms de clés `tool_name`,
  `tool_input`, `session_id`) est à figer au ticket 1 contre la doc Claude
  Code du moment — le schéma interne `{ts, session, tool, target}` est stable,
  lui.

## Tickets d'exécution

1. **[02-feature]** Endpoint `/api/activity` + ring buffer 500 + event SSE
   `activity` (pattern /api/usage + socle #185). Tests : POST → visible dans
   le buffer, éviction FIFO, push SSE.
2. **[02-feature]** `scripts/activity-hook.mjs` + installation idempotente
   PostToolUse via le mécanisme marker-block de #122 (install/upgrade, défaut
   OUI, opt-out). Tests : mapping target par tool, échec silencieux sans
   dashboard, settings.json préservé.
3. **[05-design]** Onglet Activity : timeline temps réel, groupement session,
   corrélation ticket in_progress, états vides. Dépend de 1 (et de 2 pour la
   démo réelle).
