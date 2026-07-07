# Roadmaped

Gestion de projet locale pour founders pilotés par agent IA — mix Obsidian × Linear, sans base de données : **des fichiers YAML/markdown plats dans votre repo sont la seule source de vérité**.

- **Backlog** : sections + tâches (`docs/tasks/`), CRUD complet depuis le dashboard.
- **Roadmap** : vos sections vues comme des jalons — dépendances façon arbre d'achievements (fait / disponible / verrouillé, calculé, jamais stocké).
- **Docs** : votre `docs/` en lecture, rendu markdown.
- **Agent-first** : un CLI (`scripts/task.mjs`) et un skill Claude (`skills/roadmaped/`) pour que votre agent crée specs, tâches et dépendances au bon format — et consigne ce qu'il livre.

## Démarrer

```bash
npm install
npm run dev          # dashboard sur http://localhost:5173
node scripts/task.mjs --help
```

À la première utilisation dans un repo, le skill exécute une phase de **setup** : il inventorie vos ROADMAP/TODO/plans existants et les convertit au format Roadmaped, avec votre accord.

## Principes

Simplicité radicale · fichiers plats éditables à la main · toute écriture est validée puis rollback si invalide · les ids ne sont jamais réutilisés · jalons sans dates.
