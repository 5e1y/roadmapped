import { describe, it, expect } from 'vitest'
import { DEMO_FILES, demoTree } from './tree'
import { validateTaskTree, validateIdUniquenessAcrossFiles } from '../lib/validate'
import { countTasksDeep } from '../lib/tasks'

/*
 * Le backlog démo (#148) passe par le VRAI parseur et la VRAIE validation :
 * si le schéma évolue, c'est CE test qui casse — pas la homepage en prod.
 */
describe('demo tree (#148)', () => {
  it('est un TaskTree valide (schéma complet + unicité des ids)', () => {
    const errors = [
      ...validateTaskTree(demoTree()),
      ...validateIdUniquenessAcrossFiles(DEMO_FILES),
    ]
    expect(errors).toEqual([])
  })

  it('raconte une histoire complète : statuts variés, jalon, v1 rejetée, epic', () => {
    const tree = demoTree()
    const all = tree.sections.flatMap((s) => s.tasks)

    // Les trois colonnes du Backlog sont habitées.
    for (const status of ['todo', 'in_progress', 'done'] as const) {
      expect(all.some((t) => t.status === status), `aucune tâche ${status}`).toBe(true)
    }
    // Un jalon (rendu diamant dans le graphe) et des dépendances (des arêtes).
    expect(all.some((t) => t.kind === 'milestone')).toBe(true)
    expect(all.some((t) => t.dependsOn.length > 0)).toBe(true)
    // La v1 rejetée (#8) reste dans le backlog, done (quatrième mur : le backlog est le changelog).
    const v1 = all.find((t) => t.id === 8)
    expect(v1?.status).toBe('done')
    expect(countTasksDeep(all).done).toBeGreaterThan(0)
    // L'epic déclaré existe et des tâches le portent.
    expect(tree.epics.some((e) => e.slug === 'homepage')).toBe(true)
    expect(all.filter((t) => t.epic === 'homepage').length).toBeGreaterThan(5)
  })
})
