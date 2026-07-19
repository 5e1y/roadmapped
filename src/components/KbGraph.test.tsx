import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { KbGraph } from './KbGraph'
import { PanelProvider } from '../state/PanelContext'
import type { KbGraph as KbGraphData } from '../server/kb'
import type { KbFilters } from '../lib/kbFilter'

// #385 (bloquant a11y) — les nœuds du graphe KB doivent être atteignables ET
// activables au clavier (le graphe jumeau Deps le fait déjà via de vrais
// <button>). Ici les nœuds sont des <circle> SVG : on vérifie role/tabIndex/
// aria-label + Enter/Espace, et que le clavier suit la MÊME logique que le clic
// (override onNodeClick #375 compris).

const graph: KbGraphData = {
  generatedAt: null,
  nodes: [
    { id: 'a', label: 'Alpha', fileType: 'ts', sourceFile: null, sourceLocation: null, community: 0 },
    { id: 'b', label: 'Beta', fileType: 'ts', sourceFile: null, sourceLocation: null, community: 0 },
    { id: 'c', label: 'Gamma', fileType: 'ts', sourceFile: null, sourceLocation: null, community: 0 },
  ],
  edges: [
    { source: 'a', target: 'b', relation: 'imports', confidence: 'EXTRACTED', weight: 1 },
    { source: 'b', target: 'c', relation: 'imports', confidence: 'EXTRACTED', weight: 1 },
  ],
  stats: { nodes: 3, edges: 2, communities: 1 },
}
const NO_FILTERS: KbFilters = { communities: [], fileTypes: [], hideInferred: false }

function frame(onNodeClick?: (id: string) => void) {
  return render(
    <PanelProvider>
      <KbGraph graph={graph} filters={NO_FILTERS} query="" onNodeClick={onNodeClick} />
    </PanelProvider>,
  )
}

describe('KbGraph — nœuds accessibles au clavier (#385)', () => {
  beforeEach(() => {
    // Force le pipeline STATIQUE (reduced-motion) : layout pré-calculé, aucun rAF.
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true, media: '', onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })))
  })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('expose role="button", tabIndex et aria-label sur chaque nœud', async () => {
    frame(() => {})
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    expect(alpha.tagName.toLowerCase()).toBe('circle')
    expect(alpha).toHaveAttribute('tabindex', '0')
    expect(await screen.findByRole('button', { name: 'Beta' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Gamma' })).toBeInTheDocument()
  })

  it('Enter et Espace activent le nœud avec le MÊME chemin que le clic (onNodeClick)', async () => {
    const onNodeClick = vi.fn()
    frame(onNodeClick)
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    const beta = await screen.findByRole('button', { name: 'Beta' })

    fireEvent.keyDown(alpha, { key: 'Enter' })
    expect(onNodeClick).toHaveBeenLastCalledWith('a')

    fireEvent.keyDown(beta, { key: ' ' })
    expect(onNodeClick).toHaveBeenLastCalledWith('b')

    // Le clic passe toujours par le même handler.
    fireEvent.click(alpha)
    expect(onNodeClick).toHaveBeenLastCalledWith('a')
    expect(onNodeClick).toHaveBeenCalledTimes(3)
  })

  it('sans onNodeClick, Enter ouvre l’inspecteur par défaut sans jeter', async () => {
    frame()
    const alpha = await screen.findByRole('button', { name: 'Alpha' })
    expect(() => fireEvent.keyDown(alpha, { key: 'Enter' })).not.toThrow()
  })
})
