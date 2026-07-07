import { describe, it, expect } from 'vitest'
import { resolvePaths } from './paths'

describe('resolvePaths', () => {
  it('applique les défauts (../docs/tasks, ../docs) relatifs à la racine dashboard', () => {
    const p = resolvePaths('/repo/dashboard', {})
    expect(p.tasksDir).toBe('/repo/docs/tasks')
    expect(p.docsDir).toBe('/repo/docs')
  })

  it('résout un chemin relatif de config depuis la racine dashboard', () => {
    const p = resolvePaths('/repo/dashboard', { tasksDir: '../custom/tasks', docsDir: '../custom' })
    expect(p.tasksDir).toBe('/repo/custom/tasks')
    expect(p.docsDir).toBe('/repo/custom')
  })

  it('respecte un chemin absolu tel quel', () => {
    const p = resolvePaths('/repo/dashboard', { tasksDir: '/abs/tasks' })
    expect(p.tasksDir).toBe('/abs/tasks')
    expect(p.docsDir).toBe('/repo/docs') // défaut pour docsDir
  })
})
