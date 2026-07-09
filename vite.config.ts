import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { packageRoot, loadPaths } from './src/lib/paths'
import { roadmappedApi } from './src/server/api'

const paths = loadPaths()

export default defineConfig({
  // The dashboard source (index.html, src/) lives in the PACKAGE — not in the
  // host repo. `roadmapped dashboard` runs Vite with cwd = host repo: without this
  // explicit root, Vite would look for index.html in the host.
  root: packageRoot(),
  plugins: [react(), tailwindcss(), roadmappedApi()],
  // Host-install (#202) : root = le paquet, mais les deps se résolvent depuis les
  // node_modules de l'HÔTE. Si l'hôte hoiste une copie du stack React (ex. un projet
  // avec zustand → use-sync-external-store), Vite ne pré-bundle pas ces CJS et sert le
  // CJS brut comme de l'ESM → exports default/nommés manquants → React ne monte jamais
  // (#root vide, écran blanc, alors qu'index.html renvoie 200 — le piège). On FORCE le
  // pré-bundle de tout le stack + les shims pour exposer les exports. En standalone le
  // graphe diffère et ça finissait pré-bundlé par chance — la config ne doit pas en dépendre.
  optimizeDeps: {
    include: [
      'react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime',
      'use-sync-external-store/shim', 'use-sync-external-store/shim/with-selector',
    ],
  },
  // Une seule copie de React (celle du paquet), même si l'hôte a la sienne.
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    fs: {
      // tasksDir/docsDir may live outside the package: Vite blocks them with a 403
      // without this allowlist. Paths come from the config loader (roadmapped.config.json),
      // no hardcoded '..'. ⚠️ Specifying fs.allow REPLACES Vite's defaults:
      // the package root must be re-included, or index.html itself 403s.
      allow: [packageRoot(), paths.tasksDir, paths.docsDir],
    },
    // The data (task YAML, markdown docs) is NOT part of the module graph:
    // it's read via /api/*. Without this exclusion, every save (UI, CLI, agent)
    // triggers a FULL PAGE RELOAD — the panel used to close mid-edit (bug caught
    // with Playwright).
    watch: {
      ignored: [`${paths.tasksDir}/**`, `${paths.docsDir}/**`],
    },
  },
  test: {
    environment: 'jsdom',
  },
})
