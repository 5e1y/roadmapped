import { useState, type KeyboardEvent } from 'react'
import { Toast } from '@base-ui/react/toast'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import {
  Select, TextInput, TextArea, ErrorBanner, MultiCombobox, TagsCombobox,
  GhostAutoTextArea, SavedTick, FieldError, ToastViewport, primaryBtn, actionBtn,
  type SelectItem,
} from './ui'
import { relItemOf } from './TaskPanel'
import { TYPES, SECTION_STATUS_LABEL } from '../lib/tasks'
import { activeTasks } from '../lib/roadmap'
import type { SectionNode } from '../lib/tasks'

// Statuts de section (#28) — même source que le Backlog/Colonnes
// (SECTION_STATUS_LABEL), complétée du seul statut « open ».
const SECTION_STATUS_ITEMS: SelectItem[] = [
  { value: 'open', label: 'open' },
  ...(Object.entries(SECTION_STATUS_LABEL) as [SectionNode['status'], string][])
    .map(([value, label]) => ({ value, label })),
]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
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
  const [tags, setTags] = useState<string[]>([])
  const [size, setSize] = useState('')
  const [code, setCode] = useState('')
  const [detail, setDetail] = useState('')
  const [dependsOn, setDependsOn] = useState<number[]>([])
  const [links, setLinks] = useState<number[]>([])
  const [refs, setRefs] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const allTags = tree ? [...new Set(activeTasks(tree).flatMap((t) => t.tags))] : []
  // Items avec aperçu (#125) : glyphe, #id, titre, stage, team — relItemOf.
  // Les OUVERTES d'abord (candidates naturelles), les faites ensuite.
  const pool = tree ? activeTasks(tree) : []
  const relItems = [...pool.filter((t) => t.status !== 'done'), ...pool.filter((t) => t.status === 'done')].map(relItemOf)

  const create = async () => {
    if (busy) return
    if (title.trim() === '') { setErrors(['A title is required.']); return }
    setBusy(true)
    setErrors([])
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: stage,
          title,
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
      else setErrors(data.errors ?? ['Unknown error.'])
    } catch {
      setErrors(['Network error — the task was not created, try again.'])
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
      <Field label="Title">
        <TextInput value={title} autoFocus disabled={busy} onChange={(e) => setTitle(e.target.value)} onKeyDown={createOnEnter} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select
            aria-label="Type"
            defaultValue={stage}
            items={TYPES.map((t) => ({ value: t.slug, label: t.title }))}
            disabled={busy}
            onValueChange={setStage}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Size">
          <Select
            aria-label="Size"
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
      <Field label="Detail">
        <TextArea className="min-h-[100px]" value={detail} disabled={busy} onChange={(e) => setDetail(e.target.value)} />
      </Field>
      <Field label="Depends on">
        <MultiCombobox aria-label="Depends on" value={dependsOn} items={relItems}
          placeholder="Search for a prerequisite task…" onValueChange={setDependsOn} />
      </Field>
      <Field label="Links">
        <MultiCombobox aria-label="Links" value={links} items={relItems}
          placeholder="Search for a related task…" onValueChange={setLinks} />
      </Field>
      <Field label="Refs (one path per line)">
        <TextArea className="min-h-[60px] font-mono text-xs" value={refs} disabled={busy}
          placeholder={'docs/specs/....md\nsrc/lib/....ts'} onChange={(e) => setRefs(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button type="button" onClick={create} disabled={busy} className={primaryBtn}>
          {busy ? 'Creating…' : 'Create task'}
        </button>
        <button type="button" onClick={close} className={actionBtn}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Édition d'une section (#28) : même grammaire visuelle que TaskPanel —
 * « lecture d'abord », champs GHOST montés en permanence (statut en Select
 * ghost, note en textarea ghost auto-grow), ✓ « enregistré » et erreur de
 * validation SOUS la zone concernée, Toast pour l'erreur réseau, chemin
 * technique relégué en pied. Le titre d'un stage est canonique (validation
 * stricte côté serveur) — lecture seule, même typo que le titre de tâche.
 */
export function SectionPanel({ dir }: { dir: string }) {
  return (
    <Toast.Provider>
      <SectionPanelBody dir={dir} />
      <ToastViewport />
    </Toast.Provider>
  )
}

function SectionPanelBody({ dir }: { dir: string }) {
  const { tree, reload } = useTree()
  const toast = Toast.useToastManager()
  // Erreurs / ✓ suivis PAR zone (même pattern que TaskPanel).
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [savedField, setSavedField] = useState<string | null>(null)
  const section = tree?.sections.find((s) => s.key === dir)
  if (!section) return <p className="text-sm text-neutral-500">Section not found.</p>
  const sectionPath = `docs/tasks/${dir}`

  const flash = (field: string) => {
    setSavedField(field)
    window.setTimeout(() => setSavedField((s) => (s === field ? null : s)), 1500)
  }

  /** PATCH d'une zone : ✓ au succès, erreur de validation sous la zone, Toast réseau. */
  const save = async (field: string, patch: Record<string, unknown>) => {
    try {
      const r = await fetch(`/api/sections/${encodeURIComponent(dir)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) {
        setErrors((p) => { const n = { ...p }; delete n[field]; return n })
        flash(field)
        await reload()
      } else setErrors((p) => ({ ...p, [field]: data.errors ?? ['Unknown error.'] }))
    } catch {
      toast.add({ title: 'Network error', description: 'The change was not saved.', priority: 'high' })
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-5">
      {/* En-tête : statut (ghost select) puis titre — miroir de TaskPanel. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <div className="w-32">
            <Select
              ghost
              aria-label="Section status"
              defaultValue={section.status}
              items={SECTION_STATUS_ITEMS}
              onValueChange={(v) => { if (v !== section.status) void save('status', { status: v }) }}
            />
          </div>
          <SavedTick show={savedField === 'status'} />
        </div>
        <FieldError errs={errors.status} />
        {/* Titre canonique (lecture seule) — même typo que le titre de tâche,
            même retrait px-1.5 que les champs ghost. */}
        <h3 className="px-1.5 py-1 text-base font-semibold leading-snug tracking-tight text-neutral-900">
          {section.title}
        </h3>
      </div>

      {/* Note : textarea ghost permanente (jamais de swap), sauvegarde au blur. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="px-1.5 text-[11px] font-medium text-neutral-500">Note</div>
          <SavedTick show={savedField === 'note'} />
        </div>
        <GhostAutoTextArea
          key={`note-${section.note ?? ''}`}
          defaultValue={section.note ?? ''}
          placeholder="No note. Click to add."
          aria-label="Note"
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.blur() }}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : e.target.value
            if ((section.note ?? null) !== v) void save('note', { note: v })
          }}
          className="text-sm leading-relaxed placeholder:text-neutral-500"
        />
        <FieldError errs={errors.note} />
      </div>

      {/* Pied : le chemin technique, relégué ici (audit UX — même place que TaskPanel). */}
      <div className="mt-auto border-t border-neutral-200 pt-3">
        <div className="truncate font-mono text-[11px] text-neutral-500" title={sectionPath}>{sectionPath}</div>
      </div>
    </div>
  )
}
