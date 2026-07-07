import { describe, it, expect } from 'vitest'
import { parseRef, locateLine, snippet } from './refExtract'

const SRC = ['import x', '', 'export function nextQueue() {', '  return []', '}', '', 'const other = 1'].join('\n')

describe('parseRef', () => {
  it('path seul → pas d\'ancre', () => {
    expect(parseRef('src/lib/roadmap.ts')).toEqual({ path: 'src/lib/roadmap.ts', anchor: null })
  })
  it('path#symbole → ancre symbole', () => {
    expect(parseRef('src/lib/roadmap.ts#nextQueue')).toEqual({
      path: 'src/lib/roadmap.ts', anchor: { kind: 'symbol', value: 'nextQueue' },
    })
  })
  it('path:ligne → ancre ligne', () => {
    expect(parseRef('src/lib/roadmap.ts:141')).toEqual({
      path: 'src/lib/roadmap.ts', anchor: { kind: 'line', value: 141 },
    })
  })
  it('# vide → pas d\'ancre (path conservé)', () => {
    expect(parseRef('foo.ts#')).toEqual({ path: 'foo.ts', anchor: null })
  })
})

describe('locateLine — symbole', () => {
  it('trouve la première ligne contenant le symbole comme mot entier', () => {
    expect(locateLine(SRC, { kind: 'symbol', value: 'nextQueue' })).toBe(3)
  })
  it('symbole absent → null (déplacé/supprimé : le CLI dira « ancre introuvable »)', () => {
    expect(locateLine(SRC, { kind: 'symbol', value: 'disparu' })).toBeNull()
  })
  it('mot entier : « other » ne matche pas « otherwise »', () => {
    expect(locateLine('const otherwise = 2', { kind: 'symbol', value: 'other' })).toBeNull()
  })
})

describe('locateLine — ligne', () => {
  it('ligne dans les bornes → renvoyée', () => {
    expect(locateLine(SRC, { kind: 'line', value: 3 })).toBe(3)
  })
  it('ligne hors bornes → null', () => {
    expect(locateLine(SRC, { kind: 'line', value: 999 })).toBeNull()
  })
})

describe('snippet', () => {
  it('numérote et borne autour de la ligne', () => {
    const s = snippet(SRC, 3, 1)
    expect(s).toBe(['2  ', '3  export function nextQueue() {', '4    return []'].join('\n'))
  })
  it('ne déborde pas en tête de fichier', () => {
    expect(snippet(SRC, 1, 2)).toBe(['1  import x', '2  ', '3  export function nextQueue() {'].join('\n'))
  })
})
