import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TaskRow } from './TaskRow'
import { PanelProvider, usePanel } from '../state/PanelContext'
import type { TaskNode } from '../lib/tasks'

// @testing-library/react auto-registre son cleanup via un `afterEach` global,
// mais ce projet n'active pas `test.globals` dans vite.config.ts — sans cet
// appel explicite, le DOM des tests précédents reste monté.
afterEach(cleanup)

const task: TaskNode = {
  id: 1, kind: 'task', code: 'A1', title: 'addImage isDirty', status: 'todo',
  tags: ['bug', 'security'], size: 'S', team: 'engineering',
  detail: 'Détail complet ici', refs: ['useDocumentStore.ts:809'], links: [],
  dependsOn: [], milestone: null,
  source: 'ai', createdAt: '2026-06-24', startedAt: null, completedAt: null, commit: null,
  outcome: null, verification: null, release: null,
  file: 'docs/tasks/01-solidite/01-addimage.yaml', subtasks: [],
}

function Spy() {
  const { target } = usePanel()
  return <div data-testid="target">{target ? `${target.kind}:${'id' in target ? target.id : ''}` : 'none'}</div>
}

describe('TaskRow', () => {
  it('affiche le titre, les tags en texte léger et les chips — sans le chip source', () => {
    render(<PanelProvider><TaskRow task={task} /></PanelProvider>)
    expect(screen.getByText('addImage isDirty')).toBeInTheDocument()
    expect(screen.getByText('#bug')).toBeInTheDocument()
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('S')).toBeInTheDocument()
    // la team s'affiche en abrégé (badge TEAM_ABBR), pas en toutes lettres
    expect(screen.getByText('eng')).toBeInTheDocument()
    expect(screen.queryByText('engineering')).not.toBeInTheDocument()
    // le chip source ('ai') n'est plus rendu dans la ligne (bruit — audit UX)
    expect(screen.queryByText('ai')).not.toBeInTheDocument()
  })

  it('plafonne les tags affichés à 3 avec un +n', () => {
    render(<PanelProvider><TaskRow task={{ ...task, tags: ['a', 'b', 'c', 'd', 'e'] }} /></PanelProvider>)
    expect(screen.getByText('#a')).toBeInTheDocument()
    expect(screen.getByText('#c')).toBeInTheDocument()
    expect(screen.queryByText('#d')).not.toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('ouvre le panneau détail au clic sur le corps de la ligne', () => {
    render(
      <PanelProvider>
        <TaskRow task={task} />
        <Spy />
      </PanelProvider>,
    )
    expect(screen.getByTestId('target')).toHaveTextContent('none')
    fireEvent.click(screen.getByText('addImage isDirty'))
    expect(screen.getByTestId('target')).toHaveTextContent('task:1')
  })
})
