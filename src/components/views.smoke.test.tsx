import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { RoadmapView } from './RoadmapView'
import { DependenciesView } from './DependenciesView'
import { GraphView } from './GraphView'
import { Backlog } from './Backlog'
import { OverviewView } from './OverviewView'
import { TreeContext, type TreeState } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { ViewProvider } from '../state/ViewContext'
import { KbProvider } from '../state/KbContext'
import type { TaskNode, TaskTree, SectionNode } from '../lib/tasks'

// Smoke des vues promues au 1er niveau (#369) : chacune DOIT monter sans jeter.
// Garde de régression du routing (le shell est passé de 4 à 6 vues).
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
      { ...base, id: 30, title: 'A', epic: 'e1' } as TaskNode,
      { ...base, id: 31, title: 'B', dependsOn: [30], epic: 'e1' } as TaskNode,
    ]),
  ],
  epics: [{ slug: 'e1', title: 'Epic 1' }],
}

function frame(node: React.ReactNode, over: Partial<TreeState> = {}) {
  const value = {
    tree, errors: [], repoName: 'demo', update: null, loading: false, loadError: null,
    reload: async () => {}, lastChange: null,
    ...over,
  } satisfies TreeState
  return render(
    <ViewProvider view="roadmap" setView={() => {}}>
      <TreeContext.Provider value={value}>
        <KbProvider>
          <PanelProvider>{node}</PanelProvider>
        </KbProvider>
      </TreeContext.Provider>
    </ViewProvider>,
  )
}

// #384 — la garde d'état PARTAGÉE (TreeStateGuard) vit SOUS le header commun
// (ViewShell) : le ViewHeader reste monté en chargement ET en erreur. Régression
// H1 : Backlog/Roadmap/Deps le faisaient sauter. On teste les vues qui basculaient.
const LOADING: Partial<TreeState> = { tree: null, loading: true }
const SERVER_DEAD: Partial<TreeState> = { tree: null, loading: false, loadError: 'ECONNREFUSED' }

describe('#384 — le header reste monté pendant loading/erreur (TreeStateGuard sous ViewShell)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  const cases: [string, () => React.ReactElement][] = [
    ['Backlog', () => <Backlog />],
    ['RoadmapView', () => <RoadmapView epicFilter={null} onEpicFilter={() => {}} />],
    ['DependenciesView', () => <DependenciesView epicFilter={null} onEpicFilter={() => {}} />],
    ['OverviewView', () => <OverviewView />],
  ]

  for (const [name, make] of cases) {
    it(`${name} : header + « Loading… » pendant le chargement`, () => {
      const { container } = frame(make(), LOADING)
      expect(container.querySelector('header')).toBeInTheDocument()
      expect(screen.getByText('Loading…')).toBeInTheDocument()
    })

    it(`${name} : header + « Server unreachable » quand le serveur est mort`, () => {
      const { container } = frame(make(), SERVER_DEAD)
      expect(container.querySelector('header')).toBeInTheDocument()
      expect(screen.getByText('Server unreachable')).toBeInTheDocument()
      expect(screen.getByText('ECONNREFUSED')).toBeInTheDocument()
    })
  }
})

describe('vues de 1er niveau (#369) — smoke de montage', () => {
  beforeEach(() => {
    // Les vues async (KB) fetchent au montage : stub ok/vide pour ne pas jeter.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('RoadmapView (colonnes) monte', () => {
    const { container } = frame(<RoadmapView epicFilter={null} onEpicFilter={() => {}} />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  it('DependenciesView (graphe de dépendances) monte', () => {
    const { container } = frame(<DependenciesView epicFilter={null} onEpicFilter={() => {}} />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  it('DependenciesView avec un epic filtré monte (filtre partagé)', () => {
    const { container } = frame(<DependenciesView epicFilter="e1" onEpicFilter={() => {}} />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  it('GraphView (graphe nodal KB) monte', () => {
    const { container } = frame(<GraphView />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })
})
