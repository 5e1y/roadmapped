import { describe, it, expect } from 'vitest'
import { buildTaskTree, countTasksDeep } from './tasks'
import type { TaskNode } from './tasks'

/** Tâche minimale pour les tests de comptage. */
function mkTask(id: number, status: TaskNode['status'], subtasks: TaskNode[] = []): TaskNode {
  return {
    id, code: null, title: `T${id}`, status, tags: [], size: null, zone: null, detail: null,
    refs: [], links: [], dependsOn: [], milestone: null, source: 'ai', createdAt: '2026-07-07',
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

  it("parse _archive/ dans tree.archive, séparé des sections actives", () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': [
        'id: 1', 'code: null', 'title: "Active"', 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-07"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
      '/docs/tasks/_archive/05-y/_section.yaml': 'title: "Y livrée"\nstatus: done\n',
      '/docs/tasks/_archive/05-y/01-old.yaml': [
        'id: 2', 'code: null', 'title: "Archivée"', 'status: done', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-06-01"', 'completedAt: "2026-06-20"',
        'commit: abc1234', 'verification: "vérifiée"', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    // L'archive ne fuit pas dans les sections actives…
    expect(tree.sections).toHaveLength(1)
    expect(tree.sections[0].key).toBe('01-x')
    // …mais elle est bien parsée, avec la même structure de section
    expect(tree.archive).toHaveLength(1)
    expect(tree.archive[0].key).toBe('05-y')
    expect(tree.archive[0].title).toBe('Y livrée')
    expect(tree.archive[0].tasks).toHaveLength(1)
    expect(tree.archive[0].tasks[0].id).toBe(2)
    expect(tree.archive[0].tasks[0].file).toBe('docs/tasks/_archive/05-y/01-old.yaml')
  })

  it("synthétise la section d'une archive sans _section.yaml (section d'origine encore active)", () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/05-modale/_section.yaml': 'title: "Modale nouveautés"\nstatus: open\n',
      '/docs/tasks/05-modale/04-restant.yaml': [
        'id: 1', 'code: null', 'title: "Restante"', 'status: todo', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-07-07"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
      // PAS de _archive/05-modale/_section.yaml : seules les tâches livrées ont bougé
      '/docs/tasks/_archive/05-modale/01-livree.yaml': [
        'id: 2', 'code: null', 'title: "Livrée"', 'status: done', 'tags: []',
        'size: null', 'zone: null', 'detail: null', 'refs: []', 'links: []',
        'source: ai', 'createdAt: "2026-06-01"', 'completedAt: "2026-06-20"',
        'commit: abc1234', 'verification: "ok"', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    // La tâche archivée ne doit PAS disparaître silencieusement
    expect(tree.archive).toHaveLength(1)
    expect(tree.archive[0].title).toBe('Modale nouveautés') // titre emprunté à la section active
    expect(tree.archive[0].status).toBe('done')
    expect(tree.archive[0].tasks.map((t) => t.id)).toEqual([2])
  })
})

describe('buildTaskTree — roadmap (phase 2)', () => {
  it('parse _roadmaps.yaml dans tree.roadmaps (ordre des jalons préservé)', () => {
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
    expect(tree.roadmaps).toHaveLength(1)
    expect(tree.roadmaps[0].slug).toBe('launch')
    expect(tree.roadmaps[0].milestones.map((m) => m.slug)).toEqual(['socle', 'beta'])
  })

  it('_roadmaps.yaml absent → roadmaps: [] (rétrocompat)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
    }
    expect(buildTaskTree(files).roadmaps).toEqual([])
  })

  it('dependsOn/milestone : défauts [] et null quand absents', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': 'id: 1\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const t = buildTaskTree(files).sections[0].tasks[0]
    expect(t.dependsOn).toEqual([])
    expect(t.milestone).toBeNull()
  })

  it('dependsOn/milestone lus quand présents', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml':
        'id: 2\ntitle: "T"\nstatus: todo\ndependsOn: [1]\nmilestone: socle\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const t = buildTaskTree(files).sections[0].tasks[0]
    expect(t.dependsOn).toEqual([1])
    expect(t.milestone).toBe('socle')
  })
})
