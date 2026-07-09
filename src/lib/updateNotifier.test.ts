import { describe, it, expect } from 'vitest'
import { shaFromResolved } from './updateNotifier'

describe('shaFromResolved (#207)', () => {
  it('extrait le SHA d\'un champ resolved de package-lock (git dep GitHub)', () => {
    expect(shaFromResolved('git+ssh://git@github.com/5e1y/roadmapped.git#571589838c47bd3b883355243dad4d37b3dcaba4'))
      .toBe('571589838c47bd3b883355243dad4d37b3dcaba4')
    expect(shaFromResolved('git+https://github.com/5e1y/roadmapped.git#abc1234'))
      .toBe('abc1234')
  })

  it('renvoie null quand il n\'y a pas de SHA exploitable', () => {
    expect(shaFromResolved(undefined)).toBeNull()
    expect(shaFromResolved('https://registry.npmjs.org/roadmapped/-/roadmapped-0.1.0.tgz')).toBeNull() // pas de #
    expect(shaFromResolved('git+https://github.com/5e1y/roadmapped.git#not-a-sha!')).toBeNull()
    expect(shaFromResolved(42)).toBeNull()
  })
})
