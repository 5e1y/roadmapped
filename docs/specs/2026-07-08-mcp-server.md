# Spec — Serveur MCP Roadmaped : le schéma de tool remplace la doc dans le contexte

**Date** : 2026-07-08 · **Statut** : APPROUVÉE par Rémi le 2026-07-08 (brainstorm : distribution, coexistence, périmètre v1)
**Brainstorm** : 3 questions tranchées (distribution repo-local `.mcp.json` ; coexistence CLI+MCP sur le même noyau ; périmètre v1 = couverture complète des 14 commandes).

## Contexte et diagnostic

Le CLI est déjà machine-first, mais il reste du bash à formater (guillemets, virgules,
`--flags`), des sorties texte à parser, et le `--help`/les messages d'erreur occupent
le contexte pour documenter la surface. L'étage final de l'économie de tokens (annexe
pt 6 de `2026-07-07-token-economy.md`) : exposer les commandes comme **tools MCP aux
schémas auto-documentés**. Le schéma de tool (typé, décrit, injecté UNE fois par le
protocole) REMPLACE la doc du CLI dans le contexte ; l'agent appelle un tool structuré
au lieu d'assembler une ligne de commande ; la sortie est structurée, sans bruit de
formatage. Les écritures restent validées + rollback par `taskWrites` — source unique
conservée, zéro second chemin d'écriture.

## Décisions (et alternatives écartées)

1. **Distribution : script repo-local référencé dans `.mcp.json`** (décision Rémi).
   `scripts/mcp-server.mjs` vit dans le repo ; `.mcp.json` committé à la racine le
   lance (`node scripts/mcp-server.mjs`). Zéro publish, zéro install, toujours la
   version du repo — cohérent avec l'éthos « tout est fichier local, pas de SaaS ».
   *Écartés* : `npx roadmaped-mcp` (dépend d'une publication npm + round-trip réseau au
   démarrage) ; install global (étape d'install + versioning par machine).
2. **Coexistence CLI + MCP sur le même noyau** (décision Rémi). MCP = surface préférée
   de l'AGENT ; le CLI `task.mjs` reste pour l'humain, les scripts, la CI, les tests.
   **Les deux appellent `src/lib/taskWrites.ts` + `roadmap.ts`** — aucun second schéma,
   aucune logique dupliquée. *Écartés* : MCP primaire/CLI en secours (statut asymétrique
   à maintenir) ; MCP remplace le CLI (casse scripts/CI/tests + le geste humain terminal).
3. **Périmètre v1 : couverture complète** (décision Rémi). Les 14 verbes deviennent des
   tools dès la v1 : `sitrep`, `take`, `brief`, `next`, `show`, `list`, `roadmap`,
   `validate` (lecture) ; `add`, `quick`, `start`, `done`, `update`, `archive`
   (écriture). *Écartés* : boucle de session seule, lecture seule d'abord (gain token
   partiel, l'agent garde du bash pour le reste).

## Décisions techniques (défauts raisonnables, non soumis au brainstorm)

- **SDK officiel `@modelcontextprotocol/sdk`, transport stdio** — une dépendance qui
  porte tout le protocole JSON-RPC ; l'écrire à la main serait fragile (rung 4 ponytail :
  une lib qui résout vs réinventer). Node ≥ 22.18 (strip types natif, comme le CLI).
- **Rendu partagé extrait vers `src/lib/`** : `briefText`, la composition de `sitrep`,
  `refLine`/`taskLine` vivent aujourd'hui dans `scripts/task.mjs` (CLI-only). Ils
  migrent dans `src/lib/render.ts` (pur, testable) ; le CLI les réimporte (zéro
  régression, ses tests restent verts) et les tools MCP les réutilisent. Le résolveur
  d'ancres (`refExtract.ts`) et la fraîcheur git sont déjà réutilisables.
- **Forme de sortie d'un tool** : chaque tool renvoie du `structuredContent` (l'objet
  validé — deps/links titrés, refs, etc.) ET un `content` texte concis (le même rendu
  dense que le CLI) — le modèle lit le texte, un client structuré peut lire l'objet.
- **`inputSchema` = la doc** : chaque tool porte un `description` court et un schéma de
  params typé/décrit (l'équivalent du `CMD_USAGE` par commande). C'est CE schéma qui
  remplace `--help` dans le contexte.
- **Erreurs** : une erreur métier (flag manquant, team hors enum, dépendance, cycle)
  revient en `isError` avec le MÊME message autoportant que le CLI (réutilisé depuis le
  noyau). Le rollback de `taskWrites` s'applique tel quel.
- **Concurrence** : les écritures héritent du verrou global (#77/#83) via `taskWrites` —
  le serveur MCP n'ajoute aucune sérialisation propre.

## Détails d'implémentation

- `scripts/mcp-server.mjs` : instancie le serveur SDK, enregistre les 14 tools, chaque
  handler appelle la fonction `taskWrites`/`roadmap`/`render` correspondante (le même
  corps que le `cmd*` du CLI, sans le `console.log`). Démarre sur stdio.
- `.mcp.json` committé à la racine + note d'activation dans le guide (redémarrer Claude
  Code pour charger le serveur ; coexiste avec le skill CLI).
- `src/lib/render.ts` : rendu partagé (extraction depuis `task.mjs`), couvert par les
  tests existants du CLI (qui continuent de passer via réimport) + un test direct léger.
- Chemins : le serveur résout `tasksDir` via `loadPaths()` (même `roadmaped.config.json`
  que le CLI). Il tourne dans le CWD du repo consommateur.
- Tools d'écriture : `add`/`quick`/`start`/`done`/`update`/`archive`/`take` renvoient la
  tâche résultante en `structuredContent` ; `done` conserve l'autofill HEAD (#71) et les
  warnings non bloquants (sans refs) passent en champ `warnings` de la sortie.

## Hors périmètre (explicitement)

Authentification/serveur distant (le serveur est local, stdio uniquement) ; un tool
`reveal`/Notepad (appartient à #76) ; ressources MCP (resources/prompts) — v1 = tools
seuls ; toute rupture de compat du schéma YAML ; le dashboard web (inchangé).

## Critères de fini

1. `.mcp.json` committé lance `scripts/mcp-server.mjs` ; Claude Code liste les 14 tools
   après redémarrage (vérifié en session réelle : un `sitrep` et un `take` via tool).
2. Un cycle complet PAR TOOLS (sitrep → take → done) sur un sandbox, sans une seule
   commande bash — écriture validée, YAML relu conforme.
3. `src/lib/render.ts` extrait ; les tests CLI existants restent verts (zéro régression),
   plus un test direct du rendu partagé.
4. Une écriture invalide via tool (team hors enum, cycle de deps) revient en `isError`
   avec le message autoportant du noyau ; rollback vérifié (arbre inchangé).
5. Tests + build verts ; guide mis à jour (catalogue des tools + activation `.mcp.json`).
