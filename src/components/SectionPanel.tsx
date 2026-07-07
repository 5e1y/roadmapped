import { useState, type KeyboardEvent } from 'react'
import { Check } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { Select, TextInput, TextArea, ErrorBanner } from './ui'
import { TEAMS } from '../lib/tasks'
import type { SectionNode } from '../lib/tasks'

const SECTION_STATUS_ITEMS: { value: SectionNode['status']; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'done', label: 'done' },
  { value: 'dormant', label: 'dormant' },
  { value: 'abandoned', label: 'abandoned' },
]

/** Création d'une tâche : titre obligatoire, section préremplie (non éditable). */
export function CreateTaskPanel({ section }: { section: string }) {
  const { reload } = useTree()
  const { openTask, close } = usePanel()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [team, setTeam] = useState<string>('engineering')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (busy) return
    if (title.trim() === '') { setErrors(['Le titre est obligatoire.']); return }
    setBusy(true)
    setErrors([])
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, title, team, detail: detail === '' ? null : detail, source: 'user' }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[]; task?: { id: number } }
      // Bascule directe sur le détail de la tâche créée : l'utilisateur voit le
      // résultat et peut compléter (tags, taille…) sans re-chercher la ligne.
      if (data.ok && data.task) { await reload(); openTask(data.task.id) }
      else setErrors(data.errors ?? ['Erreur inconnue.'])
    } catch {
      setErrors(['Échec réseau — la tâche n’a pas été créée, réessayer.'])
    } finally {
      setBusy(false)
    }
  }

  const createOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !busy) void create()
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner errors={errors} />
      <div className="font-mono text-xs text-neutral-400">Section : {section}</div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Titre</span>
        <TextInput value={title} autoFocus disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={createOnEnter} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Team</span>
        <Select
          aria-label="Team"
          defaultValue={team}
          items={TEAMS.map((t) => ({ value: t, label: t }))}
          disabled={busy}
          onValueChange={setTeam}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Détail</span>
        <TextArea className="min-h-[120px]" value={detail} disabled={busy} onChange={(e) => setDetail(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy}
          className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700 disabled:opacity-50">
          {busy ? 'Création…' : 'Créer la tâche'}
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
  const [saved, setSaved] = useState(false)
  const section = tree?.sections.find((s) => s.key === dir) ?? tree?.archive.find((s) => s.key === dir)
  if (!section) return <p className="text-sm text-neutral-400">Section introuvable.</p>

  const save = async (patch: Record<string, unknown>) => {
    const r = await fetch(`/api/sections/${encodeURIComponent(dir)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await r.json()) as { ok: boolean; errors?: string[] }
    if (data.ok) {
      setErrors([])
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
      await reload()
    } else setErrors(data.errors ?? [])
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner errors={errors} />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs text-neutral-400">{dir}</div>
        {saved && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500">
            <Check size={10} />
            Enregistré
          </span>
        )}
      </div>
      {/* Le titre d'un stage est canonique (validation stricte) — lecture seule. */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wide text-neutral-400">Titre</span>
        <p className="px-1 text-sm text-neutral-900">{section.title}</p>
      </div>
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
