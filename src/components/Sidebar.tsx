import { useDocsTree } from '../state/useDocsTree'
import { useTree } from '../state/TreeContext'
import { usePersistentStrings } from '../state/uiPersist'
import { countTasksDeep, TEAMS, type Team } from '../lib/tasks'
import { activeTasks } from '../lib/roadmap'
import { DocsTree } from './DocsTree'

/**
 * Filtre team partagé entre la sidebar et les vues (store uiPersist commun) :
 * [] = pas de filtre. Hook exporté pour Backlog/Colonnes/Graphe.
 */
export function useTeamFilter(): [string[], (next: string[]) => void] {
  return usePersistentStrings('filter:teams')
}

/** Filtre stage du Backlog v2 ('' = tous) — partagé sidebar ⇄ header du Backlog. */
export function useStageFilter(): [string, (next: string) => void] {
  const [arr, setArr] = usePersistentStrings('filter:stage')
  return [arr[0] ?? '', (next) => setArr(next ? [next] : [])]
}

export type View = 'backlog' | 'roadmap' | 'docs'

const NAV: { id: View; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'docs', label: 'Docs' },
]

/**
 * Filtre par team : multi-sélection persistée, appliqué par les 3 vues.
 * Compteurs = tâches actives (sous-tâches comprises) ; team vide = estompée.
 */
function TeamFilter() {
  const { tree } = useTree()
  const [selected, setSelected] = useTeamFilter()
  if (!tree) return null
  const counts = new Map<Team, number>(TEAMS.map((t) => [t, 0]))
  for (const t of activeTasks(tree)) counts.set(t.team, (counts.get(t.team) ?? 0) + 1)
  const toggle = (team: Team) =>
    setSelected(selected.includes(team) ? selected.filter((t) => t !== team) : [...selected, team])
  return (
    <div className="mt-5 flex min-h-0 flex-col">
      <div className="flex shrink-0 items-baseline justify-between px-2 pb-1.5">
        <span className="text-[10px] font-medium text-neutral-400">Teams</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => setSelected([])}
            className="rounded text-[10px] text-neutral-400 hover:text-neutral-700">
            effacer
          </button>
        )}
      </div>
      <ul className="min-h-0 overflow-y-auto">
        {TEAMS.map((team) => {
          const n = counts.get(team) ?? 0
          const active = selected.includes(team)
          return (
            <li key={team}>
              <button
                type="button"
                onClick={() => toggle(team)}
                aria-pressed={active}
                className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-neutral-100 ${
                  active ? 'bg-accent/5 font-medium text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]'
                  : n === 0 ? 'text-neutral-300' : 'text-neutral-600'
                }`}
              >
                <span>{team}</span>
                <span className="shrink-0 font-mono text-[11px] text-neutral-400">{n}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

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
  const [stageFilter, setStageFilter] = useStageFilter()
  const sections = tree ? tree.sections.filter((s) => s.status !== 'abandoned') : []
  // Backlog v2 (liste plate) : cliquer un stage FILTRE le backlog dessus
  // (toggle), au lieu de scroller vers un accordéon qui n'existe plus.
  const revealSection = (key: string) => {
    onViewChange('backlog')
    setStageFilter(stageFilter === key ? '' : key)
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
        <div className="mt-5 flex min-h-0 flex-col">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] font-medium text-neutral-400">Stages</div>
          <ul className="min-h-0 overflow-y-auto">
            {sections.map((s) => {
              const { done, total } = countTasksDeep(s.tasks)
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => revealSection(s.key)}
                    aria-pressed={stageFilter === s.key}
                    className={`flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-neutral-100 ${
                      stageFilter === s.key ? 'bg-accent/5 font-medium text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]'
                      : total === 0 ? 'text-neutral-300' : 'text-neutral-600'}`}
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

      {view !== 'docs' && tree && <TeamFilter />}

      {view === 'docs' && (
        <div className="mt-5 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] font-medium text-neutral-400">Fichiers</div>
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
