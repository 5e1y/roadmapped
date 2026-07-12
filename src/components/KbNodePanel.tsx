import { useMemo } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { useKb } from '../state/KbContext'
import { buildKbLinkIndex } from '../lib/kbLink'
import { findTaskInTree } from '../lib/findTaskInTree'
import { openKbNodeSource } from './kbSource'
import { KindGlyph } from './glyphs'

/**
 * Inspecteur d'un nœud de la Knowledge base (#kb, phase 2) — monté dans le
 * SidePanel (même pile de navigation que l'inspection de tâche). Réutilise le
 * cache KB partagé (useKb) + l'index de liage (kbLink) : label, fichier source
 * (cliquable → reveal/Docs), communauté, rationale, ET les tickets qui touchent
 * ce nœud (`ticketsOfNode`) — chacun ouvre le TaskPanel À CÔTÉ (openTask, mode
 * double #313) : le nœud reste à gauche, le ticket s'affiche à droite ; cliquer
 * un autre ticket remplace celui de droite (pushEntry, PanelContext).
 */
export function KbNodePanel({ nodeId }: { nodeId: string }) {
  const { tree } = useTree()
  const { graph, root } = useKb()
  const { openTask, close } = usePanel()

  const node = graph?.nodes.find((n) => n.id === nodeId) ?? null
  const tickets = useMemo(() => {
    if (!tree || !graph) return []
    return buildKbLinkIndex(tree, graph.nodes, graph.edges).ticketsOfNode(nodeId)
  }, [tree, graph, nodeId])

  if (!graph || !node) {
    return <p className="text-sm text-neutral-500">Node not found (le graphe a peut-être changé).</p>
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold leading-snug tracking-tight text-neutral-900">{node.label}</h2>
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <span className="font-mono">{node.fileType}</span>
          {node.community >= 0 && <span className="font-mono">community {node.community}</span>}
        </div>
      </div>

      {/* Fichier source : cliquable (code → reveal, doc → Vue Docs). */}
      {node.sourceFile && (
        <div className="flex flex-col gap-0.5">
          <div className="px-1.5 text-[11px] font-medium text-neutral-500">Source</div>
          <button
            type="button"
            onClick={() => openKbNodeSource(node, root, close)}
            title={node.sourceFile}
            className="flex min-w-0 items-baseline gap-2 px-1.5 py-1 text-left font-mono text-xs text-neutral-800 underline decoration-neutral-500 underline-offset-2 hover:decoration-neutral-800"
          >
            <span className="min-w-0 truncate">{node.sourceFile}</span>
            {node.sourceLocation && <span className="shrink-0 text-neutral-400">{node.sourceLocation}</span>}
          </button>
        </div>
      )}

      {/* Rationale (le POURQUOI, quand Graphify l'a attaché sur un nœud de doc). */}
      {node.rationale && (
        <div className="flex flex-col gap-0.5">
          <div className="px-1.5 text-[11px] font-medium text-neutral-500">Rationale</div>
          <p className="px-1.5 text-sm text-neutral-700">{node.rationale}</p>
        </div>
      )}

      {/* Tickets touching this — index inverse kbLink. */}
      <div className="flex flex-col gap-1">
        <div className="px-1.5 text-[11px] font-medium text-neutral-500">Tickets touching this</div>
        {tickets.length === 0 ? (
          <p className="px-1.5 text-xs text-neutral-500">Aucun ticket ne référence ce fichier.</p>
        ) : (
          <div className="flex flex-col">
            {tickets.map((id) => {
              const t = tree ? findTaskInTree(tree, id) : null
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => openTask(id)}
                  className="flex min-w-0 items-center gap-2 px-1.5 py-1 text-left text-sm hover:bg-neutral-100"
                >
                  {t && <KindGlyph task={t} />}
                  <span className="shrink-0 font-mono text-xs text-neutral-500">#{id}</span>
                  <span className={`min-w-0 truncate ${t?.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}>
                    {t ? t.title : '(introuvable)'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
