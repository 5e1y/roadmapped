import { describe, it, expect } from 'vitest'
import { temperature, attachTemperatures, nextQueue } from './roadmap'
import type { TaskTree, TaskNode, SectionNode } from './tasks'

// Moteur de température (#234, phase 2). Spec : docs/specs/2026-07-09-next-temperature-brainstorm.md
// (partition TIERS ÉGAUX). `today` figé pour rester déterministe.
const TODAY = '2026-07-09'

/** Tâche minimale ; son `file` porte la section (= le type), d'où la base est lue. */
function mk(
  id: number,
  sectionSlug: string,
  createdAt: string,
  opts: { heat?: number | null; deps?: number[]; status?: TaskNode['status'] } = {},
): TaskNode {
  return {
    id, kind: 'task', code: null, title: `#${id}`, status: opts.status ?? 'todo', tags: [], size: null,
    heat: opts.heat ?? null, detail: null, refs: [], links: [], dependsOn: opts.deps ?? [], epic: null,
    source: 'ai', createdAt, startedAt: null, completedAt: null, commit: null, outcome: null,
    verification: null, release: null, file: `docs/tasks/${sectionSlug}/${id}.yaml`, subtasks: [],
  }
}

/** Arbre : chaque section porte son `baseHeat` (null = exercer le fallback code). */
function tree(sections: Array<{ key: string; baseHeat: number | null; tasks: TaskNode[] }>): TaskTree {
  const secs: SectionNode[] = sections.map((s) => ({
    key: s.key, title: s.key, status: 'open', note: null, baseHeat: s.baseHeat, tasks: s.tasks,
  }))
  return { nextId: 99999, sections: secs, epics: [] }
}

/** N tâches « bloquées » qui dépendent de `target` — donnent le b transitif du target. */
function blockers(target: number, n: number, startId: number): TaskNode[] {
  return Array.from({ length: n }, (_, i) => mk(startId + i, '02-feature', '2026-07-01', { deps: [target] }))
}

describe('temperature — mini-exemple du doc (§3), au centième', () => {
  // Reproduit exactement la table du doc : aujourd'hui = 2026-07-09.
  const t48 = mk(48, '08-legal', '2026-06-09', { heat: 100 }) //  legal, 30j, 0 bloqué, seed max
  const t320 = mk(320, '01-bug', '2026-05-10') //                bug, 60j, bloque 8
  const t310 = mk(310, '05-design', '2026-07-07', { heat: 100 }) // design, 2j, seed max
  const t150 = mk(150, '03-chore', '2026-03-31') //             chore, 100j, bloque 6
  const t205 = mk(205, '07-communication', '2026-07-01') //     comm, 8j, bloque 1
  const t = tree([
    { key: '01-bug', baseHeat: 30, tasks: [t320] },
    { key: '02-feature', baseHeat: 14, tasks: [...blockers(320, 8, 1000), ...blockers(150, 6, 2000), ...blockers(205, 1, 3000)] },
    { key: '03-chore', baseHeat: 5, tasks: [t150] },
    { key: '05-design', baseHeat: 12, tasks: [t310] },
    { key: '07-communication', baseHeat: 7, tasks: [t205] },
    { key: '08-legal', baseHeat: 18, tasks: [t48] },
  ])

  it('les 5 températures tombent au centième près', () => {
    expect(temperature(t, t48, TODAY).value).toBe(54.67)
    expect(temperature(t, t320, TODAY).value).toBe(48.67)
    expect(temperature(t, t310, TODAY).value).toBe(45.62)
    expect(temperature(t, t150, TODAY).value).toBe(24.02)
    expect(temperature(t, t205, TODAY).value).toBe(12.09)
  })

  it('la décomposition {auto, base, seed} correspond', () => {
    expect(temperature(t, t48, TODAY)).toEqual({ value: 54.67, auto: 3.33, base: 18, seed: 33.33 })
    expect(temperature(t, t320, TODAY)).toEqual({ value: 48.67, auto: 18.67, base: 30, seed: 0 })
    expect(temperature(t, t310, TODAY)).toEqual({ value: 45.62, auto: 0.29, base: 12, seed: 33.33 })
  })

  it('LE cas de Rémi : le bug non seedé (#320) passe devant le design seed-maxé (#310)', () => {
    // 48,67° > 45,62° : le réel (base 30 + bloque 8 + 60j) bat le boost manuel.
    expect(temperature(t, t320, TODAY).value).toBeGreaterThan(temperature(t, t310, TODAY).value)
  })

  it('la file servie est #48 → #320 → #310 → #150 → #205', () => {
    expect(nextQueue(t, { today: TODAY }).filter((x) => x.id < 1000).map((x) => x.id))
      .toEqual([48, 320, 310, 150, 205])
  })
})

describe('temperature — les trois tiers', () => {
  it('seed = heat / 3 ; heat absent = 0', () => {
    const noheat = mk(1, '03-chore', TODAY) //   base chore 5, auto 0, seed 0
    const seeded = mk(2, '03-chore', TODAY, { heat: 60 }) // seed 20
    expect(temperature(tree([{ key: '03-chore', baseHeat: 5, tasks: [noheat, seeded] }]), noheat, TODAY).seed).toBe(0)
    expect(temperature(tree([{ key: '03-chore', baseHeat: 5, tasks: [noheat, seeded] }]), seeded, TODAY).seed).toBe(20)
  })

  it('base lue du baseHeat du JALON (custom) — la section commande', () => {
    const task = mk(1, '01-bug', TODAY) // âge 0, pas de seed → T° = base
    const custom = tree([{ key: '01-bug', baseHeat: 10, tasks: [task] }])
    expect(temperature(custom, task, TODAY)).toEqual({ value: 10, auto: 0, base: 10, seed: 0 })
  })

  it('base : FALLBACK code quand _section.yaml n’a pas baseHeat (défaut 30 pour bug)', () => {
    const task = mk(1, '01-bug', TODAY)
    const fallback = tree([{ key: '01-bug', baseHeat: null, tasks: [task] }])
    expect(temperature(fallback, task, TODAY).base).toBe(30)
  })

  it('auto : la ceinture 33,33 est une borne HAUTE jamais dépassée (saturations asymptotiques)', () => {
    // 20·B + 13,33·A avec B,A ∈ [0,1) ne peut jamais atteindre 33,33 (20+13,33=33,33) :
    // le min() est une ceinture défensive, l'auto s'en approche sans jamais l'atteindre (§2.2).
    const hub = mk(1, '01-bug', '2020-01-01') // très vieux
    const t = tree([{ key: '01-bug', baseHeat: 0, tasks: [hub, ...blockers(1, 50, 5000)] }])
    const auto = temperature(t, hub, TODAY).auto
    expect(auto).toBeLessThanOrEqual(33.33)
    expect(auto).toBeGreaterThan(31) // 50 blocages + 6 ans d'âge → haut dans le tiers
  })
})

describe('temperature — âge en dates LOCALES (fix #232)', () => {
  it('createdAt date-seule : l’âge est un nombre de jours calendaires (pas de dérive UTC)', () => {
    // 2026-06-09 → 2026-07-09 = 30 jours pile.
    const t = mk(1, '01-bug', '2026-06-09')
    // A = 30/120 = 0,25 ; auto = 13,33·0,25 = 3,3325 → 3,33.
    expect(temperature(tree([{ key: '01-bug', baseHeat: 0, tasks: [t] }]), t, TODAY).auto).toBe(3.33)
  })

  it('createdAt dans le futur → âge borné à 0 (auto = 0)', () => {
    const t = mk(1, '01-bug', '2099-01-01')
    expect(temperature(tree([{ key: '01-bug', baseHeat: 0, tasks: [t] }]), t, TODAY).auto).toBe(0)
  })
})

describe('temperature — b transitif (fermeture aval)', () => {
  it('compte les descendants transitifs, pas seulement directs', () => {
    // 1 ← 2 ← 3 (chaîne) : #1 bloque 2 tickets (2 et 3), transitivement.
    const t1 = mk(1, '02-feature', TODAY)
    const t2 = mk(2, '02-feature', TODAY, { deps: [1] })
    const t3 = mk(3, '02-feature', TODAY, { deps: [2] })
    const t = tree([{ key: '02-feature', baseHeat: 0, tasks: [t1, t2, t3] }])
    // b(1) = 2 → B = 2/6 = 0,3333 → auto = 20·0,3333 = 6,67.
    expect(temperature(t, t1, TODAY).auto).toBe(6.67)
  })

  it('ne compte pas les descendants DONE', () => {
    const t1 = mk(1, '02-feature', TODAY)
    const done = mk(2, '02-feature', TODAY, { deps: [1], status: 'done' })
    const t = tree([{ key: '02-feature', baseHeat: 0, tasks: [t1, done] }])
    expect(temperature(t, t1, TODAY).auto).toBe(0) // b = 0 → auto 0
  })
})

describe('nextQueue — tri par température', () => {
  it('un bug frais (base 30) passe devant une feature plus ANCIENNE (base 14)', () => {
    const bug = mk(2, '01-bug', TODAY) //           T° = 30
    const feat = mk(1, '02-feature', '2026-01-01') // base 14 + un peu d'âge < 30
    const t = tree([
      { key: '01-bug', baseHeat: 30, tasks: [bug] },
      { key: '02-feature', baseHeat: 14, tasks: [feat] },
    ])
    expect(nextQueue(t, { today: TODAY }).map((x) => x.id)).toEqual([2, 1])
  })

  it('jamais une tâche verrouillée (filtre computeAvailability inchangé)', () => {
    const locked = mk(2, '01-bug', TODAY, { deps: [1] }) // dep #1 pas done
    const open = mk(1, '02-feature', TODAY)
    const t = tree([
      { key: '01-bug', baseHeat: 30, tasks: [locked] },
      { key: '02-feature', baseHeat: 14, tasks: [open] },
    ])
    // #2 serait plus chaud (bug) mais il est locked → absent ; seule #1 sort.
    expect(nextQueue(t, { today: TODAY }).map((x) => x.id)).toEqual([1])
  })
})

describe('attachTemperatures', () => {
  it('attache température + décomposition à chaque tâche (sous-tâches comprises)', () => {
    const parent = mk(1, '01-bug', TODAY)
    parent.subtasks = [mk(2, '01-bug', TODAY)]
    const t = tree([{ key: '01-bug', baseHeat: 30, tasks: [parent] }])
    attachTemperatures(t, TODAY)
    expect(t.sections[0].tasks[0].temperature).toEqual({ value: 30, auto: 0, base: 30, seed: 0 })
    expect(t.sections[0].tasks[0].subtasks[0].temperature?.value).toBe(30)
  })
})
