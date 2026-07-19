import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { ActivityView } from './ActivityView'
import { TreeContext, type TreeState } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { ViewProvider } from '../state/ViewContext'
import { LiveActivityProvider } from '../state/LiveActivity'
import type { TaskTree } from '../lib/tasks'

// Smoke de l'onglet Activity (#377) : monte avec LiveActivityProvider + TreeContext
// et affiche l'état vide quand le log est vide (lastChange null → aucun événement).
const tree: TaskTree = { nextId: 1, sections: [], epics: [] }

function frame() {
  const value = {
    tree, errors: [], repoName: 'demo', update: null, loading: false, loadError: null,
    reload: async () => {}, lastChange: null,
  } satisfies TreeState
  return render(
    <ViewProvider view="activity" setView={() => {}}>
      <TreeContext.Provider value={value}>
        <LiveActivityProvider>
          <PanelProvider>
            <ActivityView />
          </PanelProvider>
        </LiveActivityProvider>
      </TreeContext.Provider>
    </ViewProvider>,
  )
}

describe('ActivityView (#377) — smoke de montage', () => {
  afterEach(() => cleanup())

  it('monte sans jeter et rend le header', () => {
    const { container } = frame()
    expect(container.querySelector('header')).toBeInTheDocument()
  })

  it('affiche l\'état vide quand le log est vide', () => {
    frame()
    expect(screen.getByText('Aucune activité pour cette session')).toBeInTheDocument()
  })
})
