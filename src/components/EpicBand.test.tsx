import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { EpicBand, epicBandItems } from './EpicBand'
import type { TaskNode, TaskTree, SectionNode } from '../lib/tasks'

afterEach(cleanup)

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
  nextId: 10,
  sections: [
    section('01-bug', [t(1, { epic: 'site' }), t(2, { epic: 'site' }), t(3)]),
    section('05-design', [t(4, { epic: 'site', status: 'done' }), t(5, { epic: 'launch' })]),
  ],
  epics: [{ slug: 'site', title: 'Site marketing' }],
}

describe('epicBandItems', () => {
  it('un item par epic (déclarés d’abord), pastilles par type des membres NON terminés, complétion globale', () => {
    const items = epicBandItems(tree)
    expect(items.map((i) => i.slug)).toEqual(['site', 'launch'])
    const site = items[0]
    expect(site.title).toBe('Site marketing')
    expect(site.typeCounts).toEqual([{ type: 'bug', count: 2 }])
    expect(site.progress).toEqual({ done: 1, total: 3 })
    expect(site.status).toBe('in_progress')
  })

  it('les tâches sans epic ne produisent aucun item', () => {
    expect(epicBandItems(tree).some((i) => i.slug === '')).toBe(false)
  })
})

describe('EpicBand', () => {
  it('rend les cartes ; le clic sélectionne (filtre), le re-clic désélectionne', () => {
    const onSelect = vi.fn()
    render(<EpicBand items={epicBandItems(tree)} selected={null} onSelect={onSelect} />)
    expect(screen.getByText('2 bug')).toBeInTheDocument()
    expect(screen.getByText('1/3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Site marketing/ }))
    expect(onSelect).toHaveBeenCalledWith('site')
  })

  it('une carte sélectionnée est pressée (aria-pressed) et son clic efface le filtre', () => {
    const onSelect = vi.fn()
    render(<EpicBand items={epicBandItems(tree)} selected="site" onSelect={onSelect} />)
    const card = screen.getByRole('button', { name: /Site marketing/ })
    expect(card).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('sans epic, pas de bande', () => {
    const { container } = render(<EpicBand items={[]} selected={null} onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
