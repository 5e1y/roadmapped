import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NavRail } from './NavRail'
import { ViewProvider, type View } from '../state/ViewContext'

// La mascotte pixel dessine au canvas (indispo en jsdom) — le rail se teste sur
// sa navigation, pas sur le sprite. On la neutralise.
vi.mock('./BirdMascot', () => ({ BirdMascot: () => null }))

afterEach(cleanup)

const ITEMS: { view: View; label: string }[] = [
  { view: 'overview', label: 'Overview' },
  { view: 'backlog', label: 'Backlog' },
  { view: 'roadmap', label: 'Roadmap' },
  { view: 'dependencies', label: 'Deps' },
  { view: 'graph', label: 'Graph' },
  { view: 'activity', label: 'Activity' },
  { view: 'docs', label: 'Docs' },
  { view: 'notepad', label: 'Notes' },
]

function renderRail(view: View, setView: (v: View) => void = () => {}) {
  return render(
    <ViewProvider view={view} setView={setView}>
      <NavRail />
    </ViewProvider>,
  )
}

describe('NavRail (#370)', () => {
  it('rend les 8 vues avec un label texte visible chacune', () => {
    renderRail('backlog')
    for (const { label } of ITEMS) {
      expect(screen.getByRole('button', { name: label })).toBeVisible()
    }
  })

  it('expose un <nav> nommé « Vues »', () => {
    renderRail('backlog')
    expect(screen.getByRole('navigation', { name: 'Vues' })).toBeInTheDocument()
  })

  it('l’item de la vue courante porte aria-current="page", les autres non', () => {
    renderRail('dependencies')
    expect(screen.getByRole('button', { name: 'Deps' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Backlog' })).not.toHaveAttribute('aria-current')
  })

  it('un clic sur un item appelle setView avec le bon id', () => {
    const setView = vi.fn()
    renderRail('backlog', setView)
    fireEvent.click(screen.getByRole('button', { name: 'Graph' }))
    expect(setView).toHaveBeenCalledWith('graph')
    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(setView).toHaveBeenCalledWith('notepad')
  })
})
