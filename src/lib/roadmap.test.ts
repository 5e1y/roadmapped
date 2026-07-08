import { describe, it, expect } from 'vitest'
import { computeAvailability, missingPrereqs, topoLayers, milestoneProgress, activeTasks, archivedTasks, slugify, reverseDependents, depState, nextQueue } from './roadmap'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

/** Fabrique une tâche minimale ; les champs non pertinents prennent des défauts. */
function task(id: number, status: TaskNode['status'], dependsOn: number[] = [], milestone: string | null = null): TaskNode {
  return {
    id, kind: 'task', code: null, title: `T${id}`, status, tags: [], size: null, team: 'engineering', detail: null,
    refs: [], links: [], dependsOn, milestone, source: 'ai', createdAt: '2026-07-07', startedAt: null,
    completedAt: null, commit: null, outcome: null, verification: null, release: null,
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

describe('missingPrereqs', () => {
  it('liste les prérequis non faits (état ≠ done)', () => {
    const t = tree([task(1, 'done'), task(2, 'todo'), task(3, 'todo', [1, 2])])
    const av = computeAvailability(t)
    const t3 = t.sections[0].tasks.find((x) => x.id === 3)!
    // #1 est done (exclu), #2 est locked/available mais pas done (retenu)
    expect(missingPrereqs(t3, av)).toEqual([2])
  })
  it('une dep done ne bloque pas', () => {
    const t = tree([task(1, 'done'), task(2, 'todo', [1])])
    const av = computeAvailability(t)
    const t2 = t.sections[0].tasks.find((x) => x.id === 2)!
    expect(missingPrereqs(t2, av)).toEqual([])
  })
  it('une dep archivée/inconnue (absente de la map) est done de fait, non listée', () => {
    const t = tree([task(2, 'todo', [999])])
    const av = computeAvailability(t)
    const t2 = t.sections[0].tasks.find((x) => x.id === 2)!
    expect(missingPrereqs(t2, av)).toEqual([])
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

describe('reverseDependents', () => {
  it('aucun dépendant → liste vide', () => {
    const t = tree([task(1, 'todo'), task(2, 'todo')])
    expect(reverseDependents(t, 1)).toEqual([])
  })
  it('plusieurs dépendants, triés par id croissant', () => {
    const t = tree([task(1, 'done'), task(3, 'todo', [1]), task(2, 'todo', [1])])
    expect(reverseDependents(t, 1).map((x) => x.id)).toEqual([2, 3])
  })
  it('trouve un dépendant qui est une sous-tâche', () => {
    const parent = { ...task(2, 'todo'), subtasks: [{ ...task(3, 'todo', [1]), subtasks: [] }] }
    const t = tree([task(1, 'done'), parent])
    expect(reverseDependents(t, 1).map((x) => x.id)).toEqual([3])
  })
})

describe('depState', () => {
  it('dep archivée → archived', () => {
    const t = tree([task(2, 'todo', [1])], [task(1, 'done')])
    expect(depState(t, 1)).toBe('archived')
  })
  it('dep done', () => {
    const t = tree([task(1, 'done')])
    expect(depState(t, 1)).toBe('done')
  })
  it('dep available (deps done)', () => {
    const t = tree([task(1, 'done'), task(2, 'todo', [1])])
    expect(depState(t, 2)).toBe('available')
  })
  it('dep locked (dep non faite)', () => {
    const t = tree([task(1, 'todo'), task(2, 'todo', [1])])
    expect(depState(t, 2)).toBe('locked')
  })
  it('id inconnu → archived (défensif, dep validée pointe toujours vers un id connu)', () => {
    const t = tree([task(1, 'done')])
    expect(depState(t, 999)).toBe('archived')
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

describe('nextQueue', () => {
  const sec = (key: string, tasks: TaskNode[]): SectionNode =>
    ({ key, title: key, status: 'open', note: null, tasks })
  const multi = (sections: Array<[string, TaskNode[]]>): TaskTree =>
    ({ nextId: 999, sections: sections.map(([k, t]) => sec(k, t)), archive: [], roadmaps: [] })

  it('trie par stage PUIS par ancienneté (id) — une tâche d’un stage tôt passe avant, même plus récente', () => {
    const t = multi([
      ['04-build', [task(3, 'todo'), task(4, 'todo')]],
      ['03-identity', [task(16, 'todo')]],
    ])
    expect(nextQueue(t).map((x) => x.id)).toEqual([16, 3, 4])
  })
  it('exclut les done, les in_progress et les verrouillées', () => {
    const t = multi([
      ['04-build', [task(1, 'done'), task(2, 'in_progress'), task(3, 'todo', [4]), task(4, 'todo')]],
    ])
    expect(nextQueue(t).map((x) => x.id)).toEqual([4])
  })
  it('filtre par team quand demandé', () => {
    const mkt = { ...task(5, 'todo'), team: 'marketing' as const }
    const t = multi([['04-build', [task(4, 'todo'), mkt]]])
    expect(nextQueue(t, { team: 'marketing' }).map((x) => x.id)).toEqual([5])
  })
  it('ignore les sections non ouvertes (dormant)', () => {
    const dormant: SectionNode = { key: '03-identity', title: 'x', status: 'dormant', note: null, tasks: [task(9, 'todo')] }
    const t: TaskTree = { nextId: 999, sections: [dormant, sec('04-build', [task(4, 'todo')])], archive: [], roadmaps: [] }
    expect(nextQueue(t).map((x) => x.id)).toEqual([4])
  })
})
