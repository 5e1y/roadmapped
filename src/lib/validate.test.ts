import { describe, it, expect } from 'vitest'
import { validateTaskTree, validateIdUniquenessAcrossFiles } from './validate'
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
  it('détecte une collision entre une tâche active et une tâche archivée (angle mort de buildTaskTree)', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      '/docs/tasks/_archive/02-y/_section.yaml': 'title: "Y"\nstatus: done\n',
      '/docs/tasks/_archive/02-y/01-task.yaml': 'id: 1\ntitle: "Archivée"\n',
    }
    // validateTaskTree ne valide que les sections ACTIVES (l'archive, parsée
    // séparément dans tree.archive, est de l'historique déjà validé) -> seul,
    // il ne voit jamais la collision active/archive.
    const tree = buildTaskTree(files)
    expect(validateTaskTree(tree).some((e) => e.includes('dupliqué'))).toBe(false)
    // Le passage sur le fichier brut, lui, la voit.
    const errors = validateIdUniquenessAcrossFiles(files)
    expect(errors.some((e) => e.includes('id 1') && e.includes('dupliqué'))).toBe(true)
  })

  it('ne signale rien quand tous les ids sont uniques, actifs et archivés confondus', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 3\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      '/docs/tasks/_archive/02-y/_section.yaml': 'title: "Y"\nstatus: done\n',
      '/docs/tasks/_archive/02-y/01-task.yaml': 'id: 2\ntitle: "Archivée"\n',
    }
    expect(validateIdUniquenessAcrossFiles(files)).toEqual([])
  })

  it('signale un nextId <= id max GLOBAL, y compris quand le max vit dans l’archive', () => {
    const files = {
      '/docs/tasks/_meta.yaml': 'nextId: 2\n',
      '/docs/tasks/01-x/_section.yaml': 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-task.yaml': 'id: 1\ntitle: "Active"\n',
      '/docs/tasks/_archive/02-y/_section.yaml': 'title: "Y"\nstatus: done\n',
      '/docs/tasks/_archive/02-y/01-task.yaml': 'id: 5\ntitle: "Archivée"\n',
    }
    // validateTaskTree (actifs seuls : max=1, nextId=2) ne voit pas le problème de nextId…
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('nextId'))).toBe(false)
    // …le passage global, si : id 5 archivé => nextId 2 garantirait une collision.
    const errors = validateIdUniquenessAcrossFiles(files)
    expect(errors.some((e) => e.includes('nextId') && e.includes('5'))).toBe(true)
  })
})

describe('validateTaskTree — roadmap (phase 2)', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const sec = '/docs/tasks/01-x/_section.yaml'
  const roadmaps = [
    'roadmaps:',
    '  - slug: launch',
    '    title: "Lancement"',
    '    milestones:',
    '      - { slug: socle, title: "Socle" }',
  ].join('\n')
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

  it('signale un milestone non déclaré', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/_roadmaps.yaml': roadmaps,
      '/docs/tasks/01-x/01-t.yaml': task(1, 'milestone: fantome\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('fantome') && e.includes('non déclaré'))).toBe(true)
  })

  it('accepte un milestone déclaré', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/_roadmaps.yaml': roadmaps,
      '/docs/tasks/01-x/01-t.yaml': task(1, 'milestone: socle\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('non déclaré'))).toBe(false)
  })

  it('signale un slug de jalon dupliqué (unicité globale)', () => {
    const files = {
      [meta]: 'nextId: 2\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/_roadmaps.yaml': [
        'roadmaps:',
        '  - { slug: a, title: "A", milestones: [ { slug: dup, title: "D" } ] }',
        '  - { slug: b, title: "B", milestones: [ { slug: dup, title: "D2" } ] }',
      ].join('\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('dup') && e.includes('dupliqué'))).toBe(true)
  })

  it('une dépendance vers une tâche ARCHIVÉE est valide (done de fait)', () => {
    const files = {
      [meta]: 'nextId: 3\n', [sec]: 'title: "X"\nstatus: open\n',
      '/docs/tasks/01-x/01-t.yaml': task(2, 'dependsOn: [1]\n'),
      '/docs/tasks/_archive/09-old/_section.yaml': 'title: "Old"\nstatus: done\n',
      '/docs/tasks/_archive/09-old/01-done.yaml':
        'id: 1\ntitle: "Livrée"\nstatus: done\nsource: ai\ncreatedAt: "2026-06-01"\n',
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('inexistante'))).toBe(false)
  })

  it('rétrocompat : arbre sans aucun champ roadmap → zéro nouvelle erreur', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': task(1, 'team: engineering\n'),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs).toEqual([])
  })
})

describe('validateTaskTree — kind quick (mini-tickets)', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const base = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T${id}"\nstatus: todo\nteam: engineering\nsource: ai\ncreatedAt: "2026-07-07"\n${extra}`

  it('accepte kind: quick', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': base(1, 'kind: quick\n'),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('rejette un kind inconnu', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': base(1, 'kind: mega\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('kind'))).toBe(true)
  })

  it('rejette un quick en size L (garde-fou : si c\'est gros, c\'est un ticket)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': base(1, 'kind: quick\nsize: L\n'),
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('quick') && e.includes('L'))).toBe(true)
  })

  it('accepte un quick en size S ou M', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': base(1, 'kind: quick\nsize: S\n'),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('rejette un quick done SANS outcome (le requis vit dans la validation, couvre le dashboard)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml':
        'id: 1\nkind: quick\ntitle: "T"\nstatus: done\nteam: engineering\nsource: ai\ncreatedAt: "2026-07-07"\ncompletedAt: "2026-07-07"\n',
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('outcome'))).toBe(true)
  })

  it('accepte un quick done AVEC outcome (verification facultative)', () => {
    const files = {
      [meta]: 'nextId: 2\n', ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml':
        'id: 1\nkind: quick\ntitle: "T"\nstatus: done\nteam: engineering\nsource: ai\ncreatedAt: "2026-07-07"\ncompletedAt: "2026-07-07"\noutcome: "chevron corrigé"\n',
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('un quick done SANS outcome dans l\'ARCHIVE n\'est PAS validé (comme team)', () => {
    const files = {
      [meta]: 'nextId: 3\n', ...stageSectionFiles(),
      '/docs/tasks/_archive/04-build/_section.yaml': 'title: "Build Stage"\nstatus: done\n',
      '/docs/tasks/_archive/04-build/01-old.yaml':
        'id: 2\nkind: quick\ntitle: "Vieux quick"\nstatus: done\nsource: ai\ncreatedAt: "2026-06-01"\n',
    }
    expect(validateTaskTree(buildTaskTree(files)).some((e) => e.includes('outcome'))).toBe(false)
  })
})

describe('validateTaskTree — stages canoniques + team (stages+teams)', () => {
  const meta = '/docs/tasks/_meta.yaml'
  const okTask = (id: number, extra = '') =>
    `id: ${id}\ntitle: "T${id}"\nstatus: todo\nteam: engineering\nsource: ai\ncreatedAt: "2026-07-07"\n${extra}`

  it('happy path : 8 stages canoniques + tâche avec team valide → aucune erreur', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': okTask(1),
    }
    expect(validateTaskTree(buildTaskTree(files))).toEqual([])
  })

  it('rejette un 9e dossier de section (hors set canonique)', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/09-extra/_section.yaml': 'title: "Extra"\nstatus: open\nnote: null\n',
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('09-extra'))).toBe(true)
  })

  it('rejette un slug de section non canonique', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    // remplace le stage 04-build par un slug inconnu
    delete files['/docs/tasks/04-build/_section.yaml']
    files['/docs/tasks/04-atelier/_section.yaml'] = 'title: "Atelier"\nstatus: open\nnote: null\n'
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('04-atelier'))).toBe(true)
    expect(errs.some((e) => e.includes('04-build') && e.includes('manquant'))).toBe(true)
  })

  it('rejette un stage manquant', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    delete files['/docs/tasks/08-mature/_section.yaml']
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('08-mature') && e.includes('manquant'))).toBe(true)
  })

  it('rejette un title de section non canonique', () => {
    const files: Record<string, string> = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
    }
    files['/docs/tasks/04-build/_section.yaml'] = 'title: "Mauvais titre"\nstatus: open\nnote: null\n'
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('04-build') && e.includes('Build Stage'))).toBe(true)
  })

  it('rejette une tâche active sans team', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml':
        'id: 1\ntitle: "T"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('04-build/1') && e.includes('team'))).toBe(true)
  })

  it('rejette une tâche active avec team inconnue', () => {
    const files = {
      [meta]: 'nextId: 2\n',
      ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': okTask(1).replace('team: engineering', 'team: wizardry'),
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('04-build/1') && e.includes('team'))).toBe(true)
  })

  it('rejette une SOUS-tâche sans team', () => {
    const files = {
      [meta]: 'nextId: 3\n',
      ...stageSectionFiles(),
      '/docs/tasks/04-build/01-t.yaml': okTask(1),
      '/docs/tasks/04-build/01-t/01-sub.yaml':
        'id: 2\ntitle: "Sous"\nstatus: todo\nsource: ai\ncreatedAt: "2026-07-07"\n',
    }
    const errs = validateTaskTree(buildTaskTree(files))
    expect(errs.some((e) => e.includes('team'))).toBe(true)
  })
})
