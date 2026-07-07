import { useDocsTree } from '../state/useDocsTree'
import { DocsTree } from './DocsTree'

export type View = 'backlog' | 'roadmap' | 'docs'

const NAV: { id: View; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'docs', label: 'Docs' },
]

export function Sidebar({
  view, onViewChange, docPath, onSelectDoc,
}: {
  view: View
  onViewChange: (v: View) => void
  docPath: string | null
  onSelectDoc: (path: string) => void
}) {
  const docs = useDocsTree()
  return (
    <nav className="flex min-h-0 w-[220px] shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-4">
      <div className="shrink-0 px-2 pb-4 text-sm font-semibold tracking-tight text-neutral-900">Roadmaped</div>
      <ul className="flex shrink-0 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.id === view
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onViewChange(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <span>{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {view === 'docs' && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] uppercase tracking-wide text-neutral-400">Fichiers</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.loading && !docs.tree && (
              <p className="px-2 text-xs text-neutral-400">Chargement…</p>
            )}
            {docs.loadError && (
              <p className="px-2 text-xs text-neutral-400">Erreur : {docs.loadError}</p>
            )}
            {docs.tree && docs.tree.length === 0 && (
              <p className="px-2 text-xs text-neutral-400">Aucun document .md.</p>
            )}
            {docs.tree && docs.tree.length > 0 && (
              <DocsTree nodes={docs.tree} docPath={docPath} onSelectDoc={onSelectDoc} />
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
