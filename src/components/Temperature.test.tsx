import '@testing-library/jest-dom/vitest'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TempBadge, formatTemp, rowTemperature, tempColor, tempTitle } from './Temperature'
import type { Temperature } from '../lib/tasks'

afterEach(cleanup)

const temp: Temperature = { value: 48.67, auto: 18.67, base: 30, seed: 0 }

describe('formatTemp', () => {
  it('relevé à la virgule, degré collé — « 48,7° » (1 décimale par défaut)', () => {
    expect(formatTemp(48.67)).toBe('48,7°')
    expect(formatTemp(48.67, 2)).toBe('48,67°')
    expect(formatTemp(0)).toBe('0,0°')
  })
})

describe('tempColor', () => {
  it('froid = bleu, tiède = gris neutre, chaud = orange (rampe coolwarm, jamais de vert)', () => {
    expect(tempColor(0)).toBe('rgb(59 107 199)')
    expect(tempColor(50)).toBe('rgb(163 163 163)')
    expect(tempColor(100)).toBe('rgb(234 88 12)')
  })

  it('borne les valeurs hors 0–100', () => {
    expect(tempColor(-10)).toBe(tempColor(0))
    expect(tempColor(140)).toBe(tempColor(100))
  })
})

describe('rowTemperature (lignes/cartes)', () => {
  it('toute tâche ouverte porte sa température — inconditionnel, comme l’ex-chip team', () => {
    expect(rowTemperature({ status: 'todo', temperature: temp })).toBe(temp)
    const cold: Temperature = { value: 5, auto: 0, base: 5, seed: 0 }
    expect(rowTemperature({ status: 'in_progress', temperature: cold })).toBe(cold)
  })

  it('jamais sur une tâche done ni sans température attachée', () => {
    expect(rowTemperature({ status: 'done', temperature: temp })).toBeNull()
    expect(rowTemperature({ status: 'todo', temperature: null })).toBeNull()
    expect(rowTemperature({ status: 'todo' })).toBeNull()
  })
})

describe('TempBadge', () => {
  it('rend la valeur « 48,7° » et la décomposition en tooltip (le pourquoi)', () => {
    render(<TempBadge t={temp} />)
    expect(screen.getByText('48,7°')).toBeInTheDocument()
    expect(screen.getByTitle(tempTitle(temp))).toBeInTheDocument()
    expect(tempTitle(temp)).toBe(
      'Temperature 48,67° — auto 18,67 (blocks + age) · base 30 (type) · seed 0 (heat)',
    )
  })
})
