import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Backlog } from './Backlog'
import { TreeContext, type TreeState } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { ViewProvider } from '../state/ViewContext'
import type { TaskNode, TaskTree, SectionNode } from '../lib/tasks'

afterEach(cleanup)
beforeEach(() => localStorage.clear())

const base: TaskNode = {
  id: 1, kind: 'task', code: null, title: 'Tâche', status: 'todo',
  tags: [], size: null,
  detail: null, refs: [], links: [], dependsOn: [], epic: null,
  source: 'ai', createdAt: '2026-06-24', startedAt: null, completedAt: null, commit: null,
  outcome: null, verification: null, release: null,
  file: 'docs/tasks/01-bug/01-t.yaml', subtasks: [],
}
const t = (id: number, over: Partial<TaskNode> = {}): TaskNode => ({ ...base, id, title: `Tâche ${id}`, ...over })
const section = (key: string, tasks: TaskNode[]): SectionNode =>
  ({ key, title: key.replace(/^\d+-/, ''), status: 'open', note: null, tasks })

const tree: TaskTree = {
  nextId: 100,
  sections: [
    section('01-bug', [
      t(10, { title: 'Fix the login crash' }),
      t(11, { title: 'Something about backfill du champ release', status: 'todo' }),
    ]),
    section('03-chore', [
      t(20, { title: 'Auto-stamp de release au done', status: 'done', completedAt: '2026-07-10', release: '0.2.3' }),
    ]),
    // Épic « releases-chapitres » — reproduit la vraie donnée (#340/#341/#342 y vivent).
    section('02-feature', [
      t(30, { title: 'Widget épique ouvert', status: 'todo', epic: 'releases-chapitres' }),
      t(31, { title: 'Backfill épique du champ release', status: 'todo', epic: 'releases-chapitres' }),
      t(32, { title: 'Auto-stamp épique au done', status: 'done', epic: 'releases-chapitres', completedAt: '2026-07-11' }),
    ]),
  ],
  epics: [{ slug: 'releases-chapitres', title: 'Releases-chapitres' }],
}

function renderBacklog() {
  const value = {
    tree, errors: [], repoName: 'demo', update: null, loading: false, loadError: null,
    reload: async () => {}, lastChange: null,
  } satisfies TreeState
  return render(
    <ViewProvider view="backlog" setView={() => {}}>
      <TreeContext.Provider value={value}>
        <PanelProvider>
          <Backlog />
        </PanelProvider>
      </TreeContext.Provider>
    </ViewProvider>,
  )
}

describe('Backlog search (#348)', () => {
  it('rend tous les tickets sans recherche', () => {
    renderBacklog()
    expect(screen.getByText('Fix the login crash')).toBeInTheDocument()
    expect(screen.getByText(/backfill du champ release/)).toBeInTheDocument()
  })

  it('un terme exact présent dans un titre filtre la liste sur ce ticket', () => {
    renderBacklog()
    const input = screen.getByLabelText('Search tasks')
    fireEvent.change(input, { target: { value: 'backfill' } })
    // Le ticket dont le titre contient « backfill » DOIT rester visible.
    expect(screen.getByText(/backfill du champ release/)).toBeInTheDocument()
    // Les autres tickets ouverts disparaissent.
    expect(screen.queryByText('Fix the login crash')).not.toBeInTheDocument()
  })

  it('un terme présent dans un titre de ticket TERMINÉ le trouve (colonne Terminées, #342)', () => {
    renderBacklog()
    const input = screen.getByLabelText('Search tasks')
    fireEvent.change(input, { target: { value: 'auto-stamp' } })
    expect(screen.getByText(/Auto-stamp de release au done/)).toBeInTheDocument()
  })

  it('un ticket OUVERT matché DANS un epic est VISIBLE en recherche (epic déplié, #348)', () => {
    renderBacklog()
    const input = screen.getByLabelText('Search tasks')
    fireEvent.change(input, { target: { value: 'Backfill épique' } })
    // Le titre matché vit dans l'epic « releases-chapitres » : il DOIT être visible,
    // pas enterré dans un groupe replié (sinon la recherche « ne retourne rien »).
    const hit = screen.getByText(/Backfill épique du champ release/)
    expect(hit).toBeInTheDocument()
    expect(hit).toBeVisible()
    // L'autre membre de l'epic, non matché, ne doit pas apparaître.
    expect(screen.queryByText('Widget épique ouvert')).not.toBeInTheDocument()
  })

  it('un ticket TERMINÉ matché DANS un epic complet est VISIBLE en recherche (#348)', () => {
    renderBacklog()
    const input = screen.getByLabelText('Search tasks')
    fireEvent.change(input, { target: { value: 'Auto-stamp épique' } })
    const hit = screen.getByText(/Auto-stamp épique au done/)
    expect(hit).toBeInTheDocument()
    expect(hit).toBeVisible()
  })
})
