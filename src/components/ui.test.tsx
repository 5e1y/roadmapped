import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TogglePill } from './ui'

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
    expect(btn.className).toContain('border-accent')
    expect(btn.className).toContain('bg-accent-tint')
    expect(btn.className).toContain('font-medium')
  })

  it('inactif : aria-pressed false + registre neutre', () => {
    render(<TogglePill active={false} onClick={() => {}}>Filter</TogglePill>)
    const btn = screen.getByRole('button', { name: 'Filter' })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn.className).toContain('border-neutral-300')
    expect(btn.className).not.toContain('border-accent')
    expect(btn.className).not.toContain('font-medium')
  })

  it('clic → onClick', () => {
    const onClick = vi.fn()
    render(<TogglePill active={false} onClick={onClick}>Filter</TogglePill>)
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
