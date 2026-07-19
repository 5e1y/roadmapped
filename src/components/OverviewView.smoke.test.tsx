import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import { OverviewView } from './OverviewView'
import { TreeContext, type TreeState } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { ViewProvider } from '../state/ViewContext'
import { KbProvider } from '../state/KbContext'
import type { TaskNode, TaskTree, SectionNode } from '../lib/tasks'

// Smoke de l'Overview étape 1 (#375) : la vue monte avec les providers réels
// (Tree / Panel / Kb / View) et les 3 bascules changent la liste d'aperçu.
const base: TaskNode = {
  id: 0, code: null, title: '', status: 'todo', tags: [], detail: '', refs: [], links: [],
  dependsOn: [], epic: null, kind: 'task', source: 'user', createdAt: '2026-07-01',
  startedAt: null, updatedAt: null, completedAt: null, commit: null, outcome: null,
  verification: null, release: null, feedback: [], subtasks: [], file: 'docs/tasks/02-feature/01-x.yaml',
  heat: null, temperature: null,
} as unknown as TaskNode
const section = (key: string, tasks: TaskNode[]): SectionNode =>
  ({ key, title: key.replace(/^\d+-/, ''), status: 'open', note: null, tasks })
const tree: TaskTree = {
  nextId: 100,
  sections: [
    section('02-feature', [
      // #10 = le plus ANCIEN créé ; #11 = le plus RÉCENT — l'ordre Anciens/Récents diverge.
      { ...base, id: 10, title: 'Ancien', createdAt: '2026-01-01', tags: ['alpha', 'beta'] } as TaskNode,
      { ...base, id: 11, title: 'Récent', createdAt: '2026-07-15', tags: ['beta', 'gamma'] } as TaskNode,
    ]),
  ],
  epics: [],
}

function frame(node: React.ReactNode, over: Partial<TreeState> = {}) {
  const value = {
    tree, errors: [], repoName: 'demo', update: null, loading: false, loadError: null,
    reload: async () => {}, lastChange: null,
    ...over,
  } satisfies TreeState
  return render(
    <ViewProvider view="overview" setView={() => {}}>
      <TreeContext.Provider value={value}>
        <KbProvider>
          <PanelProvider>{node}</PanelProvider>
        </KbProvider>
      </TreeContext.Provider>
    </ViewProvider>,
  )
}

/** #id de la première ligne d'aperçu (les seuls textes "#N" de la vue). */
function firstPreviewId(): string | null {
  const ids = screen.getAllByText(/^#\d+$/)
  return ids[0]?.textContent ?? null
}

describe('OverviewView — smoke étape 1 (#375)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    // Force le pipeline STATIQUE de KbGraph (pas de sim rAF) — rendu stable en jsdom.
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, media: '', onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('monte sans jeter (header + les 3 cartes)', () => {
    const { container } = frame(<OverviewView />)
    expect(container.querySelector('header')).toBeInTheDocument()
    expect(screen.getByText('Load by type')).toBeInTheDocument()
    expect(screen.getByText('Backlog preview')).toBeInTheDocument()
    expect(screen.getByText('Open tickets by tag')).toBeInTheDocument()
  })

  it('expose les 3 bascules et change la liste d\'aperçu selon la bascule active', () => {
    frame(<OverviewView />)

    const oldest = screen.getByRole('button', { name: 'Oldest', pressed: false })
    const recent = screen.getByRole('button', { name: 'Recent', pressed: false })
    expect(screen.getByRole('button', { name: 'Urgent', pressed: true })).toBeInTheDocument()

    // Anciens → le plus ancien créé en tête (#10).
    fireEvent.click(oldest)
    expect(screen.getByRole('button', { name: 'Oldest', pressed: true })).toBeInTheDocument()
    expect(firstPreviewId()).toBe('#10')

    // Récents → le plus récemment ajouté en tête (#11) : la liste a bien changé.
    fireEvent.click(recent)
    expect(screen.getByRole('button', { name: 'Recent', pressed: true })).toBeInTheDocument()
    expect(firstPreviewId()).toBe('#11')
  })

  it('ouvre le TaskPanel au clic d\'une ligne (openTask via usePanel)', () => {
    frame(<OverviewView />)
    fireEvent.click(screen.getByRole('button', { name: 'Oldest' }))
    // La ligne #10 est un bouton cliquable — le clic ne jette pas (openTask empile).
    const row = screen.getByText('#10').closest('button')!
    expect(row).toBeInTheDocument()
    fireEvent.click(within(row).getByText('Ancien'))
  })

  // #384 (H2) — Overview honore loadError : plus d'« en attente… » à l'infini quand
  // le serveur est mort. La garde partagée montre l'erreur, sous le header.
  it('serveur mort (loadError) : montre « Server unreachable », PAS un état d\'attente', () => {
    const { container } = frame(<OverviewView />, { tree: null, loading: false, loadError: 'ECONNREFUSED' })
    expect(container.querySelector('header')).toBeInTheDocument()
    expect(screen.getByText('Server unreachable')).toBeInTheDocument()
    expect(screen.getByText('ECONNREFUSED')).toBeInTheDocument()
    expect(screen.queryByText(/waiting for the backlog/i)).not.toBeInTheDocument()
  })
})
