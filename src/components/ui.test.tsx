import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { EmptyState, TogglePill } from './ui'

// C1 (#381) — la primitive du langage « contrôle enclenché » (design.md §3.2,
// registre pill bordée, #311). Un seul dialecte : bord accent + accent-tint +
// font-medium quand actif ; neutre au repos.
describe('TogglePill', () => {
  afterEach(cleanup)

  it('actif : aria-pressed + classes du dialecte accent', () => {
    render(<TogglePill active onClick={() => {}}>Filter</TogglePill>)
    const btn = screen.getByRole('button', { name: 'Filter' })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(btn).toHaveAttribute('type', 'button')
    expect(btn.className).toContain('ring-accent')
    expect(btn.className).toContain('bg-active')
    expect(btn.className).toContain('font-medium')
  })

  it('inactif : aria-pressed false + registre neutre', () => {
    render(<TogglePill active={false} onClick={() => {}}>Filter</TogglePill>)
    const btn = screen.getByRole('button', { name: 'Filter' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn.className).toContain('ring-border')
    expect(btn.className).not.toContain('ring-accent')
    expect(btn.className).not.toContain('font-medium')
  })

  it('clic → onClick', () => {
    const onClick = vi.fn()
    render(<TogglePill active={false} onClick={onClick}>Filter</TogglePill>)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// C4 (#384) — la primitive d'état VIDE canonique (design.md §4). Un seul
// registre : titre text-sm font-medium neutral-700 + indice optionnel neutral-500.
describe('EmptyState', () => {
  afterEach(cleanup)

  it('titre seul : rendu au registre canonique (font-medium neutral-700), pas d\'indice', () => {
    render(<EmptyState title="Nothing open" />)
    const title = screen.getByText('Nothing open')
    expect(title.className).toContain('text-sm')
    expect(title.className).toContain('font-medium')
    expect(title.className).toContain('text-texthard')
  })

  it('indice optionnel rendu quand fourni (neutral-500)', () => {
    render(<EmptyState title="No tags yet" hint="Add a tag to see the graph." />)
    const hint = screen.getByText('Add a tag to see the graph.')
    expect(hint.className).toContain('text-xs')
    expect(hint.className).toContain('text-textsoft')
  })

  it('glyphe optionnel est décoratif (aria-hidden) et absent par défaut', () => {
    const { container, rerender } = render(<EmptyState title="Vide" />)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    rerender(<EmptyState title="Vide" glyph={<svg data-testid="glyph" />} />)
    const wrap = screen.getByTestId('glyph').parentElement!
    expect(wrap).toHaveAttribute('aria-hidden', 'true')
  })
})
