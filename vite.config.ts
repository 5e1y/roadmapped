import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { dashboardRoot, loadPaths } from './src/lib/paths'
import { roadmappedApi } from './src/server/api'

const paths = loadPaths()

export default defineConfig({
  plugins: [react(), tailwindcss(), roadmappedApi()],
  server: {
    fs: {
      // tasksDir/docsDir sont hors de dashboard/ : Vite les bloque en 403 sans
      // cet allowlist. Chemins fournis par le loader de config (roadmapped.config.json),
      // plus de '..' en dur. ⚠️ Spécifier fs.allow REMPLACE les défauts de Vite :
      // il faut ré-inclure la racine du dashboard, sinon index.html lui-même est 403.
      allow: [dashboardRoot(), paths.tasksDir, paths.docsDir],
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
