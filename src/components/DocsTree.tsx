import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron } from './glyphs'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import type { DocNode } from '../server/docs'

// Retrait dérivé du token spacing-l (#399/#407 puis tokenisation #408) : chaque
// niveau indente d'un cran `l`, base comprise — les lignes portent tout le
// retrait horizontal du gabarit de flanc (design.md §1 Espacements), le
// conteneur (FLANK_PANE) n'a plus que son py vertical.
const indentPadding = (steps: number): string => `calc(var(--spacing-l) * ${steps})`

/**
 * Gabarit du FLANC GAUCHE partagé (arbre Docs / liste Notepad) — source commune
 * (#408) : flex-basis proportionnelle clampée à la place de l'ex `w-[420px]`
 * dupliqué dans DocsView et NotepadView.
 */
export const FLANK_PANE_CLASS =
  'flex basis-1/3 shrink-0 min-w-0 max-w-[40%] flex-col bg-foreground py-s shadow-[inset_-1px_0_0_var(--color-border)]'

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
        className="flex w-full items-center gap-s py-s pr-l text-left text-sm text-textsoft hover:bg-rollover"
        style={{ paddingLeft: indentPadding(depth + 1) }}
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
      className={`flex w-full items-center gap-s py-s pr-l text-left text-sm transition-colors ${
        // Langage « actif » universel (design.md §3.2) : accent-tint + filet gauche —
        // le gris neutral-100 est réservé au hover. Lignes de liste carrées.
        active ? 'bg-active text-texthard' : 'text-textsoft hover:bg-rollover'
      }`}
      style={{ paddingLeft: indentPadding(depth + 1) }}
      title={node.name}
    >
      {/* Gouttière du chevron, INVISIBLE mais aux mêmes métriques que celle des
          dossiers (#432, mesuré au rendu) : même retrait indentPadding(depth+1) +
          même Chevron + même gap-s → les noms de fichiers partagent EXACTEMENT le
          bord gauche des noms de dossiers à chaque profondeur. L'ex `depth + 2`
          (2×spacing-l = 32px) ratait la colonne des labels de 3px (16 ≠ 11px de
          chevron + gap-s). items-center (et plus items-baseline) : mêmes rangées
          que les dossiers et que la liste du Notepad — le badge de date ne flotte
          plus ~2px sous le centre du nom. */}
      <span className="invisible flex shrink-0" aria-hidden="true"><Chevron /></span>
      {/* .md implicite (tout l'arbre en est) — le nom brut reste en tooltip. */}
      <span className="min-w-0 flex-1 truncate">{node.name.replace(/\.md$/, '')}</span>
      {node.createdAt && (
        <span className="shrink-0 font-mono text-[11px] text-textsoft" title={absoluteDate(node.createdAt)}>{relativeTime(node.createdAt)}</span>
      )}
    </button>
  )
}
