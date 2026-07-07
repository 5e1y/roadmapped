import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addTask, updateTask, startTask, doneTask, archiveTask, deleteTask,
  updateSection, readTree, findTask, saveRoadmaps,
} from './taskWrites'
import { seedStages } from './stageFixtures'
import type { TaskTree } from './tasks'

let dir: string

/** Section de travail des tests : le stage canonique 04-build. */
const SEC = '04-build'
/** Récupère un stage par slug dans un arbre (les 8 stages sont toujours présents). */
const sectionOf = (tree: TaskTree, key = SEC) => tree.sections.find((s) => s.key === key)!
/** addTask pré-rempli (section 04-build + team engineering) — surcharge via `input`. */
const add = (input: Partial<Parameters<typeof addTask>[1]> = {}) =>
  addTask(dir, { section: SEC, team: 'engineering', title: 'Tâche', ...input })

/** Fabrique un tasksDir jetable : _meta.yaml + les 8 stages canoniques. */
function seed(): void {
  writeFileSync(join(dir, '_meta.yaml'), 'nextId: 1\n')
  seedStages(dir)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roadmaped-'))
  seed()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('addTask', () => {
  it('crée un fichier, alloue l’id depuis nextId et incrémente nextId', () => {
    const res = add({ title: 'Nouvelle tâche' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.id).toBe(1)
    expect(existsSync(join(dir, SEC, '01-nouvelle-tache.yaml'))).toBe(true)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
    expect(sectionOf(res.tree).tasks[0].title).toBe('Nouvelle tâche')
    expect(sectionOf(res.tree).tasks[0].team).toBe('engineering')
  })

  it('refuse une section inexistante', () => {
    const res = addTask(dir, { section: '99-nope', team: 'engineering', title: 'X' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.notFound).toBe(true)
  })

  it('rejette (rollback) une team inconnue', () => {
    const res = add({ team: 'wizardry' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('team'))).toBe(true)
  })
})

describe('updateTask', () => {
  it('modifie un champ et le persiste', () => {
    add()
    const res = updateTask(dir, 1, { title: 'Titre modifié', team: 'design' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].title).toBe('Titre modifié')
    expect(sectionOf(res.tree).tasks[0].team).toBe('design')
  })

  it('rollback quand l’écriture rend l’arbre invalide (status inconnu)', () => {
    add()
    const before = readFileSync(join(dir, SEC, '01-tache.yaml'), 'utf8')
    const res = updateTask(dir, 1, { status: 'presque-fait' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('status'))).toBe(true)
    // fichier restauré à l'identique (rollback)
    expect(readFileSync(join(dir, SEC, '01-tache.yaml'), 'utf8')).toBe(before)
  })

  it('rollback quand on met une team inconnue', () => {
    add()
    const res = updateTask(dir, 1, { team: 'wizardry' })
    expect(res.ok).toBe(false)
  })
})

describe('start / done', () => {
  it('start passe en in_progress, done passe en done + completedAt', () => {
    add()
    expect(startTask(dir, 1).ok).toBe(true)
    const res = doneTask(dir, 1, { commit: 'abc1234', verification: 'vérifié' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const t = sectionOf(res.tree).tasks[0]
    expect(t.status).toBe('done')
    expect(t.completedAt).not.toBeNull()
    expect(t.commit).toBe('abc1234')
  })

  it('done consigne outcome ; le YAML le place entre commit et verification', () => {
    add()
    const res = doneTask(dir, 1, { outcome: 'Le CLI supporte le champ outcome', verification: 'vérifié' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].outcome).toBe('Le CLI supporte le champ outcome')
    const yamlText = readFileSync(join(dir, SEC, '01-tache.yaml'), 'utf8')
    const idx = (s: string) => yamlText.indexOf(`\n${s}:`)
    expect(idx('outcome')).toBeGreaterThan(idx('commit'))
    expect(idx('outcome')).toBeLessThan(idx('verification'))
  })
})

describe('outcome (updateTask)', () => {
  it('se modifie et se vide via updateTask ; absent du YAML = null', () => {
    add()
    expect(sectionOf(readTree(dir)).tasks[0].outcome).toBeNull()
    const res = updateTask(dir, 1, { outcome: 'Livré X' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].outcome).toBe('Livré X')
    const cleared = updateTask(dir, 1, { outcome: null })
    expect(cleared.ok && sectionOf(cleared.tree).tasks[0].outcome === null).toBe(true)
  })
})

describe('archiveTask', () => {
  it('déplace une tâche done vers _archive/<section>/ ; l’id reste réservé', () => {
    add()
    doneTask(dir, 1, {})
    const res = archiveTask(dir, 1)
    expect(res.ok).toBe(true)
    expect(existsSync(join(dir, SEC, '01-tache.yaml'))).toBe(false)
    expect(existsSync(join(dir, '_archive', SEC, '01-tache.yaml'))).toBe(true)
    // nextId inchangé (id jamais réalloué)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
    const tree = readTree(dir)
    expect(sectionOf(tree).tasks).toHaveLength(0)
    expect(findTask(tree, 1)?.archived).toBe(true)
  })

  it('rollback avec collision de destination : le fichier archivé d’origine survit', () => {
    // 1er cycle : #1 archivée → _archive/04-build/01-tache.yaml
    add()
    doneTask(dir, 1, {})
    archiveTask(dir, 1)
    const original = readFileSync(join(dir, '_archive', SEC, '01-tache.yaml'), 'utf8')
    // 2e tâche de même slug/préfixe dans la même section (le préfixe repart à 01)
    add()
    doneTask(dir, 2, {})
    // provoquer l'échec de la validation POST-écriture (fichier invalide hors trajectoire des ops)
    writeFileSync(
      join(dir, SEC, '99-broken.yaml'),
      'id: 99\ntitle: "B"\nstatus: nimporte\nteam: engineering\nsource: ai\ncreatedAt: "2026-01-01"\n',
    )
    const res = archiveTask(dir, 2)
    expect(res.ok).toBe(false)
    // rollback : le fichier archivé du 1er cycle est restauré à l'identique…
    expect(readFileSync(join(dir, '_archive', SEC, '01-tache.yaml'), 'utf8')).toBe(original)
    // …et la tâche #2 active est remise en place
    expect(existsSync(join(dir, SEC, '01-tache.yaml'))).toBe(true)
  })

  it('refuse d’archiver une tâche non done', () => {
    add()
    const res = archiveTask(dir, 1)
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors[0]).toContain('done')
  })
})

describe('deleteTask', () => {
  it('supprime réellement le fichier sans réallouer l’id (nextId figé)', () => {
    add()
    const res = deleteTask(dir, 1)
    expect(res.ok).toBe(true)
    expect(existsSync(join(dir, SEC, '01-tache.yaml'))).toBe(false)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
  })
})

describe('sections', () => {
  it('updateSection modifie le statut et la note (title reste canonique)', () => {
    const res = updateSection(dir, SEC, { status: 'dormant', note: 'en veille' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const s = sectionOf(res.tree)
    expect(s.title).toBe('Build Stage') // titre canonique inchangé
    expect(s.status).toBe('dormant')
    expect(s.note).toBe('en veille')
  })

  it('rollback si on renomme un stage hors de son titre canonique', () => {
    const res = updateSection(dir, SEC, { title: 'Autre titre' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('canonique'))).toBe(true)
  })
})

describe('updateTask — estampillage completedAt', () => {
  it('date la complétion au passage à done, la retire au retour en arrière', () => {
    add()
    const done = updateTask(dir, 1, { status: 'done' })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(sectionOf(done.tree).tasks[0].completedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const reopened = updateTask(dir, 1, { status: 'todo' })
    expect(reopened.ok).toBe(true)
    if (!reopened.ok) return
    expect(sectionOf(reopened.tree).tasks[0].completedAt).toBeNull()
  })

  it('un completedAt explicite dans le patch prime sur l’estampillage', () => {
    add()
    const res = updateTask(dir, 1, { status: 'done', completedAt: '2026-01-15' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].completedAt).toBe('2026-01-15')
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
    add({ title: 'Base' }) // #1
    const res = add({ title: 'Dépendante', dependsOn: [1] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.dependsOn).toEqual([1])
    // ordre canonique : dependsOn juste après links, avant source
    const yamlText = readFileSync(join(dir, SEC, '02-dependante.yaml'), 'utf8')
    expect(yamlText.indexOf('links:')).toBeLessThan(yamlText.indexOf('dependsOn:'))
    expect(yamlText.indexOf('dependsOn:')).toBeLessThan(yamlText.indexOf('source:'))
  })

  it('addTask rejette (rollback) une dépendance inexistante', () => {
    const res = add({ title: 'X', dependsOn: [999] })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('999'))).toBe(true)
    expect(existsSync(join(dir, SEC, '01-x.yaml'))).toBe(false)
  })

  it('updateTask pose puis vide dependsOn ; pose un milestone déclaré', () => {
    seedRoadmaps()
    add({ title: 'A' }) // #1
    add({ title: 'B' }) // #2
    expect(updateTask(dir, 2, { dependsOn: [1], milestone: 'socle' }).ok).toBe(true)
    const set = sectionOf(readTree(dir)).tasks.find((t) => t.id === 2)!
    expect(set.dependsOn).toEqual([1])
    expect(set.milestone).toBe('socle')
    expect(updateTask(dir, 2, { dependsOn: [] }).ok).toBe(true)
    expect(sectionOf(readTree(dir)).tasks.find((t) => t.id === 2)!.dependsOn).toEqual([])
  })

  it('updateTask rejette un milestone non déclaré (rollback)', () => {
    add({ title: 'A' }) // #1
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
    add({ title: 'T', milestone: 'socle' }) // #1 sur "socle"
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
