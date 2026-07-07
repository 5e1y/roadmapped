import { Accordion } from '@base-ui/react/accordion'
import { useTree } from '../state/TreeContext'
import { usePersistentStrings } from '../state/uiPersist'
import { countTasksDeep, type TaskNode } from '../lib/tasks'
import { SectionAccordion } from './SectionAccordion'
import { useTeamFilter } from './Sidebar'

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

export function Backlog() {
  const { tree, errors, loading, loadError } = useTree()
  // Ouverture des sections persistée (survit à la navigation et au rechargement).
  const [openActive, setOpenActive] = usePersistentStrings('backlog:sections')
  const [openArchive, setOpenArchive] = usePersistentStrings('backlog:archive')
  const [teamFilter] = useTeamFilter()

  if (loading && !tree) {
    return <div className="mx-auto max-w-2xl px-6 py-14 text-sm text-neutral-500">Chargement…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} erreur{errors.length > 1 ? 's' : ''} de validation dans docs/tasks/
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Corriger les fichiers fautifs — rien n'est rendu tant que la source n'est pas saine.
        </p>
        <ul className="mt-6 flex flex-col divide-y divide-neutral-100 border border-neutral-200 bg-white">
          {errors.map((e, i) => (
            <li key={i} className="px-4 py-2.5 font-mono text-xs text-neutral-700">{e}</li>
          ))}
        </ul>
      </div>
    )
  }
  if (!tree) return null

  // Filtre team (sidebar) : sections re-projetées sur les tâches qui matchent.
  const matchTeam = (t: TaskNode) => teamFilter.length === 0 || teamFilter.includes(t.team)
  const active = tree.sections
    .filter((s) => s.status !== 'abandoned')
    .map((s) => ({ ...s, tasks: s.tasks.filter(matchTeam) }))
  const activeCounts = countTasksDeep(active.flatMap((s) => s.tasks))
  const archiveCounts = countTasksDeep(tree.archive.flatMap((s) => s.tasks))

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <header className="mb-8">
        <h1 className="text-lg font-semibold tracking-tight">Backlog</h1>
        {active.length > 0 && (
          <p className="mt-1 font-mono text-xs text-neutral-500">
            {plural(active.length, 'section')} · {plural(activeCounts.total, 'tâche')} active{activeCounts.total === 1 ? '' : 's'}{' '}
            ({activeCounts.done} faite{activeCounts.done === 1 ? '' : 's'}) · {plural(archiveCounts.total, 'archivée')}
          </p>
        )}
      </header>

      {active.length === 0 ? (
        <div className="border border-dashed border-neutral-300 px-6 py-10 text-center">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900">Backlog vide</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-500">
            Les 8 stages sont prêts — crée une première tâche via « + tâche » dans un stage.
          </p>
        </div>
      ) : (
        <>
          <Accordion.Root multiple value={openActive} onValueChange={(v) => setOpenActive(v as string[])} className="flex flex-col gap-3">
            {active.map((section) => (
              <SectionAccordion key={section.key} section={section} />
            ))}
          </Accordion.Root>
        </>
      )}

      {tree.archive.length > 0 && (
        <section className="mt-14">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-500">
            Archive — {plural(archiveCounts.total, 'tâche')} livrée{archiveCounts.total === 1 ? '' : 's'} ou abandonnée{archiveCounts.total === 1 ? '' : 's'}
          </h2>
          <Accordion.Root multiple value={openArchive} onValueChange={(v) => setOpenArchive(v as string[])} className="mt-3 flex flex-col gap-3">
            {tree.archive.map((section) => (
              <SectionAccordion key={section.key} section={section} dimmed />
            ))}
          </Accordion.Root>
        </section>
      )}
    </div>
  )
}
