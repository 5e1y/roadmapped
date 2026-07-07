import { useState, type KeyboardEvent } from 'react'
import { Accordion } from '@base-ui/react/accordion'
import { useTree } from '../state/TreeContext'
import type { SectionNode } from '../lib/tasks'
import { SectionAccordion } from './SectionAccordion'
import { TextInput } from './ui'

function AddSection() {
  const { reload } = useTree()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const create = async () => {
    if (title.trim() === '') { setErrors(['Le titre est obligatoire.']); return }
    const r = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
    const data = (await r.json()) as { ok: boolean; errors?: string[] }
    if (data.ok) { setTitle(''); setOpen(false); setErrors([]); await reload() }
    else setErrors(data.errors ?? [])
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void create()
    if (e.key === 'Escape') { setOpen(false); setErrors([]) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-3 rounded-lg border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700">
        + section
      </button>
    )
  }
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-4">
      {errors.length > 0 && (
        <ul className="text-xs text-neutral-700">{errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}</ul>
      )}
      <TextInput autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={onKey}
        placeholder="Titre de la section (→ NN-slug auto)" />
      <div className="flex gap-2">
        <button type="button" onClick={create}
          className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700">Créer</button>
        <button type="button" onClick={() => { setOpen(false); setErrors([]) }}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100">Annuler</button>
      </div>
    </div>
  )
}

function countTasks(sections: SectionNode[]): { total: number; done: number } {
  let total = 0
  let done = 0
  const visit = (tasks: SectionNode['tasks']) => {
    for (const t of tasks) {
      total += 1
      if (t.status === 'done') done += 1
      visit(t.subtasks)
    }
  }
  for (const s of sections) visit(s.tasks)
  return { total, done }
}

export function Backlog() {
  const { tree, errors, loading, loadError } = useTree()

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
        <ul className="mt-6 flex flex-col divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
          {errors.map((e, i) => (
            <li key={i} className="px-4 py-2.5 font-mono text-xs text-neutral-700">{e}</li>
          ))}
        </ul>
      </div>
    )
  }
  if (!tree) return null

  const active = tree.sections.filter((s) => s.status !== 'abandoned')
  const activeCounts = countTasks(active)
  const archiveCounts = countTasks(tree.archive)

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <header className="mb-8">
        <h1 className="text-lg font-semibold tracking-tight">Backlog</h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">
          {active.length} sections · {activeCounts.total} tâches actives ({activeCounts.done} faites) ·{' '}
          {archiveCounts.total} archivées · nextId {tree.nextId}
        </p>
      </header>

      <Accordion.Root multiple className="flex flex-col gap-3">
        {active.map((section) => (
          <SectionAccordion key={section.key} section={section} />
        ))}
      </Accordion.Root>

      <AddSection />

      {tree.archive.length > 0 && (
        <section className="mt-14">
          <h2 className="text-sm font-semibold tracking-tight text-neutral-500">
            Archive — {archiveCounts.total} tâches livrées ou abandonnées
          </h2>
          <Accordion.Root multiple className="mt-3 flex flex-col gap-3">
            {tree.archive.map((section) => (
              <SectionAccordion key={section.key} section={section} dimmed />
            ))}
          </Accordion.Root>
        </section>
      )}
    </div>
  )
}
