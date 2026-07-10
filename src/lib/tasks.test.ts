import { describe, it, expect } from 'vitest'
import { buildTaskTree, countTasksDeep } from './tasks'
import type { TaskNode } from './tasks'

/** Tâche minimale pour les tests de comptage. */
function mkTask(id: number, status: TaskNode['status'], subtasks: TaskNode[] = []): TaskNode {
  return {
    id, kind: 'task', code: null, title: `T${id}`, status, tags: [], size: null, detail: null,
    refs: [], links: [], dependsOn: [], epic: null, source: 'ai', createdAt: '2026-07-07', startedAt: null,
    completedAt: null, commit: null, outcome: null, verification: null, release: null,
    file: `docs/tasks/01-x/${id}.yaml`, subtasks,
  }
}

describe('countTasksDeep', () => {
  it('compte les tâches de premier niveau', () => {
    expect(countTasksDeep([mkTask(1, 'done'), mkTask(2, 'todo')])).toEqual({ total: 2, done: 1 })
  })
  it('compte récursivement les sous-tâches', () => {
    const t = mkTask(1, 'todo', [mkTask(2, 'done'), mkTask(3, 'done', [mkTask(4, 'todo')])])
    expect(countTasksDeep([t])).toEqual({ total: 4, done: 2 })
  })
  it('liste vide → 0/0', () => {
    expect(countTasksDeep([])).toEqual({ total: 0, done: 0 })
  })
})

describe('buildTaskTree', () => {
  it('construit une section avec une tâche', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-solidite/_section.yaml': [
        'title: "Solidité"',
        'status: open',
        'note: "contexte"',
      ].join('\n'),
      '/docs/tasks/01-solidite/01-addimage.yaml': [
        'id: 1',
        'code: null',
        'title: "addImage isDirty"',
        'status: todo',
        'tags: [bug, security]',
        'size: S',
        'zone: store',
        'detail: "detail ici"',
        'refs: ["useDocumentStore.ts:809"]',
        'links: []',
        'source: ai',
        'createdAt: "2026-06-24"',
        'completedAt: null',
        'commit: null',
        'verification: null',
        'release: null',
      ].join('\n'),
    }

    const tree = buildTaskTree(files)

    expect(tree.nextId).toBe(2)
    expect(tree.sections).toHaveLength(1)
    expect(tree.sections[0].title).toBe('Solidité')
    expect(tree.sections[0].tasks).toHaveLength(1)
    expect(tree.sections[0].tasks[0].id).toBe(1)
    expect(tree.sections[0].tasks[0].title).toBe('addImage isDirty')
    expect(tree.sections[0].tasks[0].subtasks).toEqual([])
    // Chemin repo-relatif normalisé, exposé pour le CLI et le brief agent
    expect(tree.sections[0].tasks[0].file).toBe('docs/tasks/01-solidite/01-addimage.yaml')
  })

  it('trie les tâches par préfixe numérique, pas alphabétique', () => {
    const files: Record<string, string> = {
      '/docs/tasks/_meta.yaml': 'nextId: 11\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    for (let i = 1; i <= 10; i++) {
      files[`/docs/tasks/01-x/${i}-task.yaml`] = [
        `id: ${i}`, 'code: null', `title: "tâche ${i}"`, 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n')
    }
    const tree = buildTaskTree(files)
    const ids = tree.sections[0].tasks.map((t) => t.id)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) // pas [1,10,2,3,4,5,6,7,8,9]
  })

  it('rattache les sous-tâches via le dossier jumeau', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/03-legal/_section.yaml': 'title: "Legal"\nstatus: open\n',
      '/docs/tasks/03-legal/01-checkout.yaml': [
        'id: 1', 'code: null', 'title: "Checkout"', 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
      '/docs/tasks/03-legal/01-checkout/01-sub.yaml': [
        'id: 2', 'code: null', 'title: "Sous-tâche"', 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    expect(tree.sections[0].tasks[0].subtasks).toHaveLength(1)
    expect(tree.sections[0].tasks[0].subtasks[0].id).toBe(2)
  })

  it("ignore un dossier _archive/ hérité (concept retiré #154) — rien ne fuit dans les sections", () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': [
        'id: 1', 'code: null', 'title: "Active"', 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-07"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
      // Résidu d'un ancien _archive/ : plus jamais parsé (aucun _section.yaml au
      // premier niveau du bucket "_archive" → section sans meta, sautée).
      '/docs/tasks/_archive/05-y/_section.yaml': 'title: "Y livrée"\nstatus: done\n',
      '/docs/tasks/_archive/05-y/01-old.yaml': [
        'id: 2', 'code: null', 'title: "Archivée"', 'status: done', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-06-01"', 'completedAt: "2026-06-20"',
        'commit: abc1234', 'verification: "vérifiée"', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    expect(tree.sections).toHaveLength(1)
    expect(tree.sections[0].key).toBe('01-x')
    expect(tree.sections[0].tasks.map((t) => t.id)).toEqual([1])
  })
})

describe('buildTaskTree — kind (mini-tickets & jalons)', () => {
  it('kind absent → défaut "task" (rétrocompat totale)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': 'id: 1\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    expect(buildTaskTree(files).sections[0].tasks[0].kind).toBe('task')
  })

  it('kind legacy/inconnu (ex-quick #250) lu VERBATIM au parse — la coercion est refusée, validate le rejette', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 1\nkind: quick\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    expect(buildTaskTree(files).sections[0].tasks[0].kind as string).toBe('quick')
  })

  it('kind: milestone lu quand présent (jalon, #133)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 1\nkind: milestone\ntitle: "Jalon"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    expect(buildTaskTree(files).sections[0].tasks[0].kind).toBe('milestone')
  })
})

describe('buildTaskTree — epics (#133, ex-roadmaps)', () => {
  it('parse _epics.yaml dans tree.epics (ordre préservé)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/_epics.yaml': [
        'epics:',
        '  - { slug: socle, title: "Socle" }',
        '  - { slug: beta,  title: "Beta" }',
      ].join('\n'),
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    const tree = buildTaskTree(files)
    expect(tree.epics.map((e) => e.slug)).toEqual(['socle', 'beta'])
    expect(tree.epics[0].title).toBe('Socle')
  })

  it('rétrocompat lecture : un ancien _roadmaps.yaml est lu comme des epics (jalons aplatis)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/_roadmaps.yaml': [
        'roadmaps:',
        '  - slug: launch',
        '    title: "Lancement produit"',
        '    milestones:',
        '      - { slug: socle, title: "Socle" }',
        '      - { slug: beta,  title: "Beta" }',
      ].join('\n'),
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    const tree = buildTaskTree(files)
    expect(tree.epics.map((e) => e.slug)).toEqual(['socle', 'beta'])
  })

  it('_epics.yaml prime sur un _roadmaps.yaml legacy co-présent', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/_epics.yaml': 'epics:\n  - { slug: neuf, title: "Neuf" }\n',
      '/docs/tasks/_roadmaps.yaml':
        'roadmaps:\n  - slug: l\n    title: "L"\n    milestones:\n      - { slug: vieux, title: "Vieux" }\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    expect(buildTaskTree(files).epics.map((e) => e.slug)).toEqual(['neuf'])
  })

  it('aucun fichier → epics: [] (rétrocompat)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    expect(buildTaskTree(files).epics).toEqual([])
  })

  it('dependsOn/epic : défauts [] et null quand absents', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': 'id: 1\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const t = buildTaskTree(files).sections[0].tasks[0]
    expect(t.dependsOn).toEqual([])
    expect(t.epic).toBeNull()
  })

  it('dependsOn/epic lus quand présents', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 2\ntitle: "T"\nstatus: todo\ndependsOn: [1]\nepic: socle\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const t = buildTaskTree(files).sections[0].tasks[0]
    expect(t.dependsOn).toEqual([1])
    expect(t.epic).toBe('socle')
  })

  it('rétrocompat champ : un YAML qui porte encore `milestone:` est lu comme epic', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 1\ntitle: "T"\nstatus: todo\nmilestone: socle\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    expect(buildTaskTree(files).sections[0].tasks[0].epic).toBe('socle')
  })

  it('epic prime sur milestone si les deux sont présents (fichier en cours de migration)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 1\ntitle: "T"\nstatus: todo\nepic: neuf\nmilestone: vieux\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    expect(buildTaskTree(files).sections[0].tasks[0].epic).toBe('neuf')
  })
})
