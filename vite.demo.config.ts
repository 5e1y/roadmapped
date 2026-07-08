import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { packageRoot } from './src/lib/paths'

/*
 * DEMO build (#148): `npm run build:demo` → dist-demo/, a standalone static
 * bundle of the dashboard with the demo backlog embedded (src/demo/). No
 * server, no API — the fetch shim (src/demo/api.ts) answers everything.
 *
 * Split from the normal vite.config.ts ON PURPOSE: the app build (dist/) and the
 * dev server (API plugin, fs.allow, watch) don't change by a single byte.
 *
 * `base: './'`: the bundle is copied as-is into the site repo under
 * /demo/ — assets must resolve relatively, not from the root.
 */
const root = packageRoot()

export default defineConfig({
  root,
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      // Rollup names the page after its input (index.demo.html); the site
      // serves it as /demo/'s index → rename to index.html at the end of the build.
      name: 'roadmapped-demo-index',
      async closeBundle() {
        await rename(
          resolve(root, 'dist-demo/index.demo.html'),
          resolve(root, 'dist-demo/index.html'),
        )
      },
    },
  ],
  build: {
    outDir: 'dist-demo',
    emptyOutDir: true,
    rollupOptions: { input: resolve(root, 'index.demo.html') },
  },
})
