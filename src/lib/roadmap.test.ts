import { describe, it, expect } from 'vitest'
import { computeAvailability, missingPrereqs, graphLayout, graphNeighborhood, epicProgress, globalProgress, allEpics, activeTasks, slugify, reverseDependents, depState, nextQueue, type GraphInput } from './roadmap'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

/** Fabrique une tâche minimale ; les champs non pertinents prennent des défauts. */
function task(id: number, status: TaskNode['status'], dependsOn: number[] = [], epic: string | null = null): TaskNode {
  return {
    id, kind: 'task', code: null, title: `T${id}`, status, tags: [], size: null, team: 'engineering', detail: null,
    refs: [], links: [], dependsOn, epic, source: 'ai', createdAt: '2026-07-07', startedAt: null,
    completedAt: null, commit: null, outcome: null, verification: null, release: null,
    file: `docs/tasks/01-x/${id}.yaml`, subtasks: [],
  }
}
function tree(active: TaskNode[], epics: TaskTree['epics'] = []): TaskTree {
  const sec = (key: string, tasks: TaskNode[]): SectionNode => ({ key, title: key, status: 'open', note: null, tasks })
  return { nextId: 999, sections: [sec('01-x', active)], epics }
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
  it("une dépendance n'est done QUE si sa tâche existe avec status done — id inconnu = verrouillée (#154)", () => {
    const av = computeAvailability(tree([task(2, 'todo', [999])]))
    expect(av.get(2)).toBe('locked')
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
  it('une dep inconnue (absente de la map) est manquante — cohérent avec computeAvailability (#154)', () => {
    const t = tree([task(2, 'todo', [999])])
    const av = computeAvailability(t)
    const t2 = t.sections[0].tasks.find((x) => x.id === 2)!
    expect(missingPrereqs(t2, av)).toEqual([999])
  })
})

describe('graphLayout (dagre, flux-de-dépendances)', () => {
  const node = (id: string) => ({ id, width: 100, height: 50 })
  const input = (ids: string[], edges: Array<[string, string]>): GraphInput => ({
    nodes: ids.map(node),
    edges: edges.map(([from, to]) => ({ from, to })),
  })

  it('chaîne a→b→c : le prérequis est à GAUCHE du dépendant (rankdir LR)', () => {
    const l = graphLayout(input(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]))
    const [a, b, c] = [l.nodes.get('a')!, l.nodes.get('b')!, l.nodes.get('c')!]
    expect(a.x + a.w).toBeLessThanOrEqual(b.x)
    expect(b.x + b.w).toBeLessThanOrEqual(c.x)
  })

  it('positions en coin haut-gauche, dans les bornes du layout', () => {
    const l = graphLayout(input(['a', 'b'], [['a', 'b']]))
    for (const p of l.nodes.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.x + p.w).toBeLessThanOrEqual(l.width)
      expect(p.y + p.h).toBeLessThanOrEqual(l.height)
    }
  })

  it('toutes les arêtes valides sont routées (points présents), clé `from->to`', () => {
    const l = graphLayout(input(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']]))
    expect(l.edges.size).toBe(4)
    for (const e of l.edges.values()) expect(e.points.length).toBeGreaterThanOrEqual(2)
    expect(l.edges.has('a->b')).toBe(true)
  })

  it('défensif : self-loop et arête vers un nœud absent ignorées, sans planter', () => {
    const l = graphLayout(input(['a', 'b'], [['a', 'a'], ['a', 'zz'], ['a', 'b']]))
    expect(l.edges.size).toBe(1)
    expect(l.nodes.size).toBe(2)
  })

  it('défensif : un cycle a↔b (epics entremêlés) termine et place tout le monde', () => {
    const l = graphLayout(input(['a', 'b'], [['a', 'b'], ['b', 'a']]))
    expect(l.nodes.size).toBe(2)
  })

  it('mémoïsé par identité d’input : même objet → même layout (pas de recalcul au hover)', () => {
    const i = input(['a', 'b'], [['a', 'b']])
    expect(graphLayout(i)).toBe(graphLayout(i))
    // Un input NEUF (même contenu) est un nouveau calcul — la clé est l'identité.
    expect(graphLayout(input(['a', 'b'], [['a', 'b']]))).not.toBe(graphLayout(i))
  })

  it('tient un DAG de 60 nœuds : aucun chevauchement de cartes, deps toujours à gauche', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `n${i}`)
    // DAG dense déterministe : chaque nœud dépend de 1 à 3 prédécesseurs.
    const edges: Array<[string, string]> = []
    for (let i = 1; i < 60; i++) {
      for (let k = 1; k <= (i % 3) + 1; k++) {
        const from = i - k * ((i % 5) + 1)
        if (from >= 0) edges.push([`n${from}`, `n${i}`])
      }
    }
    const l = graphLayout(input(ids, edges))
    const boxes = [...l.nodes.values()]
    expect(boxes.length).toBe(60)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
    for (const [from, to] of edges) {
      expect(l.nodes.get(from)!.x).toBeLessThan(l.nodes.get(to)!.x)
    }
  })
})

describe('graphNeighborhood', () => {
  const E = (pairs: Array<[string, string]>) => pairs.map(([from, to]) => ({ from, to }))

  it('fermeture transitive amont ET aval, nœud lui-même exclu', () => {
    // a → b → c → d, plus e → c (deuxième prérequis)
    const edges = E([['a', 'b'], ['b', 'c'], ['c', 'd'], ['e', 'c']])
    const { ancestors, descendants } = graphNeighborhood(edges, 'c')
    expect([...ancestors].sort()).toEqual(['a', 'b', 'e'])
    expect([...descendants].sort()).toEqual(['d'])
    expect(ancestors.has('c')).toBe(false)
  })

  it('nœud isolé ou inconnu → ensembles vides', () => {
    const { ancestors, descendants } = graphNeighborhood(E([['a', 'b']]), 'zz')
    expect(ancestors.size).toBe(0)
    expect(descendants.size).toBe(0)
  })

  it('défensif : un cycle ne diverge pas', () => {
    const { ancestors, descendants } = graphNeighborhood(E([['a', 'b'], ['b', 'a']]), 'a')
    expect([...ancestors]).toEqual(['b'])
    expect([...descendants]).toEqual(['b'])
  })
})

describe('epicProgress', () => {
  it("compte les tâches actives de l'epic", () => {
    const t = tree([task(1, 'done', [], 'socle'), task(2, 'todo', [], 'socle'), task(3, 'todo', [], 'beta')])
    expect(epicProgress(t, 'socle')).toEqual({ done: 1, total: 2 })
    expect(epicProgress(t, 'beta')).toEqual({ done: 0, total: 1 })
  })
  it('epic inconnu → 0/0', () => {
    expect(epicProgress(tree([task(1, 'todo')]), 'fantome')).toEqual({ done: 0, total: 0 })
  })
})

describe('globalProgress', () => {
  it('done/total simple sur les sections ouvertes', () => {
    const t = tree([task(1, 'done'), task(2, 'todo'), task(3, 'in_progress')])
    expect(globalProgress(t)).toEqual({ done: 1, total: 3 })
  })
  it('exclut les stages abandoned et dormant', () => {
    const sec = (key: string, status: SectionNode['status'], tasks: TaskNode[]): SectionNode =>
      ({ key, title: key, status, note: null, tasks })
    const t: TaskTree = {
      nextId: 999,
      sections: [
        sec('01-x', 'open', [task(1, 'done'), task(2, 'todo')]),
        sec('02-y', 'dormant', [task(3, 'todo')]),
        sec('03-z', 'abandoned', [task(4, 'todo')]),
      ],
      epics: [],
    }
    expect(globalProgress(t)).toEqual({ done: 1, total: 2 })
  })
  it('compte les sous-tâches (countTasksDeep)', () => {
    const parent = { ...task(1, 'todo'), subtasks: [task(2, 'done')] }
    expect(globalProgress(tree([parent]))).toEqual({ done: 1, total: 2 })
  })
  it('backlog vide → 0/0', () => {
    expect(globalProgress(tree([]))).toEqual({ done: 0, total: 0 })
  })
})

describe('allEpics', () => {
  it('déclarés (ordre du fichier) puis auto-découverts (alphabétique, titre = slug)', () => {
    const t = tree(
      [task(1, 'todo', [], 'zebre'), task(2, 'todo', [], 'socle'), task(3, 'todo', [], 'alpha')],
      [{ slug: 'socle', title: 'Socle' }],
    )
    expect(allEpics(t)).toEqual([
      { slug: 'socle', title: 'Socle' },
      { slug: 'alpha', title: 'alpha' },
      { slug: 'zebre', title: 'zebre' },
    ])
  })
  it('aucun epic nulle part → []', () => {
    expect(allEpics(tree([task(1, 'todo')]))).toEqual([])
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
  it('id inconnu → locked (défensif, cohérent avec computeAvailability, #154)', () => {
    const t = tree([task(1, 'done')])
    expect(depState(t, 999)).toBe('locked')
  })
})

describe('nextQueue', () => {
  const sec = (key: string, tasks: TaskNode[]): SectionNode =>
    ({ key, title: key, status: 'open', note: null, tasks })
  const multi = (sections: Array<[string, TaskNode[]]>): TaskTree =>
    ({ nextId: 999, sections: sections.map(([k, t]) => sec(k, t)), epics: [] })

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
    const t: TaskTree = { nextId: 999, sections: [dormant, sec('04-build', [task(4, 'todo')])], epics: [] }
    expect(nextQueue(t).map((x) => x.id)).toEqual([4])
  })
})
