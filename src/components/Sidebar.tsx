import { useDocsTree } from '../state/useDocsTree'
import { useTree } from '../state/TreeContext'
import { addPersistentString } from '../state/uiPersist'
import { countTasksDeep } from '../lib/tasks'
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
  const { tree } = useTree()
  const sections = tree ? tree.sections.filter((s) => s.status !== 'abandoned') : []
  // Déplie la section (store partagé avec l'accordéon du Backlog) puis scrolle
  // jusqu'à elle. Double rAF : laisser React monter/déplier avant de viser le DOM.
  const revealSection = (key: string) => {
    onViewChange('backlog')
    addPersistentString('backlog:sections', key)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }))
  }
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

      {view === 'backlog' && sections.length > 0 && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] uppercase tracking-wide text-neutral-400">Sections</div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {sections.map((s) => {
              const { done, total } = countTasksDeep(s.tasks)
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => revealSection(s.key)}
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-xs text-neutral-600 hover:bg-neutral-100"
                  >
                    <span className="min-w-0 truncate" title={s.title}>{s.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-neutral-400">{done}/{total}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {view === 'docs' && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] uppercase tracking-wide text-neutral-400">Fichiers</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.loading && !docs.tree && (
              <p className="px-2 text-xs text-neutral-400">Chargement…</p>
            )}
            {docs.loadError && (
              <p className="mx-2 rounded border border-neutral-400 bg-neutral-100 px-2 py-1.5 text-xs text-neutral-700">
                ⚠ Chargement impossible : {docs.loadError}
              </p>
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
