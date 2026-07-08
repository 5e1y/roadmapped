import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EpicRow, groupByEpic, epicStatusOf } from './EpicRow'
import { PanelProvider } from '../state/PanelContext'
import type { TaskNode, Epic } from '../lib/tasks'

// @testing-library/react auto-registre son cleanup via un `afterEach` global,
// mais ce projet n'active pas `test.globals` dans vite.config.ts — sans cet
// appel explicite, le DOM des tests précédents reste monté.
afterEach(cleanup)

const base: TaskNode = {
  id: 1, kind: 'task', code: null, title: 'Tâche', status: 'todo',
  tags: [], size: null, team: 'engineering',
  detail: null, refs: [], links: [], dependsOn: [], epic: null,
  source: 'ai', createdAt: '2026-06-24', startedAt: null, completedAt: null, commit: null,
  outcome: null, verification: null, release: null,
  file: 'docs/tasks/04-build/01-t.yaml', subtasks: [],
}
const t = (id: number, over: Partial<TaskNode> = {}): TaskNode => ({ ...base, id, title: `Tâche ${id}`, ...over })

describe('groupByEpic', () => {
  const epics: Epic[] = [{ slug: 'checkout', title: 'Refonte checkout' }]

  it('ancre l’epic à la position de sa première membre et garde les sans-epic à plat', () => {
    const items = groupByEpic(
      [t(1), t(2, { epic: 'checkout' }), t(3), t(4, { epic: 'checkout' })],
      epics,
    )
    expect(items.map((i) => i.type)).toEqual(['task', 'epic', 'task'])
    const epic = items[1]
    if (epic.type !== 'epic') throw new Error('attendu: epic')
    expect(epic.slug).toBe('checkout')
    expect(epic.title).toBe('Refonte checkout')
    expect(epic.tasks.map((x) => x.id)).toEqual([2, 4])
  })

  it('un epic non déclaré est titré par son slug (auto-découverte)', () => {
    const items = groupByEpic([t(1, { epic: 'perf' })], epics)
    const epic = items[0]
    if (epic.type !== 'epic') throw new Error('attendu: epic')
    expect(epic.title).toBe('perf')
  })

  it('sans tâche à epic, la liste reste entièrement à plat', () => {
    expect(groupByEpic([t(1), t(2)], epics).every((i) => i.type === 'task')).toBe(true)
  })
})

describe('epicStatusOf', () => {
  it('plein quand tout est terminé, demi dès que c’est entamé, vide sinon', () => {
    expect(epicStatusOf({ done: 3, total: 3 }, [])).toBe('done')
    expect(epicStatusOf({ done: 1, total: 3 }, [])).toBe('in_progress')
    expect(epicStatusOf({ done: 0, total: 3 }, [t(1, { status: 'in_progress' })])).toBe('in_progress')
    expect(epicStatusOf({ done: 0, total: 3 }, [t(1)])).toBe('todo')
  })
})

describe('EpicRow', () => {
  const renderRow = (persistKey: string) =>
    render(
      <PanelProvider>
        <EpicRow
          slug="checkout"
          title="Refonte checkout"
          tasks={[t(2, { epic: 'checkout' }), t(4, { epic: 'checkout', status: 'done' })]}
          progress={{ done: 1, total: 3 }}
          persistKey={persistKey}
        />
      </PanelProvider>,
    )

  it('porte titre, compte local (« ici » car partiel) et complétion globale — repliée par défaut', () => {
    renderRow('test:epics:a')
    expect(screen.getByText('Refonte checkout')).toBeInTheDocument()
    expect(screen.getByText('2 tâches ici')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    // repliée par défaut : les membres ne sont pas rendus
    expect(screen.queryByText('Tâche 2')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Refonte checkout/ })).toHaveAttribute('aria-expanded', 'false')
  })

  it('se déplie au clic (aria-expanded) et révèle ses membres en TaskRow', () => {
    renderRow('test:epics:b')
    const trigger = screen.getByRole('button', { name: /Refonte checkout/ })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Tâche 2')).toBeInTheDocument()
    expect(screen.getByText('Tâche 4')).toBeInTheDocument()
  })

  it('annonce la complétion aux lecteurs d’écran', () => {
    renderRow('test:epics:c')
    expect(screen.getByText(', 1 sur 3 tâches terminées')).toBeInTheDocument()
  })

  it('affiche l’état entamé du groupe (carré demi-plein accent)', () => {
    renderRow('test:epics:d')
    expect(screen.getByRole('img', { name: 'epic en cours' })).toBeInTheDocument()
  })
})
