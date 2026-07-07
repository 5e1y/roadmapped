import { describe, it, expect } from 'vitest'
import { computeAvailability, topoLayers, milestoneProgress, activeTasks, archivedTasks, slugify } from './roadmap'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

/** Fabrique une tâche minimale ; les champs non pertinents prennent des défauts. */
function task(id: number, status: TaskNode['status'], dependsOn: number[] = [], milestone: string | null = null): TaskNode {
  return {
    id, code: null, title: `T${id}`, status, tags: [], size: null, zone: null, detail: null,
    refs: [], links: [], dependsOn, milestone, source: 'ai', createdAt: '2026-07-07',
    completedAt: null, commit: null, verification: null, release: null,
    file: `docs/tasks/01-x/${id}.yaml`, subtasks: [],
  }
}
function tree(active: TaskNode[], archived: TaskNode[] = [], roadmaps: TaskTree['roadmaps'] = []): TaskTree {
  const sec = (key: string, tasks: TaskNode[]): SectionNode => ({ key, title: key, status: 'open', note: null, tasks })
  return { nextId: 999, sections: [sec('01-x', active)], archive: archived.length ? [sec('09-old', archived)] : [], roadmaps }
}

describe('computeAvailability', () => {
  it('done si status done', () => {
    const av = computeAvailability(tree([task(1, 'done')]))
    expect(av.get(1)).toBe('done')
  })
  it('available si toutes les deps sont done ; locked sinon', () => {
    const av = computeAvailability(tree([task(1, 'done'), task(2, 'todo', [1]), task(3, 'todo', [2])]))
    expect(av.get(2)).toBe('available')
    expect(av.get(3)).toBe('locked')
  })
  it('diamant : D disponible seulement quand B ET C sont done', () => {
    const av = computeAvailability(tree([task(1, 'done'), task(2, 'done', [1]), task(3, 'todo', [1]), task(4, 'todo', [2, 3])]))
    expect(av.get(4)).toBe('locked') // C (#3) pas done
  })
  it('une dépendance ARCHIVÉE compte comme done', () => {
    const av = computeAvailability(tree([task(2, 'todo', [1])], [task(1, 'done')]))
    expect(av.get(2)).toBe('available')
  })
  it('dépendance vers un id inconnu ignorée défensivement (non bloquante)', () => {
    const av = computeAvailability(tree([task(2, 'todo', [999])]))
    expect(av.get(2)).toBe('available')
  })
})

describe('topoLayers', () => {
  it('chaîne 1→2→3 : trois couches', () => {
    const tasks = [task(3, 'todo', [2]), task(1, 'todo'), task(2, 'todo', [1])]
    const layers = topoLayers(tasks)
    expect(layers[0].map((t) => t.id)).toEqual([1])
    expect(layers[1].map((t) => t.id)).toEqual([2])
    expect(layers[2].map((t) => t.id)).toEqual([3])
  })
  it('deps hors de l’ensemble ignorées pour le calcul de couche', () => {
    // #2 dépend de #1 (absent de l’ensemble) → #2 en couche 0
    const layers = topoLayers([task(2, 'todo', [1])])
    expect(layers[0].map((t) => t.id)).toEqual([2])
  })
  it('cycle 1↔2 : termine sans boucle infinie, aucune tâche perdue', () => {
    // Défensif : la validation interdit les cycles, mais topoLayers ne doit pas diverger.
    const tasks = [task(1, 'todo', [2]), task(2, 'todo', [1])]
    const layers = topoLayers(tasks)
    expect(layers.flat().length).toBe(tasks.length)
    expect(layers.flat().map((t) => t.id).sort()).toEqual([1, 2])
  })
  it('self-dépendance 1→1 : termine, la tâche reste présente', () => {
    const tasks = [task(1, 'todo', [1])]
    const layers = topoLayers(tasks)
    expect(layers.flat().length).toBe(tasks.length)
    expect(layers[0].map((t) => t.id)).toEqual([1])
  })
})

describe('milestoneProgress', () => {
  it('compte les tâches actives du jalon', () => {
    const t = tree([task(1, 'done', [], 'socle'), task(2, 'todo', [], 'socle'), task(3, 'todo', [], 'beta')])
    expect(milestoneProgress(t, 'socle')).toEqual({ done: 1, total: 2 })
    expect(milestoneProgress(t, 'beta')).toEqual({ done: 0, total: 1 })
  })
})

describe('slugify', () => {
  it('normalise accents, espaces et casse', () => {
    expect(slugify('Lancement Produit')).toBe('lancement-produit')
    expect(slugify('Bêta 2')).toBe('beta-2')
    expect(slugify('   ')).toBe('roadmap') // fallback
  })
})

describe('archivedTasks', () => {
  it('aplati les tâches archivées (sous-tâches comprises)', () => {
    const tree = {
      nextId: 10, roadmaps: [],
      sections: [],
      archive: [{
        key: '_archive/01-x', title: 'X', status: 'done' as const, note: null,
        tasks: [{ ...task(1, "done"), subtasks: [{ ...task(2, "done"), subtasks: [] }] }],
      }],
    }
    expect(archivedTasks(tree as never).map((t) => t.id)).toEqual([1, 2])
  })
})
