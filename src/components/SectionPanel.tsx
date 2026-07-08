import { useState, type KeyboardEvent } from 'react'
import { Check } from 'trinil-react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { Select, TextInput, TextArea, ErrorBanner, MultiCombobox, TagsCombobox } from './ui'
import { STAGES, TEAMS } from '../lib/tasks'
import { activeTasks, archivedTasks } from '../lib/roadmap'
import type { SectionNode } from '../lib/tasks'

const SECTION_STATUS_ITEMS: { value: SectionNode['status']; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'done', label: 'done' },
  { value: 'dormant', label: 'dormant' },
  { value: 'abandoned', label: 'abandoned' },
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-neutral-400">{label}</span>
      {children}
    </label>
  )
}

/**
 * Création d'une tâche : TOUS les champs d'un coup (décision Rémi) — stage
 * compris — sauf la consignation (outcome/vérification/commit/release), qui
 * appartient à la résolution. POST unique, puis ouverture du panneau créé.
 */
export function CreateTaskPanel({ section }: { section: string }) {
  const { tree, reload } = useTree()
  const { openTask, close } = usePanel()
  const [stage, setStage] = useState(section)
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState<string>('engineering')
  const [tags, setTags] = useState<string[]>([])
  const [size, setSize] = useState('')
  const [code, setCode] = useState('')
  const [detail, setDetail] = useState('')
  const [dependsOn, setDependsOn] = useState<number[]>([])
  const [links, setLinks] = useState<number[]>([])
  const [refs, setRefs] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const allTags = tree ? [...new Set([...activeTasks(tree), ...archivedTasks(tree)].flatMap((t) => t.tags))] : []
  const relItems = tree
    ? [
        ...activeTasks(tree).map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title}` })),
        ...archivedTasks(tree).map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title} (archivée)` })),
      ]
    : []

  const create = async () => {
    if (busy) return
    if (title.trim() === '') { setErrors(['Le titre est obligatoire.']); return }
    setBusy(true)
    setErrors([])
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: stage,
          title,
          team,
          tags,
          size: size || null,
          code: code.trim() || null,
          detail: detail === '' ? null : detail,
          dependsOn,
          links,
          refs: refs.split('\n').map((s) => s.trim()).filter(Boolean),
          source: 'user',
        }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[]; task?: { id: number } }
      // Bascule directe sur le détail de la tâche créée : l'utilisateur voit le
      // résultat et peut compléter sans re-chercher la ligne.
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
      <Field label="Titre">
        <TextInput value={title} autoFocus disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={createOnEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage">
          <Select
            aria-label="Stage"
            defaultValue={stage}
            items={STAGES.map((s) => ({ value: s.slug, label: s.title }))}
            disabled={busy}
            onValueChange={setStage}
          />
        </Field>
        <Field label="Team">
          <Select
            aria-label="Team"
            defaultValue={team}
            items={TEAMS.map((t) => ({ value: t, label: t }))}
            disabled={busy}
            onValueChange={setTeam}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Taille">
          <Select
            aria-label="Taille"
            defaultValue=""
            items={[{ value: '', label: '—' }, { value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' }]}
            disabled={busy}
            onValueChange={setSize}
          />
        </Field>
        <Field label="Code">
          <TextInput value={code} disabled={busy} placeholder="FEAT-12" onChange={(e) => setCode(e.target.value)} onKeyDown={createOnEnter} />
        </Field>
      </div>
      <Field label="Tags">
        <TagsCombobox tags={tags} suggestions={allTags} disabled={busy} onSave={setTags} />
      </Field>
      <Field label="Détail">
        <TextArea className="min-h-[100px]" value={detail} disabled={busy} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <Field label="Dépend de">
        <MultiCombobox aria-label="Dépend de" value={dependsOn} items={relItems}
          placeholder="Rechercher une tâche prérequise…" onValueChange={setDependsOn} />
      </Field>
      <Field label="Liens">
        <MultiCombobox aria-label="Liens" value={links} items={relItems}
          placeholder="Rechercher une tâche liée…" onValueChange={setLinks} />
      </Field>
      <Field label="Refs (un chemin par ligne)">
        <TextArea className="min-h-[60px] font-mono text-xs" value={refs} disabled={busy}
          placeholder={'docs/specs/....md\nsrc/lib/....ts'} onChange={(e) => setRefs(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy}
          className="rounded border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50">
          {busy ? 'Création…' : 'Créer la tâche'}
        </button>
        <button type="button" onClick={close}
          className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100">
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
        <span className="text-[11px] font-medium text-neutral-400">Titre</span>
        <p className="px-1 text-sm text-neutral-900">{section.title}</p>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-neutral-400">Statut</span>
        <Select
          aria-label="Statut de la section"
          defaultValue={section.status}
          items={SECTION_STATUS_ITEMS}
          onValueChange={(v) => { if (v !== section.status) void save({ status: v }) }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-neutral-400">Note</span>
        <TextArea defaultValue={section.note ?? ''}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : e.target.value
            if ((section.note ?? null) !== v) void save({ note: v })
          }} />
      </label>
    </div>
  )
}
