import { describe, it, expect } from 'vitest'
import { validateTaskTree, validateIdUniquenessAcrossFiles, detectLegacyModel } from './validate'
import { buildTaskTree } from './tasks'
import { stageSectionFiles } from './stageFixtures'

describe('validateTaskTree', () => {
  it('signale une tâche sans title', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': [
        'id: 1', 'status: todo', 'tags: []', 'size: null', 'zone: null',
        'detail: null', 'refs: []', 'links: []', 'source: ai',
        'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'), // pas de "title"
    }
    const tree = buildTaskTree(files)
    const errors = validateTaskTree(tree)
    // NOTE: TaskNode (Task 2) ne conserve pas le nom de fichier — le path lisible
    // produit par validateTaskTree est `${section.key}/${task.id}` (ex: "01-x/1"),
    // pas le nom de fichier YAML. Assertion ajustée pour matcher le path réel.
    expect(errors.some((e) => e.includes('01-x/1') && e.includes('title'))).toBe(true)
  })

  it('signale un status invalide', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': [
        'id: 1', 'title: "T"', 'status: presque-fait', 'tags: []', 'size: null',
        'zone: null', 'detail: null', 'refs: []', 'links: []', 'source: ai',
        'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    const errors = validateTaskTree(tree)
    expect(errors.some((e) => e.includes('status'))).toBe(true)
  })

  it('signale deux tâches avec le même id', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': [
        'id: 1', 'title: "A"', 'status: todo', 'tags: []', 'size: null', 'zone: null',
        'detail: null', 'refs: []', 'links: []', 'source: ai',
        'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
      '/docs/tasks/01-x/02-task.yaml': [
        'id: 1', 'title: "B"', 'status: todo', 'tags: []', 'size: null', 'zone: null',
        'detail: null', 'refs: []', 'links: []', 'source: ai',
        'createdAt: "2026-07-06"', 'completedAt: null', 'commit: null',
        'verification: null', 'release: null',
      ].join('\n'),
    }
    const tree = buildTaskTree(files)
    const errors = validateTaskTree(tree)
    expect(errors.some((e) => e.includes('id') && e.includes('1'))).toBe(true)
  })
})

describe('validateIdUniquenessAcrossFiles', () => {
  it('détecte une collision avec un fichier que buildTaskTree ne parse pas (résidu de dossier, angle mort)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      // Résidu (ex-_archive, dossier sans _section.yaml) : hors arbre, mais son id reste réservé.
      '/docs/tasks/_archive/02-y/01-task.yaml': 'id: 1\ntitle: "Résidu"\n',
    }
    // validateTaskTree ne voit que les sections parsées → seul, il rate la collision.
    const tree = buildTaskTree(files)
    expect(validateTaskTree(tree).some((e) => e.includes('dupliqué'))).toBe(false)
    // Le passage sur les fichiers bruts, lui, la voit.
    const errors = validateIdUniquenessAcrossFiles(files)
    expect(errors.some((e) => e.includes('id 1') && e.includes('dupliqué'))).toBe(true)
  })

  it('ne signale rien quand tous les ids sont uniques', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      '/docs/tasks/01-x/02-task.yaml': 'id: 2\ntitle: "Autre"\n',
    }
    expect(validateIdUniquenessAcrossFiles(files)).toEqual([])
  })

  it('signale un nextId <= id max GLOBAL, y compris quand le max vit dans un fichier hors arbre', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      '/docs/tasks/_archive/02-y/01-task.yaml': 'id: 5\ntitle: "Résidu"\n',
    }
    // validateTaskTree (sections parsées : max=1, nextId=2) ne voit pas le problème de nextId…
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('nextId'))).toBe(false)
    // …le passage global, si : id 5 réservé => nextId 2 garantirait une collision.
    const errors = validateIdUniquenessAcrossFiles(files)
    expect(errors.some((e) => e.includes('nextId') && e.includes('5'))).toBe(true)
  })
})

describe('validateTaskTree — deps & epics', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const sec = '/docs/tasks/01-x/_section.yaml'
  const task = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T${id}"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n${extra}`

  it('signale une dépendance vers un id inexistant', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(1, 'dependsOn: [999]\n'),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('#1') && e.includes('999') && e.includes('inexistante'))).toBe(true)
  })

  it('signale une auto-dépendance', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(1, 'dependsOn: [1]\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('auto-dépendance'))).toBe(true)
  })

  it('signale un cycle avec les ids du cycle', () => {
    const files = {
      [meta]: 'nextId: 3\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-a.yaml': task(1, 'dependsOn: [2]\n'),
      '/docs/tasks/01-x/02-b.yaml': task(2, 'dependsOn: [1]\n'),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('cyclique') && e.includes('#1') && e.includes('#2'))).toBe(true)
  })

  it('accepte un epic NON déclaré (simple tag partagé, aucune déclaration exigée)', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(1, 'epic: refonte-graphe\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('epic'))).toBe(false)
  })

  it('rejette un epic qui n\'est pas un slug (majuscules/espaces)', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(1, 'epic: "Refonte du Graphe"\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('epic invalide'))).toBe(true)
  })

  it('rétrocompat : un ancien champ milestone est lu comme epic et validé comme tel', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(1, 'milestone: socle\n'),
    }
    // slug valide → aucune erreur epic ; aucune exigence de déclaration
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('epic'))).toBe(false)
  })

  it("signale un slug d'epic dupliqué dans _epics.yaml", () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/_epics.yaml': [
        'epics:',
        '  - { slug: dup, title: "D" }',
        '  - { slug: dup, title: "D2" }',
      ].join('\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('dup') && e.includes('dupliqué'))).toBe(true)
  })

  it('une dépendance vers une tâche done du backlog est valide ; un id hors arbre est inexistant (#154)', () => {
    const ok = {
      [meta]: 'nextId: 3\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-done.yaml':
        'id: 1\ntitle: "Livrée"\nstatus: done\nsource: ai\ncreatedAt: "2026-06-01"\n',
      '/docs/tasks/01-x/02-t.yaml': task(2, 'dependsOn: [1]\n'),
    }
    expect(validateTaskTree(buildTaskTree(ok)).some((e) => e.includes('inexistante'))).toBe(false)

    const ko = {
      [meta]: 'nextId: 3\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/02-t.yaml': task(2, 'dependsOn: [1]\n'),
      // #1 ne vit que dans un résidu hors arbre (ex-_archive) : la dep est cassée.
      '/docs/tasks/_archive/09-old/01-done.yaml':
        'id: 1\ntitle: "Livrée"\nstatus: done\nsource: ai\ncreatedAt: "2026-06-01"\n',
    }
    expect(validateTaskTree(buildTaskTree(ko)).some((e) => e.includes('#2') && e.includes('inexistante'))).toBe(true)
  })

  it('rétrocompat : arbre sans aucun champ roadmap → zéro nouvelle erreur', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': task(1),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs).toEqual([])
  })
})

describe('validateTaskTree — kind (task | milestone, #250 — quick supprimé)', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const base = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T${id}"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n${extra}`

  it('REJETTE kind: quick sur une tâche active (message dédié #250)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': base(1, 'kind: quick\n'),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('quick') && e.includes('#250'))).toBe(true)
  })

  it('rejette un kind inconnu', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': base(1, 'kind: mega\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('kind'))).toBe(true)
  })

  it('accepte kind: task (défaut) et kind absent', () => {
    const files = {
      [meta]: 'nextId: 3\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': base(1, 'kind: task\n'),
      '/docs/tasks/02-feature/02-t.yaml': base(2),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('accepte kind: milestone (jalon, #133)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': base(1, 'kind: milestone\n'),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('un task done SANS outcome est valide (plus de requis outcome propre au quick)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml':
        'id: 1\ntitle: "T"\nstatus: done\nsource: ai\ncreatedAt: "2026-07-07"\ncompletedAt: "2026-07-07"\n',
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('un task en size L est valide (plus de garde-fou quick/L)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': base(1, 'size: L\n'),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

})

describe('validateTaskTree — 9 types canoniques + heat (#230)', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const okTask = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T${id}"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n${extra}`

  it('happy path : 9 types canoniques + une tâche → aucune erreur', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  // #84 : createdAt accepte les DEUX formats (date héritée + datetime), rejette le reste.
  const taskWithCreatedAt = (v: string) =>
    `id: 1\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "${v}"\n`

  it('createdAt datetime local à la seconde → accepté', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': taskWithCreatedAt('2026-07-08T22:58:41'),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('createdAt au format bidon → rejeté', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': taskWithCreatedAt('hier'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('createdAt format invalide'))).toBe(true)
  })

  it('rejette un dossier de section hors set canonique (10e type)', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/10-extra/_section.yaml': 'title: "Extra"\nstatus: open\nnote: null\n',
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('10-extra'))).toBe(true)
  })

  it('rejette un slug de section non canonique', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    // remplace le type 02-feature par un slug inconnu
    delete files['/docs/tasks/02-feature/_section.yaml']
    files['/docs/tasks/04-atelier/_section.yaml'] = 'title: "Atelier"\nstatus: open\nnote: null\n'
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('04-atelier'))).toBe(true)
    expect(errs.some((e) => e.includes('02-feature') && e.includes('manquant'))).toBe(true)
  })

  it('rejette un type manquant', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    delete files['/docs/tasks/09-business/_section.yaml']
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('09-business') && e.includes('manquant'))).toBe(true)
  })

  it('rejette un title de section non canonique', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    files['/docs/tasks/02-feature/_section.yaml'] = 'title: "Mauvais titre"\nstatus: open\nnote: null\n'
    const errs = validateTaskTree(buildTaskTree(files))
    // 02-feature exige EXACTEMENT le titre canonique "Features".
    expect(errs.some((e) => e.includes('02-feature') && e.includes('Features'))).toBe(true)
  })

  // team supprimée du modèle (#230) : validateIdUniquenessAcrossFiles (qui lit le YAML
  // brut, avant que toTaskNode ne laisse tomber le champ) REJETTE toute clé team: active.
  it('rejette toute clé "team" sur une tâche active (champ supprimé, #230)', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1, 'team: engineering\n'),
    }
    const errs = validateIdUniquenessAcrossFiles(files)
    expect(errs.some((e) => e.includes('team') && e.includes('interdit'))).toBe(true)
  })

  it('une tâche sans team (ni heat) est valide — l\'absence de heat = froid', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
    expect(validateIdUniquenessAcrossFiles(files)).toEqual([])
  })

  it('accepte un heat valide (0 ≤ heat ≤ 100, ≤ 2 décimales)', () => {
    for (const h of ['0', '50', '100', '33.5', '12.25']) {
      const files = {
        [meta]: 'nextId: 2\n',
        ...stageSectionFiles(),
        '/docs/tasks/02-feature/01-t.yaml': okTask(1, `heat: ${h}\n`),
      }
      expect(validateTaskTree(buildTaskTree(files))).toEqual([])
    }
  })

  it('rejette un heat hors bornes (>100)', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1, 'heat: 150\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('heat'))).toBe(true)
  })

  it('rejette un heat négatif', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1, 'heat: -3\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('heat'))).toBe(true)
  })

  it('rejette un heat à 3 décimales (2 décimales maximum)', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/02-feature/01-t.yaml': okTask(1, 'heat: 12.345\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('heat'))).toBe(true)
  })
})

describe('detectLegacyModel (#248 garde de version)', () => {
  const task = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T"\nstatus: todo\ntags: []\nsource: ai\ncreatedAt: "2026-07-06"\n${extra}`

  it('renvoie null sur un backlog déjà v2', () => {
    expect(detectLegacyModel({
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/02-feature/01-t.yaml': task(1),
    })).toBeNull()
  })

  it('détecte un ancien dossier-stage', () => {
    const msg = detectLegacyModel({ '/docs/tasks/04-build/01-t.yaml': task(1) })
    expect(msg).toContain('roadmapped migrate')
    expect(msg).toContain('anciens dossiers-stages')
  })

  it('détecte un champ team: sur une tâche active', () => {
    const msg = detectLegacyModel({ '/docs/tasks/02-feature/01-t.yaml': task(1, 'team: engineering\n') })
    expect(msg).toContain('team:')
  })

  it('détecte kind: quick', () => {
    const msg = detectLegacyModel({ '/docs/tasks/02-feature/01-t.yaml': task(1, 'kind: quick\n') })
    expect(msg).toContain('kind: quick')
  })

  it('ignore l\'archive (jamais re-validée)', () => {
    expect(detectLegacyModel({
      '/docs/tasks/_archive/04-build/01-t.yaml': task(1, 'team: engineering\n'),
      '/docs/tasks/02-feature/01-t.yaml': task(2),
    })).toBeNull()
  })
})
