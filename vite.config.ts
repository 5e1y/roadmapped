import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { packageRoot, loadPaths } from './src/lib/paths'
import { roadmappedApi } from './src/server/api'

const paths = loadPaths()

export default defineConfig({
  // La source du dashboard (index.html, src/) vit dans le PAQUET — pas dans le
  // repo hôte. `roadmapped dashboard` lance Vite avec cwd = repo hôte : sans ce
  // root explicite, Vite chercherait index.html chez l'hôte.
  root: packageRoot(),
  plugins: [react(), tailwindcss(), roadmappedApi()],
  server: {
    fs: {
      // tasksDir/docsDir peuvent être hors du paquet : Vite les bloque en 403 sans
      // cet allowlist. Chemins fournis par le loader de config (roadmapped.config.json),
      // plus de '..' en dur. ⚠️ Spécifier fs.allow REMPLACE les défauts de Vite :
      // il faut ré-inclure la racine du paquet, sinon index.html lui-même est 403.
      allow: [packageRoot(), paths.tasksDir, paths.docsDir],
    },
    // Les données (tasks YAML, docs markdown) ne font PAS partie du graphe de
    // modules : elles se lisent par /api/*. Sans cette exclusion, chaque
    // sauvegarde (UI, CLI, agent) déclenche un FULL-RELOAD de la page — le
    // panneau se fermait en pleine édition (bug constaté au Playwright).
    watch: {
      ignored: [`${paths.tasksDir}/**`, `${paths.docsDir}/**`],
    },
  },
  test: {
    environment: 'jsdom',
  },
})
