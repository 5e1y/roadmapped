// Loader .ts pour l'exécution DEPUIS node_modules (spec distribution, décision
// verrouillée : on ship les .ts bruts, zéro build à la publication).
//
// Constat d'implémentation (#139) : Node ≥ 22.18 strippe nativement les types,
// SAUF pour les fichiers sous node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING,
// restriction volontaire de Node, sans flag d'échappement). Installé chez un hôte,
// tout notre code .ts vit précisément là. Ce hook comble le trou avec `amaro` — le
// MOTEUR MÊME que Node embarque pour son strip-types (SWC) : mêmes sémantiques,
// mode strip-only (les positions de ligne sont préservées).
//
// Branché par :
//   - bin/roadmapped.mjs (proxy CLI et init/upgrade) : import avant tout .ts
//   - l'entrée .mcp.json et le hook guard posés par `roadmapped init` :
//     `node --import node_modules/roadmapped/scripts/register-ts.mjs …`
// En self-host (code hors node_modules), le hook est inutile mais inoffensif.

import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'amaro'

registerHooks({
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) {
      const filename = fileURLToPath(url)
      const { code } = transformSync(readFileSync(filename, 'utf8'), { mode: 'strip-only', filename })
      return { format: 'module', source: code, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})
