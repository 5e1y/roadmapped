import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EpicRow, groupByEpic, splitBacklogItems, epicStatusOf } from './EpicRow'
import { PanelProvider } from '../state/PanelContext'
import type { TaskNode, Epic } from '../lib/tasks'

// @testing-library/react auto-registre son cleanup via un `afterEach` global,
// mais ce projet n'active pas `test.globals` dans vite.config.ts — sans cet
// appel explicite, le DOM des tests précédents reste monté.
afterEach(cleanup)

const base: TaskNode = {
  id: 1, kind: 'task', code: null, title: 'Tâche', status: 'todo',
  tags: [], size: null,
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

describe('splitBacklogItems (dé-dup Backlog, #140-B)', () => {
  const epics: Epic[] = [{ slug: 'checkout', title: 'Refonte checkout' }]
  const done = (id: number, over: Partial<TaskNode> = {}) =>
    t(id, { status: 'done', completedAt: '2026-07-01', ...over })

  it('un epic entamé ne vit que côté ouvert, ses done absorbées dans le groupe', () => {
    const open = [t(1), t(2, { epic: 'checkout' })]
    const doneList = [done(3, { epic: 'checkout' }), done(4)]
    const { open: o, done: d } = splitBacklogItems(open, doneList, epics, () => false)
    // côté ouvert : tâche 1 à plat + groupe checkout portant 2 (ouverte) ET 3 (done)
    expect(o.map((i) => i.type)).toEqual(['task', 'epic'])
    const grp = o[1]
    if (grp.type !== 'epic') throw new Error('attendu: epic')
    expect(grp.tasks.map((x) => x.id)).toEqual([2, 3])
    // côté terminé : l'epic n'apparaît PAS — seule la done sans epic reste
    expect(d).toHaveLength(1)
    expect(d[0].type).toBe('task')
  })

  it('un epic 100 % terminé ne vit que côté « Terminées »', () => {
    const doneList = [done(3, { epic: 'checkout' }), done(5, { epic: 'checkout' })]
    const { open: o, done: d } = splitBacklogItems([t(1)], doneList, epics, () => true)
    expect(o.map((i) => i.type)).toEqual(['task'])
    expect(d.map((i) => i.type)).toEqual(['epic'])
    const grp = d[0]
    if (grp.type !== 'epic') throw new Error('attendu: epic')
    expect(grp.tasks.map((x) => x.id)).toEqual([3, 5])
  })

  it('epic incomplet dont seules des done sont visibles (filtres) : groupe en fin de liste ouverte', () => {
    const { open: o, done: d } = splitBacklogItems([t(1)], [done(3, { epic: 'checkout' })], epics, () => false)
    expect(o.map((i) => i.type)).toEqual(['task', 'epic'])
    expect(d).toHaveLength(0)
  })
})

// L'ancrage Roadmap (epicAnchorStage/groupByEpicAnchored, #140-B) est mort avec
// la bande d'epics (#235, EpicBand) — tests retirés avec les fonctions.

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

  it('porte titre (input ghost), compte local (« ici » car partiel) et complétion globale — repliée par défaut', () => {
    renderRow('test:epics:a')
    // Le titre est un input ghost permanent (#140-A) — éditable, jamais de swap.
    expect(screen.getByDisplayValue('Refonte checkout')).toBeInTheDocument()
    expect(screen.getByLabelText('Rename epic checkout')).toBeInTheDocument()
    expect(screen.getByText('2 tasks here')).toBeInTheDocument()
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

  it('annonce la complétion aux lecteurs d’écran (nom accessible du trigger)', () => {
    renderRow('test:epics:c')
    expect(
      screen.getByRole('button', { name: 'Refonte checkout — 2 tasks here, 1 of 3 tasks done' }),
    ).toBeInTheDocument()
  })

  it('affiche l’état entamé du groupe (carré demi-plein accent)', () => {
    renderRow('test:epics:d')
    expect(screen.getByRole('img', { name: 'epic in progress' })).toBeInTheDocument()
  })
})
