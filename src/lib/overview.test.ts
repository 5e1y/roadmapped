import { describe, it, expect } from 'vitest'
import { mostUrgent, oldest, recentlyAdded, createdVsClosedByWeek } from './overview'
import { ageInDays } from './roadmap'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

/** Fabrique une tâche minimale ; les champs non pertinents prennent des défauts. */
function task(id: number, over: Partial<TaskNode> = {}): TaskNode {
  return {
    id, kind: 'task', title: `T${id}`, status: 'todo', tags: [], detail: null,
    refs: [], links: [], dependsOn: [], epic: null, source: 'ai',
    createdAt: '2026-07-07', startedAt: null, completedAt: null, commit: null,
    outcome: null, verification: null, release: null, heat: null,
    file: `docs/tasks/01-x/${id}.yaml`, subtasks: [], ...over,
  }
}
function tree(tasks: TaskNode[], epics: TaskTree['epics'] = []): TaskTree {
  const sec: SectionNode = { key: '01-x', title: '01-x', status: 'open', note: null, tasks }
  return { nextId: 999, sections: [sec], epics }
}

describe('ageInDays (réexporté #374)', () => {
  it('compte les jours entiers en dates locales, plancher 0', () => {
    expect(ageInDays('2026-07-07', '2026-07-17')).toBe(10)
    expect(ageInDays('2026-07-17', '2026-07-07')).toBe(0) // futur → 0
  })
})

describe('mostUrgent — ordre température desc, id asc en tie-break', () => {
  it("respecte l'ordre de température (deps aval + âge + seed), pas l'ordre de liste", () => {
    // #1 : ancien + bloque #2 et #3 → chaud. #2 : récent, ne bloque rien → froid.
    // #3 : ancien, seed élevé → chaud aussi. today lointain pour peser l'âge.
    const t = tree([
      task(1, { createdAt: '2026-01-01', heat: 0 }),
      task(2, { createdAt: '2026-07-01', heat: 0, dependsOn: [1] }),
      task(3, { createdAt: '2026-01-01', heat: 90, dependsOn: [1] }),
    ])
    const ranked = mostUrgent(t, 3, '2026-07-18').map((x) => x.id)
    // #3 (âge + seed max) et #1 (âge + bloque 2) devant #2 (jeune, feuille).
    expect(ranked[2]).toBe(2)
    expect(new Set(ranked.slice(0, 2))).toEqual(new Set([1, 3]))
    expect(ranked[0]).toBe(3) // seed 90/3 = 30 fait passer #3 devant #1
  })
  it('exclut les done et borne à N', () => {
    const t = tree([task(1), task(2), task(3, { status: 'done' })])
    const r = mostUrgent(t, 1, '2026-07-18')
    expect(r).toHaveLength(1)
    expect(r.every((x) => x.status !== 'done')).toBe(true)
  })
})

describe('oldest / recentlyAdded — tris et fallback id', () => {
  const t = tree([
    task(1, { createdAt: '2026-07-10' }),
    task(2, { createdAt: '2026-07-05' }),
    task(3, { createdAt: '2026-07-20' }),
    task(9, { status: 'done', createdAt: '2026-01-01' }), // done → jamais listé
  ])
  it('oldest : createdAt croissant', () => {
    expect(oldest(t, 3).map((x) => x.id)).toEqual([2, 1, 3])
  })
  it('recentlyAdded : createdAt décroissant', () => {
    expect(recentlyAdded(t, 3).map((x) => x.id)).toEqual([3, 1, 2])
  })
  it('fallback id : dates égales → id asc (oldest) / id desc (recentlyAdded)', () => {
    const eq = tree([
      task(5, { createdAt: '2026-07-07' }),
      task(2, { createdAt: '2026-07-07' }),
      task(8, { createdAt: '2026-07-07' }),
    ])
    expect(oldest(eq, 3).map((x) => x.id)).toEqual([2, 5, 8])
    expect(recentlyAdded(eq, 3).map((x) => x.id)).toEqual([8, 5, 2])
  })
  it('borne à N et exclut les done', () => {
    expect(oldest(t, 2).map((x) => x.id)).toEqual([2, 1])
    expect(oldest(t, 99).some((x) => x.id === 9)).toBe(false)
  })
})

describe('createdVsClosedByWeek — buckets, semaines vides, frontière locale', () => {
  it('bucketise par semaine ISO (lundi) et comble les trous', () => {
    // Créations : semaine du 29/06 (lun) et du 20/07 (lun). Fermeture : semaine du 06/07.
    // Les semaines 06/07 et 13/07 sont vides côté "created" mais doivent exister.
    const t = tree([
      task(1, { createdAt: '2026-06-30' }), // mardi → lundi 29/06
      task(2, { createdAt: '2026-06-29' }), // lundi 29/06
      task(3, { createdAt: '2026-07-20', status: 'done', completedAt: '2026-07-08' }),
      // #3 créé sem. 20/07, fermé sem. 06/07 (mer 08/07 → lundi 06/07)
    ])
    const w = createdVsClosedByWeek(t)
    expect(w.map((b) => b.weekStart)).toEqual([
      '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-20',
    ])
    expect(w[0]).toEqual({ weekStart: '2026-06-29', created: 2, closed: 0 })
    expect(w[1]).toEqual({ weekStart: '2026-07-06', created: 0, closed: 1 }) // semaine comblée + fermeture
    expect(w[2]).toEqual({ weekStart: '2026-07-13', created: 0, closed: 0 }) // trou comblé
    expect(w[3]).toEqual({ weekStart: '2026-07-20', created: 1, closed: 0 })
  })

  it('frontière dimanche→lundi : parse LOCAL, pas UTC (le dimanche reste dans SA semaine)', () => {
    // 2026-07-19 est un DIMANCHE → semaine du lundi 13/07.
    // 2026-07-20 est un LUNDI → semaine du 20/07.
    // Datetime sans offset près de minuit : new Date("2026-07-19T23:30:00") serait
    // local, mais new Date("2026-07-19") (date nue) serait UTC → risque de bascule.
    // isoMonday slice la date nue → toujours le bon jour local.
    const t = tree([
      task(1, { createdAt: '2026-07-19T23:30:00' }), // dimanche tard → sem. 13/07
      task(2, { createdAt: '2026-07-20T00:15:00' }), // lundi tôt → sem. 20/07
    ])
    const w = createdVsClosedByWeek(t)
    expect(w.map((b) => b.weekStart)).toEqual(['2026-07-13', '2026-07-20'])
    expect(w[0].created).toBe(1) // le dimanche N'a PAS basculé dans la semaine du 20
    expect(w[1].created).toBe(1)
  })

  it('aucun ticket → tableau vide', () => {
    expect(createdVsClosedByWeek(tree([]))).toEqual([])
  })
})
