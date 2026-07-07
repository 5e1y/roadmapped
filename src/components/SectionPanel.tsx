import { useState, type KeyboardEvent } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { Select, TextInput, TextArea, blurOnEnter } from './ui'
import type { SectionNode } from '../lib/tasks'

const SECTION_STATUS_ITEMS: { value: SectionNode['status']; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'done', label: 'done' },
  { value: 'dormant', label: 'dormant' },
  { value: 'abandoned', label: 'abandoned' },
]

function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 rounded border border-neutral-400 bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
      {errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
    </ul>
  )
}

/** Création d'une tâche : titre obligatoire, section préremplie (non éditable). */
export function CreateTaskPanel({ section }: { section: string }) {
  const { reload } = useTree()
  const { openTask, close } = usePanel()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  const create = async () => {
    if (title.trim() === '') { setErrors(['Le titre est obligatoire.']); return }
    const r = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, title, detail: detail === '' ? null : detail, source: 'user' }),
    })
    const data = (await r.json()) as { ok: boolean; errors?: string[]; task?: { id: number } }
    // Bascule directe sur le détail de la tâche créée : l'utilisateur voit le
    // résultat et peut compléter (tags, taille…) sans re-chercher la ligne.
    if (data.ok && data.task) { await reload(); openTask(data.task.id) }
    else setErrors(data.errors ?? ['Erreur inconnue.'])
  }

  const createOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void create()
  }

  return (
    <div className="flex flex-col gap-4">
      <Errors errors={errors} />
      <div className="font-mono text-xs text-neutral-400">Section : {section}</div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Titre</span>
        <TextInput value={title} autoFocus onChange={(e) => setTitle(e.target.value)} onKeyDown={createOnEnter} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Détail</span>
        <TextArea className="min-h-[120px]" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={create}
          className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700">
          Créer la tâche
        </button>
        <button type="button" onClick={close}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100">
          Annuler
        </button>
      </div>
    </div>
  )
}

/** Édition d'une section existante : titre / statut / note. */
export function SectionPanel({ dir }: { dir: string }) {
  const { tree, reload } = useTree()
  const [errors, setErrors] = useState<string[]>([])
  const section = tree?.sections.find((s) => s.key === dir) ?? tree?.archive.find((s) => s.key === dir)
  if (!section) return <p className="text-sm text-neutral-400">Section introuvable.</p>

  const save = async (patch: Record<string, unknown>) => {
    const r = await fetch(`/api/sections/${encodeURIComponent(dir)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await r.json()) as { ok: boolean; errors?: string[] }
    if (data.ok) { setErrors([]); await reload() } else setErrors(data.errors ?? [])
  }

  return (
    <div className="flex flex-col gap-4">
      <Errors errors={errors} />
      <div className="font-mono text-xs text-neutral-400">{dir}</div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Titre</span>
        <TextInput defaultValue={section.title}
          onKeyDown={blurOnEnter}
          onBlur={(e) => { if (e.target.value !== section.title) void save({ title: e.target.value }) }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Statut</span>
        <Select
          aria-label="Statut de la section"
          defaultValue={section.status}
          items={SECTION_STATUS_ITEMS}
          onValueChange={(v) => { if (v !== section.status) void save({ status: v }) }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Note</span>
        <TextArea defaultValue={section.note ?? ''}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : e.target.value
            if ((section.note ?? null) !== v) void save({ note: v })
          }} />
      </label>
    </div>
  )
}
