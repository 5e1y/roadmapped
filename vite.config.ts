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
