import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron } from './glyphs'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import type { DocNode } from '../server/docs'

const INDENT_PX = 14
// 16px = px-4 : les lignes portent tout le retrait horizontal du gabarit de
// flanc (design.md §1 Espacements) — le conteneur w-[420px] n'a plus que py-2.
const BASE_PADDING_PX = 16

/** Arbre récursif de docs (sidebar, view==='docs'). Dossiers repliables (Collapsible), fichiers cliquables. */
export function DocsTree({
  nodes, docPath, onSelectDoc, depth = 0,
}: {
  nodes: DocNode[]
  docPath: string | null
  onSelectDoc: (path: string) => void
  depth?: number
}) {
  return (
    <ul className="rm-list rm-nest">
      {nodes.map((node) => (
        <li key={node.path} className="rm-list-item">
          {node.children ? (
            <DocsTreeFolder node={node} docPath={docPath} onSelectDoc={onSelectDoc} depth={depth} />
          ) : (
            <DocsTreeFile node={node} active={node.path === docPath} onSelectDoc={onSelectDoc} depth={depth} />
          )}
        </li>
      ))}
    </ul>
  )
}

function DocsTreeFolder({
  node, docPath, onSelectDoc, depth,
}: {
  node: DocNode
  docPath: string | null
  onSelectDoc: (path: string) => void
  depth: number
}) {
  // Déplié par défaut si le fichier actif vit dedans (retrouver sa place après sélection profonde).
  const containsActive = docPath != null && docPath.startsWith(`${node.path}/`)
  const [open, setOpen] = useState(containsActive)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* Le padding vit dans le Trigger : toute la ligne (hauteur comprise) déplie le dossier. */}
      <Collapsible.Trigger
        className="flex w-full items-center gap-1.5 py-1.5 pr-4 text-left text-sm text-textsoft hover:bg-rollover"
        style={{ paddingLeft: BASE_PADDING_PX + depth * INDENT_PX }}
      >
        <Chevron />
        <span className="truncate">{node.name}</span>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <DocsTree nodes={node.children!} docPath={docPath} onSelectDoc={onSelectDoc} depth={depth + 1} />
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

function DocsTreeFile({
  node, active, onSelectDoc, depth,
}: {
  node: DocNode
  active: boolean
  onSelectDoc: (path: string) => void
  depth: number
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectDoc(node.path)}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-baseline gap-2 py-1.5 pr-4 text-left text-sm transition-colors ${
        // Langage « actif » universel (design.md §3.2) : accent-tint + filet gauche —
        // le gris neutral-100 est réservé au hover. Lignes de liste carrées.
        active ? 'bg-active text-texthard' : 'text-textsoft hover:bg-rollover'
      }`}
      style={{ paddingLeft: BASE_PADDING_PX + depth * INDENT_PX + INDENT_PX }}
      title={node.name}
    >
      {/* .md implicite (tout l'arbre en est) — le nom brut reste en tooltip. */}
      <span className="min-w-0 flex-1 truncate">{node.name.replace(/\.md$/, '')}</span>
      {node.createdAt && (
        <span className="shrink-0 font-mono text-[11px] text-textsoft" title={absoluteDate(node.createdAt)}>{relativeTime(node.createdAt)}</span>
      )}
    </button>
  )
}
