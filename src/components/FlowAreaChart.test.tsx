import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FlowAreaChart } from './FlowAreaChart'
import type { DayBucket } from '../lib/overview'

afterEach(cleanup)

const DATA: DayBucket[] = [
  { day: '2026-07-10', created: 3, closed: 1 },
  { day: '2026-07-11', created: 0, closed: 0 },
  { day: '2026-07-12', created: 5, closed: 2 },
  { day: '2026-07-13', created: 2, closed: 6 },
]

describe('FlowAreaChart (#376)', () => {
  it('rend un SVG avec une aire + une ligne par série (2 séries → 2 aires, 2 lignes)', () => {
    const { container } = render(<FlowAreaChart data={DATA} />)
    expect(screen.getByRole('img', { name: /created vs closed/i })).toBeInTheDocument()
    // 2 gradients (créés/fermés) + 2 aires remplies + 2 lignes de crête.
    expect(container.querySelectorAll('linearGradient')).toHaveLength(2)
    const filled = container.querySelectorAll('path[fill^="url("]')
    expect(filled).toHaveLength(2)
    const strokes = container.querySelectorAll('path[stroke]')
    expect(strokes.length).toBeGreaterThanOrEqual(2)
  })

  it('affiche la legend Created / Closed', () => {
    render(<FlowAreaChart data={DATA} />)
    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
  })

  it('étiquette les jours au format DD/MM (premier et dernier présents)', () => {
    render(<FlowAreaChart data={DATA} />)
    expect(screen.getByText('10/07')).toBeInTheDocument()
    expect(screen.getByText('13/07')).toBeInTheDocument()
  })

  it('état vide géré', () => {
    render(<FlowAreaChart data={[]} />)
    expect(screen.getByText(/no activity to chart/i)).toBeInTheDocument()
  })
})
