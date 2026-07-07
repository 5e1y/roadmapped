import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addTask, updateTask, startTask, doneTask, archiveTask, deleteTask,
  createSection, updateSection, readTree, findTask, saveRoadmaps,
} from './taskWrites'

let dir: string

/** Fabrique un tasksDir jetable : _meta.yaml + une section "01-x" vide. */
function seed(): void {
  writeFileSync(join(dir, '_meta.yaml'), 'nextId: 1\n')
  mkdirSync(join(dir, '01-x'))
  writeFileSync(join(dir, '01-x', '_section.yaml'), 'title: "X"\nstatus: open\nnote: null\n')
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roadmaped-'))
  seed()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('addTask', () => {
  it('crée un fichier, alloue l’id depuis nextId et incrémente nextId', () => {
    const res = addTask(dir, { section: '01-x', title: 'Nouvelle tâche' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.id).toBe(1)
    expect(existsSync(join(dir, '01-x', '01-nouvelle-tache.yaml'))).toBe(true)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
    expect(res.tree.sections[0].tasks[0].title).toBe('Nouvelle tâche')
  })

  it('refuse une section inexistante', () => {
    const res = addTask(dir, { section: '99-nope', title: 'X' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.notFound).toBe(true)
  })
})

describe('updateTask', () => {
  it('modifie un champ et le persiste', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const res = updateTask(dir, 1, { title: 'Titre modifié', zone: 'store' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.tree.sections[0].tasks[0].title).toBe('Titre modifié')
    expect(res.tree.sections[0].tasks[0].zone).toBe('store')
  })

  it('rollback quand l’écriture rend l’arbre invalide (status inconnu)', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const before = readFileSync(join(dir, '01-x', '01-tache.yaml'), 'utf8')
    const res = updateTask(dir, 1, { status: 'presque-fait' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('status'))).toBe(true)
    // fichier restauré à l'identique (rollback)
    expect(readFileSync(join(dir, '01-x', '01-tache.yaml'), 'utf8')).toBe(before)
  })
})

describe('start / done', () => {
  it('start passe en in_progress, done passe en done + completedAt', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    expect(startTask(dir, 1).ok).toBe(true)
    const res = doneTask(dir, 1, { commit: 'abc1234', verification: 'vérifié' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const t = res.tree.sections[0].tasks[0]
    expect(t.status).toBe('done')
    expect(t.completedAt).not.toBeNull()
    expect(t.commit).toBe('abc1234')
  })
})

describe('archiveTask', () => {
  it('déplace une tâche done vers _archive/<section>/ ; l’id reste réservé', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    doneTask(dir, 1, {})
    const res = archiveTask(dir, 1)
    expect(res.ok).toBe(true)
    expect(existsSync(join(dir, '01-x', '01-tache.yaml'))).toBe(false)
    expect(existsSync(join(dir, '_archive', '01-x', '01-tache.yaml'))).toBe(true)
    // nextId inchangé (id jamais réalloué)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
    const tree = readTree(dir)
    expect(tree.sections[0].tasks).toHaveLength(0)
    expect(findTask(tree, 1)?.archived).toBe(true)
  })

  it('rollback avec collision de destination : le fichier archivé d’origine survit', () => {
    // 1er cycle : #1 archivée → _archive/01-x/01-tache.yaml
    addTask(dir, { section: '01-x', title: 'Tâche' })
    doneTask(dir, 1, {})
    archiveTask(dir, 1)
    const original = readFileSync(join(dir, '_archive', '01-x', '01-tache.yaml'), 'utf8')
    // 2e tâche de même slug/préfixe dans la même section (le préfixe repart à 01)
    addTask(dir, { section: '01-x', title: 'Tâche' })
    doneTask(dir, 2, {})
    // provoquer l'échec de la validation POST-écriture (fichier invalide hors trajectoire des ops)
    writeFileSync(
      join(dir, '01-x', '99-broken.yaml'),
      'id: 99\ntitle: "B"\nstatus: nimporte\nsource: ai\ncreatedAt: "2026-01-01"\n',
    )
    const res = archiveTask(dir, 2)
    expect(res.ok).toBe(false)
    // rollback : le fichier archivé du 1er cycle est restauré à l'identique…
    expect(readFileSync(join(dir, '_archive', '01-x', '01-tache.yaml'), 'utf8')).toBe(original)
    // …et la tâche #2 active est remise en place
    expect(existsSync(join(dir, '01-x', '01-tache.yaml'))).toBe(true)
  })

  it('refuse d’archiver une tâche non done', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const res = archiveTask(dir, 1)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors[0]).toContain('done')
  })
})

describe('deleteTask', () => {
  it('supprime réellement le fichier sans réallouer l’id (nextId figé)', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const res = deleteTask(dir, 1)
    expect(res.ok).toBe(true)
    expect(existsSync(join(dir, '01-x', '01-tache.yaml'))).toBe(false)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
  })
})

describe('sections', () => {
  it('createSection crée NN-slug/_section.yaml avec le préfixe suivant', () => {
    const res = createSection(dir, { title: 'Nouvelle section' })
    expect(res.ok).toBe(true)
    expect(existsSync(join(dir, '02-nouvelle-section', '_section.yaml'))).toBe(true)
    const tree = readTree(dir)
    expect(tree.sections.map((s) => s.key)).toContain('02-nouvelle-section')
  })

  it('updateSection modifie le titre et le statut', () => {
    const res = updateSection(dir, '01-x', { title: 'X renommée', status: 'dormant' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const s = res.tree.sections[0]
    expect(s.title).toBe('X renommée')
    expect(s.status).toBe('dormant')
  })
})

describe('updateTask — estampillage completedAt', () => {
  it('date la complétion au passage à done, la retire au retour en arrière', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const done = updateTask(dir, 1, { status: 'done' })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.tree.sections[0].tasks[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const reopened = updateTask(dir, 1, { status: 'todo' })
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(reopened.tree.sections[0].tasks[0].completedAt).toBeNull()
  })

  it('un completedAt explicite dans le patch prime sur l’estampillage', () => {
    addTask(dir, { section: '01-x', title: 'Tâche' })
    const res = updateTask(dir, 1, { status: 'done', completedAt: '2026-01-15' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.tree.sections[0].tasks[0].completedAt).toBe('2026-01-15')
  })
})

function seedRoadmaps(): void {
  writeFileSync(
    join(dir, '_roadmaps.yaml'),
    'roadmaps:\n  - slug: launch\n    title: "Lancement"\n    milestones:\n      - { slug: socle, title: "Socle" }\n',
  )
}

describe('addTask/updateTask — dependsOn & milestone (phase 2)', () => {
  it('addTask accepte dependsOn vers une tâche existante et le sérialise après links', () => {
    addTask(dir, { section: '01-x', title: 'Base' }) // #1
    const res = addTask(dir, { section: '01-x', title: 'Dépendante', dependsOn: [1] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.dependsOn).toEqual([1])
    // ordre canonique : dependsOn juste après links, avant source
    const yamlText = readFileSync(join(dir, '01-x', '02-dependante.yaml'), 'utf8')
    expect(yamlText.indexOf('links:')).toBeLessThan(yamlText.indexOf('dependsOn:'))
    expect(yamlText.indexOf('dependsOn:')).toBeLessThan(yamlText.indexOf('source:'))
  })

  it('addTask rejette (rollback) une dépendance inexistante', () => {
    const res = addTask(dir, { section: '01-x', title: 'X', dependsOn: [999] })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('999'))).toBe(true)
    expect(existsSync(join(dir, '01-x', '01-x.yaml'))).toBe(false)
  })

  it('updateTask pose puis vide dependsOn ; pose un milestone déclaré', () => {
    seedRoadmaps()
    addTask(dir, { section: '01-x', title: 'A' }) // #1
    addTask(dir, { section: '01-x', title: 'B' }) // #2
    expect(updateTask(dir, 2, { dependsOn: [1], milestone: 'socle' }).ok).toBe(true)
    const set = readTree(dir).sections[0].tasks.find((t) => t.id === 2)!
    expect(set.dependsOn).toEqual([1])
    expect(set.milestone).toBe('socle')
    expect(updateTask(dir, 2, { dependsOn: [] }).ok).toBe(true)
    expect(readTree(dir).sections[0].tasks.find((t) => t.id === 2)!.dependsOn).toEqual([])
  })

  it('updateTask rejette un milestone non déclaré (rollback)', () => {
    addTask(dir, { section: '01-x', title: 'A' }) // #1
    const res = updateTask(dir, 1, { milestone: 'fantome' })
    expect(res.ok).toBe(false)
  })
})

describe('saveRoadmaps', () => {
  it('crée _roadmaps.yaml et le relit dans tree.roadmaps', () => {
    const res = saveRoadmaps(dir, {
      roadmaps: [{ slug: 'launch', title: 'Lancement', milestones: [{ slug: 'socle', title: 'Socle' }] }],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(existsSync(join(dir, '_roadmaps.yaml'))).toBe(true)
    expect(res.tree.roadmaps[0].slug).toBe('launch')
    expect(res.tree.roadmaps[0].milestones[0].slug).toBe('socle')
  })

  it('rollback si un jalon référencé par une tâche disparaît de la réécriture', () => {
    saveRoadmaps(dir, { roadmaps: [{ slug: 'l', title: 'L', milestones: [{ slug: 'socle', title: 'S' }] }] })
    addTask(dir, { section: '01-x', title: 'T', milestone: 'socle' }) // #1 sur "socle"
    // réécriture SANS "socle" → #1 pointe vers un jalon non déclaré → invalide → rollback
    const res = saveRoadmaps(dir, { roadmaps: [{ slug: 'l', title: 'L', milestones: [] }] })
    expect(res.ok).toBe(false)
    // le fichier d'origine (avec "socle") a survécu
    expect(readFileSync(join(dir, '_roadmaps.yaml'), 'utf8')).toContain('socle')
  })

  it('rejette un body sans tableau roadmaps ({} ou clé mal orthographiée) SANS toucher le fichier', () => {
    saveRoadmaps(dir, { roadmaps: [{ slug: 'l', title: 'L', milestones: [{ slug: 'socle', title: 'S' }] }] })
    for (const body of [{}, { roadmaps: 'oops' }, { roadmap: [] }]) {
      const res = saveRoadmaps(dir, body as any)
      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.errors.length).toBeGreaterThan(0)
    }
    // le fichier existant est intact (pas écrasé par une liste vide)
    expect(readFileSync(join(dir, '_roadmaps.yaml'), 'utf8')).toContain('socle')
  })

  it('rejette une roadmap ou un jalon sans slug/title string non vide', () => {
    expect(saveRoadmaps(dir, { roadmaps: [{ title: 'Sans slug', milestones: [] }] }).ok).toBe(false)
    expect(saveRoadmaps(dir, { roadmaps: [{ slug: 'x', milestones: [] }] }).ok).toBe(false)
    expect(saveRoadmaps(dir, { roadmaps: [{ slug: 'x', title: 'X', milestones: [{ title: 'Sans slug' }] }] }).ok).toBe(false)
    expect(saveRoadmaps(dir, { roadmaps: [{ slug: 'x', title: 'X', milestones: [{ slug: 'm' }] }] }).ok).toBe(false)
    expect(saveRoadmaps(dir, { roadmaps: [{ slug: 'x', title: 'X', milestones: 'oops' }] }).ok).toBe(false)
    expect(existsSync(join(dir, '_roadmaps.yaml'))).toBe(false) // rien n'a été écrit
  })

  it('rejette les slugs dupliqués dans la requête (roadmaps et jalons)', () => {
    const dupRoadmap = saveRoadmaps(dir, {
      roadmaps: [
        { slug: 'x', title: 'X', milestones: [] },
        { slug: 'x', title: 'X bis', milestones: [] },
      ],
    })
    expect(dupRoadmap.ok).toBe(false)
    const dupMilestone = saveRoadmaps(dir, {
      roadmaps: [{ slug: 'x', title: 'X', milestones: [{ slug: 'm', title: 'M' }, { slug: 'm', title: 'M bis' }] }],
    })
    expect(dupMilestone.ok).toBe(false)
    expect(existsSync(join(dir, '_roadmaps.yaml'))).toBe(false)
  })
})
