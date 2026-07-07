import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron } from './glyphs'
import type { DocNode } from '../server/docs'

const INDENT_PX = 14
const BASE_PADDING_PX = 8

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
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => (
        <li key={node.path}>
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
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm text-neutral-600 hover:bg-neutral-100"
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
      className={`block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm transition-colors ${
        active ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
      style={{ paddingLeft: BASE_PADDING_PX + depth * INDENT_PX + INDENT_PX }}
    >
      {node.name}
    </button>
  )
}
