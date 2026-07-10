import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addTask, updateTask, startTask, doneTask, deleteTask, moveTask, addFeedback,
  updateSection, readTree, findTask, saveEpics, withLock,
} from './taskWrites'
import { seedStages } from './stageFixtures'
import type { TaskTree } from './tasks'

let dir: string

/** Section de travail des tests : le type canonique 02-feature. */
const SEC = '02-feature'
/** Récupère un type par slug dans un arbre (les 9 types sont toujours présents). */
const sectionOf = (tree: TaskTree, key = SEC) => tree.sections.find((s) => s.key === key)!
/** addTask pré-rempli (type 02-feature) — surcharge via `input`. */
const add = (input: Partial<Parameters<typeof addTask>[1]> = {}) =>
  addTask(dir, { section: SEC, title: 'Tâche', ...input })

/** Fabrique un tasksDir jetable : _meta.yaml + les 9 types canoniques. */
function seed(): void {
  writeFileSync(join(dir, '_meta.yaml'), 'nextId: 1\n')
  seedStages(dir)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'roadmapped-'))
  seed()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('withLock — verrou de mutation (#83)', () => {
  const lockDir = () => join(dir, '.lock')

  it('vole un verrou orphelin (détenteur plus vieux que le TTL) et écrit quand même', () => {
    // Verrou tenu par un « détenteur » daté d'il y a 20s (> TTL 10s par défaut) → orphelin.
    mkdirSync(lockDir())
    writeFileSync(join(lockDir(), 'owner'), `99999:${Date.now() - 20_000}`)
    const res = add({ title: 'Malgré un verrou orphelin' })
    expect(res.ok).toBe(true)
    expect(existsSync(lockDir())).toBe(false) // libéré en sortie
  })

  it('abandonne proprement sur un verrou frais tenu (timeout, message exploitable)', () => {
    process.env.ROADMAPED_LOCK_TIMEOUT_MS = '150'
    process.env.ROADMAPED_LOCK_TTL_MS = '60000' // TTL haut → le verrou n'est PAS orphelin
    mkdirSync(lockDir())
    writeFileSync(join(lockDir(), 'owner'), `99999:${Date.now()}`) // détenteur bien vivant
    try {
      expect(() => add({ title: 'Bloquée' })).toThrow(/Verrou .*\.lock/)
    } finally {
      rmSync(lockDir(), { recursive: true, force: true })
      delete process.env.ROADMAPED_LOCK_TIMEOUT_MS
      delete process.env.ROADMAPED_LOCK_TTL_MS
    }
  })

  it('libère le verrou même si fn lève (finally)', () => {
    expect(() => withLock(dir, () => { throw new Error('boom') })).toThrow('boom')
    expect(existsSync(lockDir())).toBe(false)
  })
})

describe('addTask', () => {
  it('crée un fichier, alloue l’id depuis nextId et incrémente nextId', () => {
    const res = add({ title: 'Nouvelle tâche' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.id).toBe(1)
    expect(existsSync(join(dir, SEC, '01-nouvelle-tache.yaml'))).toBe(true)
    expect(readFileSync(join(dir, '_meta.yaml'), 'utf8')).toContain('nextId: 2')
    expect(sectionOf(res.tree).tasks[0].title).toBe('Nouvelle tâche')
    // La nature d'une tâche est désormais portée par sa section (#230, plus de team).
    expect(res.task!.file).toContain(`${SEC}/`)
  })

  it('refuse une section inexistante', () => {
    const res = addTask(dir, { section: '99-nope', title: 'X' })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.notFound).toBe(true)
  })

  it('horodate createdAt en datetime local à la seconde (#84)', () => {
    const res = add({ title: 'Horodatée' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  })

  it('un add sans team réussit (team supprimée du modèle, #230)', () => {
    const res = add({ title: 'Sans team' })
    expect(res.ok).toBe(true)
  })

  it('rejette (rollback) un heat hors bornes (>100)', () => {
    const res = add({ heat: 150 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('heat'))).toBe(true)
  })
})

describe('updateTask', () => {
  it('modifie un champ et le persiste', () => {
    add()
    const res = updateTask(dir, 1, { title: 'Titre modifié', heat: 60 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].title).toBe('Titre modifié')
    expect(sectionOf(res.tree).tasks[0].heat).toBe(60)
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

  it('rollback quand on met un heat hors bornes', () => {
    add()
    const res = updateTask(dir, 1, { heat: 150 })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.errors.some((e) => e.includes('heat'))).toBe(true)
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

describe('kind (task | milestone, #250 — quick supprimé)', () => {
  it('addTask kind: milestone écrit "kind: milestone" juste après id', () => {
    const res = add({ title: 'Jalon v1', kind: 'milestone' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task?.kind).toBe('milestone')
    const yamlText = readFileSync(join(dir, SEC, '01-jalon-v1.yaml'), 'utf8')
    expect(yamlText.indexOf('kind:')).toBeGreaterThan(yamlText.indexOf('id:'))
    expect(yamlText.indexOf('kind:')).toBeLessThan(yamlText.indexOf('title:'))
  })

  it('addTask ne matérialise JAMAIS "kind: quick" (le kind quick est retombé sur task)', () => {
    const res = add({ title: 'Ex quick', kind: 'quick' as any })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task?.kind).toBe('task')
    expect(readFileSync(join(dir, SEC, '01-ex-quick.yaml'), 'utf8')).not.toContain('kind:')
  })

  it('une tâche normale (kind absent) ne matérialise JAMAIS "kind: null" dans le YAML', () => {
    add({ title: 'Normale' })
    const yamlText = readFileSync(join(dir, SEC, '01-normale.yaml'), 'utf8')
    expect(yamlText).not.toContain('kind:')
    // et un update ultérieur ne le fait pas non plus apparaître (le fichier ne change pas de nom)
    updateTask(dir, 1, { detail: 'toujours normale' })
    expect(readFileSync(join(dir, SEC, '01-normale.yaml'), 'utf8')).not.toContain('kind:')
  })

  it('doneTask sans outcome NE bloque PLUS (plus d\'exception quick) — verification non bloquante', () => {
    add({ title: 'Trivial', refs: ['src/x.ts'] }) // refs pour éviter le warning refs
    startTask(dir, 1)
    const res = doneTask(dir, 1, {})
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(sectionOf(res.tree).tasks[0].status).toBe('done')
    expect(sectionOf(res.tree).tasks[0].verification).toBeNull()
  })

  it('doneTask sur une task SANS refs → succès + warning non bloquant', () => {
    add({ title: 'Sans refs' }) // refs vides par défaut
    const res = doneTask(dir, 1, { outcome: 'livré' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings?.some((w) => w.includes('refs'))).toBe(true)
  })

  it('doneTask sur une task AVEC refs → aucun warning', () => {
    add({ title: 'Avec refs', refs: ['docs/x.md'] })
    const res = doneTask(dir, 1, { outcome: 'livré' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings ?? []).toEqual([])
  })
})

describe('updatedAt (#147 Live 4)', () => {
  const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
  it('addTask écrit updatedAt et toute écriture le re-date (bump)', () => {
    const res = add({ title: 'Live ticket' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.updatedAt).toMatch(DATETIME)
    const file = join(dir, SEC, '01-live-ticket.yaml')
    expect(readFileSync(file, 'utf8')).toContain('updatedAt:')
    // Force une vieille valeur puis patch → doit être re-daté (preuve du bump, sans
    // dépendre du timing seconde-à-seconde).
    writeFileSync(file, readFileSync(file, 'utf8').replace(/updatedAt:.*/, 'updatedAt: 2020-01-01T00:00:00'))
    updateTask(dir, 1, { detail: 'edited' })
    const after = readFileSync(file, 'utf8')
    expect(after).not.toContain('2020-01-01T00:00:00')
    expect(after).toMatch(/updatedAt: "?\d{4}-/)
  })
})

describe('feedback[] (#149)', () => {
  it('additif : absent quand vide, et un feedback survit à un update sans rapport (round-trip dump)', () => {
    add({ title: 'Feedback task' })
    const file = join(dir, SEC, '01-feedback-task.yaml')
    expect(readFileSync(file, 'utf8')).not.toContain('feedback:')
    // Injecte un retour dans le YAML, relit via le parser.
    writeFileSync(file, readFileSync(file, 'utf8') +
      '\nfeedback:\n  - date: "2026-07-09T10:00:00"\n    author: remi\n    text: "revoir le wording"\n    resolved: false\n')
    let t = findTask(readTree(dir), 1)!.task
    expect(t.feedback).toHaveLength(1)
    expect(t.feedback![0].text).toBe('revoir le wording')
    // Un update sans rapport préserve le feedback (dump additif le réécrit).
    updateTask(dir, 1, { detail: 'x' })
    t = findTask(readTree(dir), 1)!.task
    expect(t.feedback).toHaveLength(1)
    expect(readFileSync(file, 'utf8')).toContain('feedback:')
  })
})

describe('mode feedback (#149)', () => {
  const fb = (id: number) => findTask(readTree(dir), id)!.task.feedback ?? []

  it('addFeedback ajoute un item open (date/author/text/resolved)', () => {
    add({ title: 'Iterated' })
    const res = addFeedback(dir, 1, { text: 'revoir le wording', author: 'remi' })
    expect(res.ok).toBe(true)
    const items = fb(1)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ author: 'remi', text: 'revoir le wording', resolved: false })
    expect(items[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('author par défaut = user', () => {
    add({ title: 'Iterated' })
    addFeedback(dir, 1, { text: 'x' })
    expect(fb(1)[0].author).toBe('user')
  })

  it('reopen (start sur une tâche done) efface completedAt', () => {
    add({ title: 'Iterated' })
    startTask(dir, 1)
    doneTask(dir, 1, { outcome: 'v1' })
    expect(findTask(readTree(dir), 1)!.task.completedAt).not.toBeNull()
    startTask(dir, 1) // réouverture
    const t = findTask(readTree(dir), 1)!.task
    expect(t.status).toBe('in_progress')
    expect(t.completedAt).toBeNull()
  })

  it('updateTask remplace le tableau feedback (chemin UI : lit/modifie/renvoie)', () => {
    add({ title: 'Iterated' })
    addFeedback(dir, 1, { text: 'a' })
    // L'UI renvoie le tableau complet modifié (ici : marque le 1er résolu + en ajoute un).
    const cur = fb(1)
    const next = [{ ...cur[0], resolved: true }, { date: '2026-07-09T12:00:00', author: 'rémi', text: 'b', resolved: false }]
    const res = updateTask(dir, 1, { feedback: next })
    expect(res.ok).toBe(true)
    const items = fb(1)
    expect(items).toHaveLength(2)
    expect(items[0].resolved).toBe(true)
    expect(items[1].text).toBe('b')
  })

  it("done --resolve-feedback 'all' résout tous les retours ; positions 1-based ciblent", () => {
    add({ title: 'Iterated' })
    addFeedback(dir, 1, { text: 'a' })
    addFeedback(dir, 1, { text: 'b' })
    startTask(dir, 1)
    doneTask(dir, 1, { outcome: 'ok', resolveFeedback: [1] }) // seul le 1er
    let items = fb(1)
    expect(items[0].resolved).toBe(true)
    expect(items[1].resolved).toBe(false)
    startTask(dir, 1)
    doneTask(dir, 1, { outcome: 'ok', resolveFeedback: 'all' })
    items = fb(1)
    expect(items.every((f) => f.resolved)).toBe(true)
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
    expect(s.title).toBe('Features') // titre canonique inchangé (02-feature)
    expect(s.status).toBe('dormant')
    expect(s.note).toBe('en veille')
  })

  it('rollback si on renomme un type hors de son titre canonique', () => {
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

describe('addTask/updateTask — dependsOn & epic', () => {
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

  it('updateTask pose puis vide dependsOn ; pose un epic (aucune déclaration exigée)', () => {
    add({ title: 'A' }) // #1
    add({ title: 'B' }) // #2
    expect(updateTask(dir, 2, { dependsOn: [1], epic: 'socle' }).ok).toBe(true)
    const set = sectionOf(readTree(dir)).tasks.find((t) => t.id === 2)!
    expect(set.dependsOn).toEqual([1])
    expect(set.epic).toBe('socle')
    expect(updateTask(dir, 2, { dependsOn: [] }).ok).toBe(true)
    expect(sectionOf(readTree(dir)).tasks.find((t) => t.id === 2)!.dependsOn).toEqual([])
  })

  it('updateTask rejette un epic non-slug (rollback)', () => {
    add({ title: 'A' }) // #1
    const res = updateTask(dir, 1, { epic: 'Pas Un Slug' })
    expect(res.ok).toBe(false)
  })

  it('addTask sérialise epic (jamais milestone) entre dependsOn et source', () => {
    const res = add({ title: 'Groupée', epic: 'refonte-graphe' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.epic).toBe('refonte-graphe')
    const yamlText = readFileSync(join(dir, SEC, '01-groupee.yaml'), 'utf8')
    expect(yamlText).toContain('epic: refonte-graphe')
    expect(yamlText).not.toContain('milestone')
    expect(yamlText.indexOf('dependsOn:')).toBeLessThan(yamlText.indexOf('epic:'))
    expect(yamlText.indexOf('epic:')).toBeLessThan(yamlText.indexOf('source:'))
  })

  it('rétrocompat : un YAML legacy avec milestone migre vers epic au prochain patch (valeur préservée)', () => {
    // Fichier écrit À LA MAIN au format d'avant #133.
    writeFileSync(
      join(dir, SEC, '01-legacy.yaml'),
      [
        'id: 1', 'title: "Legacy"', 'status: todo', 'tags: []', 'size: null',
        'detail: null', 'refs: []', 'links: []', 'dependsOn: []',
        'milestone: socle', 'source: ai', 'createdAt: "2026-07-07"', 'completedAt: null',
        'commit: null', 'outcome: null', 'verification: null', 'release: null', '',
      ].join('\n'),
    )
    writeFileSync(join(dir, '_meta.yaml'), 'nextId: 2\n')
    // Lecture : milestone est lu comme epic.
    expect(sectionOf(readTree(dir)).tasks[0].epic).toBe('socle')
    // Patch quelconque → le dump réécrit epic (valeur préservée) et supprime milestone.
    expect(updateTask(dir, 1, { detail: 'migrée' }).ok).toBe(true)
    const yamlText = readFileSync(join(dir, SEC, '01-legacy.yaml'), 'utf8')
    expect(yamlText).toContain('epic: socle')
    expect(yamlText).not.toContain('milestone')
  })

  it('rétrocompat : vider l\'epic d\'un YAML legacy ne ressuscite PAS la valeur milestone', () => {
    writeFileSync(
      join(dir, SEC, '01-legacy.yaml'),
      'id: 1\ntitle: "Legacy"\nstatus: todo\nmilestone: socle\nsource: ai\ncreatedAt: "2026-07-07"\n',
    )
    writeFileSync(join(dir, '_meta.yaml'), 'nextId: 2\n')
    expect(updateTask(dir, 1, { epic: null }).ok).toBe(true)
    expect(sectionOf(readTree(dir)).tasks[0].epic).toBeNull()
    expect(readFileSync(join(dir, SEC, '01-legacy.yaml'), 'utf8')).toContain('epic: null')
  })
})

describe('kind milestone (jalons, #133)', () => {
  it('addTask kind: milestone écrit "kind: milestone" juste après id', () => {
    const res = add({ title: 'Socle prêt', kind: 'milestone' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.task!.kind).toBe('milestone')
    const yamlText = readFileSync(join(dir, SEC, '01-socle-pret.yaml'), 'utf8')
    expect(yamlText).toContain('kind: milestone')
    expect(yamlText.indexOf('kind:')).toBeGreaterThan(yamlText.indexOf('id:'))
    expect(yamlText.indexOf('kind:')).toBeLessThan(yamlText.indexOf('title:'))
  })

  it('dumpTask n\'écrit kind QUE si ≠ task : une task normale reste sans champ kind', () => {
    add({ title: 'Normale' })
    updateTask(dir, 1, { detail: 'patchée' })
    expect(readFileSync(join(dir, SEC, '01-normale.yaml'), 'utf8')).not.toContain('kind:')
  })

  it('un jalon non-done verrouille ses dépendants via dependsOn (aucune logique nouvelle)', () => {
    add({ title: 'Jalon', kind: 'milestone' }) // #1
    add({ title: 'Dépendante', dependsOn: [1] }) // #2
    // Le verrou est porté par computeAvailability (testé dans roadmap.test.ts) —
    // ici on vérifie juste que la donnée persiste comme pour toute dépendance.
    const t2 = sectionOf(readTree(dir)).tasks.find((t) => t.id === 2)!
    expect(t2.dependsOn).toEqual([1])
  })

  it('doneTask sur un jalon sans refs → AUCUN warning (un jalon est un marqueur, pas du travail)', () => {
    add({ title: 'Jalon', kind: 'milestone' })
    const res = doneTask(dir, 1, { outcome: 'atteint' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.warnings ?? []).toEqual([])
  })
})

describe('saveEpics', () => {
  it('crée _epics.yaml et le relit dans tree.epics', () => {
    const res = saveEpics(dir, { epics: [{ slug: 'socle', title: 'Socle' }] })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(existsSync(join(dir, '_epics.yaml'))).toBe(true)
    expect(res.tree.epics).toEqual([{ slug: 'socle', title: 'Socle' }])
  })

  it('rejette un body sans tableau epics ({} ou clé mal orthographiée) SANS toucher le fichier', () => {
    saveEpics(dir, { epics: [{ slug: 'socle', title: 'Socle' }] })
    for (const body of [{}, { epics: 'oops' }, { epic: [] }]) {
      const res = saveEpics(dir, body as any)
      expect(res.ok).toBe(false)
      if (res.ok) return
      expect(res.errors.length).toBeGreaterThan(0)
    }
    // le fichier existant est intact (pas écrasé par une liste vide)
    expect(readFileSync(join(dir, '_epics.yaml'), 'utf8')).toContain('socle')
  })

  it('rejette un epic sans slug/title string non vide', () => {
    expect(saveEpics(dir, { epics: [{ title: 'Sans slug' }] }).ok).toBe(false)
    expect(saveEpics(dir, { epics: [{ slug: 'x' }] }).ok).toBe(false)
    expect(existsSync(join(dir, '_epics.yaml'))).toBe(false) // rien n'a été écrit
  })

  it('rejette les slugs dupliqués dans la requête', () => {
    const res = saveEpics(dir, { epics: [{ slug: 'x', title: 'X' }, { slug: 'x', title: 'X bis' }] })
    expect(res.ok).toBe(false)
    expect(existsSync(join(dir, '_epics.yaml'))).toBe(false)
  })

  it('retirer un epic déclaré encore porté par une tâche reste OK (aucune exigence de déclaration)', () => {
    saveEpics(dir, { epics: [{ slug: 'socle', title: 'Socle' }] })
    add({ title: 'T', epic: 'socle' }) // #1 sur "socle"
    const res = saveEpics(dir, { epics: [] })
    expect(res.ok).toBe(true) // l'epic devient simplement auto-découvert
  })
})

describe('moveTask (#251) — changer le type déplace le fichier', () => {
  it('déplace la tâche dans le dossier du nouveau type', () => {
    const c = add(); if (!c.ok) return; const created = c.task!
    expect(created.file).toContain('02-feature/')
    const res = moveTask(dir, created.id, '05-design')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    const moved = findTask(res.tree, created.id)!.task
    expect(moved.file).toContain('05-design/')
    expect(moved.file).not.toContain('02-feature/')
    expect(existsSync(join(dir, '02-feature', '01-tache.yaml'))).toBe(false) // ancien fichier supprimé
  })
  it('rejette un type inconnu, laisse la tâche en place', () => {
    const c = add(); if (!c.ok) return; const created = c.task!
    const res = moveTask(dir, created.id, '99-bogus')
    expect(res.ok).toBe(false)
    expect(findTask(readTree(dir), created.id)!.task.file).toContain('02-feature/')
  })
  it('no-op si déjà dans le type', () => {
    const c = add(); if (!c.ok) return; const created = c.task!
    const res = moveTask(dir, created.id, SEC)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(findTask(res.tree, created.id)!.task.file).toContain('02-feature/')
  })
})
