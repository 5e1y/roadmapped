import { OPEN_DOC_EVENT } from '../lib/events'
import type { KbNode } from '../server/kb'

/**
 * Navigation vers le FICHIER d'origine d'un nœud KB — partagé par le voisinage
 * du TaskPanel et l'inspecteur de nœud. Nœud doc `.md` sous docs/ → ouvre la Vue
 * Docs (OPEN_DOC_EVENT, mécanisme existant) puis `onNavigate` (ferme le panneau).
 * Nœud code / autre fichier → reveal OS best-effort (chemin absolu = root +
 * source_file, validé côté serveur). Nœud sans fichier (concept) → no-op.
 */
export function openKbNodeSource(node: KbNode, root: string | null, onNavigate: () => void): void {
  if (!node.sourceFile) return
  if (node.fileType === 'document' && node.sourceFile.startsWith('docs/') && node.sourceFile.endsWith('.md')) {
    window.dispatchEvent(new CustomEvent(OPEN_DOC_EVENT, { detail: node.sourceFile.replace(/^docs\//, '') }))
    onNavigate()
    return
  }
  if (!root) return
  void fetch('/api/reveal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: `${root}/${node.sourceFile}` }),
  }).catch(() => { /* reveal indisponible : sans effet, jamais bloquant */ })
}
