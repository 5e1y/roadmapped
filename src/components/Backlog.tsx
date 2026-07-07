import { useState, type KeyboardEvent } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { useTree } from '../state/TreeContext'
import { usePersistentStrings } from '../state/uiPersist'
import { countTasksDeep } from '../lib/tasks'
import { SectionAccordion } from './SectionAccordion'
import { TextInput } from './ui'

function AddSection() {
  const { reload } = useTree()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (busy) return
    if (title.trim() === '') { setErrors(['Le titre est obligatoire.']); return }
    setBusy(true)
    setErrors([])
    try {
      const r = await fetch('/api/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { setTitle(''); setOpen(false); setErrors([]); await reload() }
      else setErrors(data.errors ?? [])
    } catch {
      setErrors(['Échec réseau — la section n’a pas été créée, réessayer.'])
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (busy) return
    if (e.key === 'Enter') void create()
    if (e.key === 'Escape') { setOpen(false); setTitle(''); setErrors([]) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-3 border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700">
        + section
      </button>
    )
  }
  return (
    <div className="mt-3 flex flex-col gap-2 border border-neutral-200 bg-white p-4">
      {errors.length > 0 && (
        <ul className="border-l-2 border-neutral-500 bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
          {errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
        </ul>
      )}
      <TextInput autoFocus value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey}
        placeholder="Titre de la section (→ NN-slug auto)" />
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy}
          className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50">
          {busy ? 'Création…' : 'Créer'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(''); setErrors([]) }}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100">Annuler</button>
      </div>
    </div>
  )
}

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

export function Backlog() {
  const { tree, errors, loading, loadError } = useTree()
  // Ouverture des sections persistée (survit à la navigation et au rechargement).
  const [openActive, setOpenActive] = usePersistentStrings('backlog:sections')
  const [openArchive, setOpenArchive] = usePersistentStrings('backlog:archive')

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

  const active = tree.sections.filter((s) => s.status !== 'abandoned')
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
            Aucune section pour l'instant. Crée une première section pour commencer à y ranger des tâches.
          </p>
          <div className="mt-4 flex justify-center"><AddSection /></div>
        </div>
      ) : (
        <>
          <Accordion.Root multiple value={openActive} onValueChange={(v) => setOpenActive(v as string[])} className="flex flex-col gap-3">
            {active.map((section) => (
              <SectionAccordion key={section.key} section={section} />
            ))}
          </Accordion.Root>
          <AddSection />
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
