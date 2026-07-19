import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DesignSystemView } from './DesignSystemView'
import App from '../App'
import { TreeContext, type TreeState } from '../state/TreeContext'
import { PanelProvider } from '../state/PanelContext'
import { ViewProvider } from '../state/ViewContext'
import { KbProvider } from '../state/KbContext'

// La mascotte pixel dessine au canvas (indispo en jsdom) — neutralisée comme
// dans NavRail.test : la page DS se teste sur son contenu, pas sur le sprite.
vi.mock('./BirdMascot', () => ({ BirdMascot: () => null }))

function frame(node: React.ReactNode) {
  const value = {
    tree: null, errors: [], repoName: 'demo', update: null, loading: false, loadError: null,
    reload: async () => {}, lastChange: null,
  } satisfies TreeState
  return render(
    <ViewProvider view="designsystem" setView={() => {}}>
      <TreeContext.Provider value={value}>
        <KbProvider>
          <PanelProvider>{node}</PanelProvider>
        </KbProvider>
      </TreeContext.Provider>
    </ViewProvider>,
  )
}

describe('DesignSystemView (#388) — smoke de montage', () => {
  afterEach(cleanup)

  it('monte sans jeter (header + sections clés rendues)', () => {
    const { container } = frame(<DesignSystemView onBack={() => {}} />)
    expect(container.querySelector('header')).toBeInTheDocument()
    // Sections vivantes présentes (rendues depuis les vrais tokens/composants).
    expect(screen.getByRole('heading', { name: 'Colors & tokens' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Typography scale' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Primitives' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Glyph family' })).toBeInTheDocument()
  })

  it('Back invoque onBack ; Échap aussi (ignoré si focus dans un champ)', () => {
    const onBack = vi.fn()
    frame(<DesignSystemView onBack={onBack} />)

    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(onBack).toHaveBeenCalledTimes(1)

    // Échap depuis un champ éditable = ignoré (le ghost field est un vrai input).
    const ghost = screen.getByLabelText('Ghost field demo')
    fireEvent.keyDown(ghost, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)

    // Échap hors champ = retour.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(2)
  })
})

describe('Raccourci « g d » → Design System (#388)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false, media: '', onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })))
    try { localStorage.clear() } catch { /* ignore */ }
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('« g » puis « d » sur window ouvre la page (setView designsystem)', () => {
    render(<App />)
    expect(screen.queryByRole('heading', { name: 'Colors & tokens' })).not.toBeInTheDocument()

    fireEvent.keyDown(document.body, { key: 'g' })
    fireEvent.keyDown(document.body, { key: 'd' })

    expect(screen.getByRole('heading', { name: 'Colors & tokens' })).toBeInTheDocument()
    expect(document.title).toContain('Design System')
  })

  it('ignoré si le focus est dans un input (garde-fou saisie)', () => {
    render(<App />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: 'g' })
    fireEvent.keyDown(input, { key: 'd' })

    expect(screen.queryByRole('heading', { name: 'Colors & tokens' })).not.toBeInTheDocument()
    input.remove()
  })
})
