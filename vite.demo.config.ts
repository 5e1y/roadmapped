import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { packageRoot } from './src/lib/paths'

/*
 * Build DÉMO (#148) : `npm run build:demo` → dist-demo/, un bundle statique
 * autonome du dashboard avec le backlog démo embarqué (src/demo/). Aucun
 * serveur, aucune API — le shim fetch (src/demo/api.ts) répond à tout.
 *
 * Séparé du vite.config.ts normal EXPRÈS : le build de l'app (dist/) et le
 * dev server (plugin API, fs.allow, watch) ne changent pas d'un octet.
 *
 * `base: './'` : le bundle est copié tel quel dans le repo du site sous
 * /demo/ — les assets doivent se résoudre en relatif, pas depuis la racine.
 */
const root = packageRoot()

export default defineConfig({
  root,
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      // Rollup nomme la page comme son input (index.demo.html) ; le site la
      // sert comme index de /demo/ → renommage en index.html à la fin du build.
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
