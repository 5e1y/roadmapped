# Handoff — mettre à jour le site marketing (roadmapped-site)

**Date** : 2026-07-11 · **Pour** : l'agent qui travaille sur `5e1y/roadmapped-site`
(Cloudflare Pages). **Auteur du brief** : l'agent du repo produit `5e1y/roadmapped`.
**Ticket** : #273.

Ce document dit **quoi mettre à jour sur le site et pourquoi**. Il ne réécrit pas le
site : il te pointe vers la copy canonique et t'explique ce qui a changé dans le
produit, pour que tu adaptes le site (sa structure peut différer) sans réinventer le
message.

## Sources de vérité (dans le repo `5e1y/roadmapped`, à lire d'abord)

1. **`docs/site-copy.md`** — LA copy de la landing, déjà mise à jour. C'est ta source
   texte : porte-la sur le site, section par section (Hero, Features, How it works,
   Built by using it, Quickstart, Privacy, Open source, Footer). Adapte au layout du
   site, mais ne t'écarte pas du sens.
2. **`docs/tone-of-voice.md`** — la voix de Rémi, à appliquer À LA LETTRE : direct,
   pince-sans-rire, jamais de hype, transparence désarmante, anti-marketing assumé.
   Toute phrase que tu ajoutes doit passer ce test. Le site actuel a déjà ce ton
   (« There's no step 2. We checked. ») — garde-le.
3. **`README.md`** et **`docs/guide.md`** — la vérité sur le FONCTIONNEMENT. En cas de
   doute technique, ils priment sur toute mémoire du site.

## Pourquoi cette mise à jour : ce qui a changé dans le produit

Le site risque de véhiculer des choses désormais FAUSSES. Corrige chacune :

### 1. Le modèle : plus de « stages » ni de « teams » — des TYPES et une TEMPÉRATURE
- **Avant** : le backlog était organisé par ÉTAPES (stages, un « quand ») et par ÉQUIPES
  (teams, un « qui »). **C'est mort.**
- **Maintenant** : un seul axe — **9 TYPES fixes** = la NATURE du livrable
  (`bug · feature · chore · brainstorm · design · marketing · communication · legal ·
  business`), une colonne par type dans le dashboard. Et la priorité est une
  **TEMPÉRATURE calculée** (0–100) qui monte avec l'ancienneté et le nombre de tâches
  bloquées — pas une date, pas un rang d'étape. C'est un angle fort et honnête : « pas
  de dates pour se mentir ». Toute mention de stages/teams/dates/deadlines → à retirer.

### 2. Distribution : GitHub-only, JAMAIS npm
- On ne publie PAS sur le registre npm. L'install se fait depuis GitHub :
  `npx --yes github:5e1y/roadmapped init` puis `npm install`.
- Bannis toute formulation « `npm install roadmapped` » / « available on npm » / badge
  npm. Le CTA et le Quickstart montrent la forme `github:5e1y/roadmapped`.

### 3. Install LÉGÈRE — le dashboard est livré compilé
- **Avant** : `roadmapped dashboard` lançait un serveur de dev (Vite) → l'install tirait
  tout le stack front (~110 Mo) dans le repo de l'utilisateur.
- **Maintenant** : le dashboard est **livré pré-compilé** (un bundle statique). Un petit
  serveur Node le sert. L'install pèse **~30 Mo** (surtout le SDK MCP), pas une chaîne de
  build front. C'est un argument à mettre en avant (« léger », « rien à builder chez
  toi »). Ne dis PAS « no build step » de façon absolue : le CLI/MCP tournent en `.ts`
  brut (loader Node), mais le dashboard, lui, EST buildé (juste : pas chez l'utilisateur).

### 4. Le dashboard : app locale, live, PAS un SaaS ni une app native
- C'est un **serveur local** lancé par `npx roadmapped dashboard`, qui sert une app web
  dans le navigateur que tu as déjà. Il **se met à jour en live** (SSE) quand l'agent
  écrit une tâche — sans reload. **4 vues** (Backlog, Roadmap, Docs, Notepad) via des
  onglets dans le header. **Toggle clair/sombre** + un lien « report an issue ».
- Ce n'est **pas** hébergé, **pas** un compte à créer, **pas** une app à télécharger
  (donc : aucune histoire de « download », d'installeur, de notarisation). Si le site
  laisse entendre l'un de ces trois → à corriger.

### 5. Prérequis : Node ≥ 22.18 + un `package.json` (v1 Node-only)
- À afficher honnêtement (Quickstart/section requirements). Repo non-Node (Python/Go/
  Rust) : ajouter un `package.json` minimal, ou suivre depuis un repo Node voisin. Le
  support non-Node de première classe est sur la roadmap, pas en v1 — ne le promets pas.

### 6. Dark mode (nouveau)
- Le dashboard a un vrai mode sombre avec bascule. Mentionnable (feature « light and
  dark »). **Si le site embarque une démo/capture animée du dashboard** : réplique le
  petit script anti-flash (pose `data-theme` avant le 1er paint) pour que la démo ne
  flashe pas — sinon, en sombre, un flash blanc au chargement. Le script est dans
  `index.html` du repo produit (miroir exact à copier dans la page qui héberge la démo).

## Ce qu'il faut ARRÊTER de dire (checklist de suppression)

- [ ] `npm install roadmapped` / « on npm » / badge npm → remplacer par la forme GitHub.
- [ ] stages / étapes / phases / teams / équipes / dates / deadlines / gantt.
- [ ] toute suggestion d'install lourde, ou de builder le dashboard soi-même.
- [ ] SaaS / compte / login / « sign up » / hébergé / cloud (sauf pour dire qu'il n'y en
      a pas).
- [ ] app native / téléchargement / installeur / « download for Mac ».
- [ ] « no toggle to maintain, the OS already has one » (ancienne copy dark mode) → il y
      a maintenant un toggle ; la ligne démo a déjà été corrigée dans site-copy.md.

## Ce qu'il faut METTRE (résumé des messages à faire passer)

- Ton repo EST ton outil de gestion de projet ; on ajoute juste l'interface.
- Fichiers plats (YAML/markdown), une seule source de vérité, tu review le diff.
- Agent-first : CLI + skill Claude, l'agent crée et consigne au bon format.
- 9 types, priorité = température calculée (pas de dates).
- Dashboard local, live (SSE), clair/sombre, 4 vues ; rien d'hébergé.
- Install GitHub-only, légère (~30 Mo), Node ≥ 22.18.
- MIT, local, `rm -rf` = suppression de compte. Gratuit, pour de vrai.

## SEO / meta

- `<title>` et meta description alignés sur la promesse (« Your repo is already your
  project management tool »). Mots-clés cohérents avec le `package.json` du repo produit
  (project-management, ai-agents, claude, local-first, flat-file, yaml, cli, roadmap,
  backlog, open-source). OG image / preview à jour (pas de vieux mark/logo retiré).
- Liens : le repo GitHub `https://github.com/5e1y/roadmapped`, le guide
  (`docs/guide.md` sur GitHub), et non des URLs mortes.

## Critères de fini (le site est « bien ficelé » quand)

1. Zéro item de la checklist de suppression ne subsiste (grep : `npm install roadmapped`,
   `stage`, `team`, `deadline`, `download`, `sign up`).
2. Le CTA et le Quickstart montrent les commandes RÉELLES (`github:5e1y/roadmapped`), et
   la section requirements affiche Node ≥ 22.18 + `package.json`.
3. Les features reflètent : types + température, dashboard local/live/clair-sombre,
   install légère, agent-first, validated writes.
4. La copy est fidèle à `docs/site-copy.md` et respecte `tone-of-voice.md`.
5. Si une démo du dashboard est embarquée : script anti-flash présent, aucun flash blanc
   au chargement en sombre.
6. Liens et OG/preview corrects.
