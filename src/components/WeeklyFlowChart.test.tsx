import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { WeeklyFlowChart } from './WeeklyFlowChart'
import type { WeekBucket } from '../lib/overview'

// Rendu du chart créés-vs-fermés (#376, étape 2). Fonction PURE : on lui passe des
// WeekBucket fixtures (le helper createdVsClosedByWeek est testé à part, #374).

const buckets: WeekBucket[] = [
  { weekStart: '2026-07-06', created: 4, closed: 1 },
  { weekStart: '2026-07-13', created: 2, closed: 3 },
]

afterEach(cleanup)

describe('WeeklyFlowChart (#376)', () => {
  it('rend une barre créés + une barre fermés par semaine', () => {
    render(<WeeklyFlowChart data={buckets} />)
    expect(screen.getAllByTestId('bar-created')).toHaveLength(buckets.length)
    expect(screen.getAllByTestId('bar-closed')).toHaveLength(buckets.length)
  })

  it('affiche la légende « Créés » / « Fermés »', () => {
    render(<WeeklyFlowChart data={buckets} />)
    expect(screen.getByText('Créés')).toBeInTheDocument()
    expect(screen.getByText('Fermés')).toBeInTheDocument()
  })

  it('étiquette chaque semaine au format court DD/MM (lundi ISO)', () => {
    render(<WeeklyFlowChart data={buckets} />)
    expect(screen.getByText('06/07')).toBeInTheDocument()
    expect(screen.getByText('13/07')).toBeInTheDocument()
  })

  it('trace la barre « fermés » en accent et « créés » en neutre (monochrome + accent)', () => {
    render(<WeeklyFlowChart data={buckets} />)
    expect(screen.getAllByTestId('bar-closed')[0]).toHaveAttribute('fill', 'var(--color-accent)')
    expect(screen.getAllByTestId('bar-created')[0]).toHaveAttribute('fill', 'var(--color-neutral-400)')
  })

  it('hauteur de barre proportionnelle : un bucket plus haut donne une barre plus haute', () => {
    render(<WeeklyFlowChart data={buckets} />)
    const created = screen.getAllByTestId('bar-created')
    // semaine 1 créés=4 (le max) > semaine 2 créés=2
    const h0 = Number(created[0].getAttribute('height'))
    const h1 = Number(created[1].getAttribute('height'))
    expect(h0).toBeGreaterThan(h1)
  })

  it('gère l\'état vide (aucune donnée → message, pas de barres)', () => {
    render(<WeeklyFlowChart data={[]} />)
    expect(screen.queryByTestId('bar-created')).not.toBeInTheDocument()
    expect(screen.getByText(/Pas encore d'activité hebdomadaire/)).toBeInTheDocument()
  })
})
