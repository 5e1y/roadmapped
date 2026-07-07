import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { agentBrief } from './TaskRow'
import { findTaskInTree } from '../lib/findTaskInTree'
import { Select, TextInput, TextArea, MultiCombobox, ErrorBanner, blurOnEnter } from './ui'
import type { FocusEvent } from 'react'
import { activeTasks, archivedTasks } from '../lib/roadmap'
import type { TaskNode } from '../lib/tasks'

const STATUS_ITEMS = [
  { value: 'todo', label: 'todo' },
  { value: 'in_progress', label: 'in_progress' },
  { value: 'done', label: 'done' },
]
// '' = aucune (null). Enum réel validate.ts : S/M/L/null.
const SIZE_ITEMS = [
  { value: '', label: '(aucune)' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
]

async function patchTask(id: number, patch: Record<string, unknown>): Promise<string[]> {
  const r = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const data = (await r.json()) as { ok: boolean; errors?: string[] }
  return data.ok ? [] : (data.errors ?? ['Erreur inconnue.'])
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-neutral-400">{label}</span>
      {children}
    </label>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 font-mono text-neutral-600">{value}</span>
    </div>
  )
}

export function TaskPanel({ id }: { id: number }) {
  const { tree, reload } = useTree()
  const { close } = usePanel()
  // Erreurs suivies PAR CHAMP : le succès d'un champ n'efface pas l'erreur d'un
  // autre (clé '_action' pour archiver/supprimer).
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  const task = tree ? findTaskInTree(tree, id) : null
  if (!task) return <p className="text-sm text-neutral-400">Tâche introuvable (rechargez).</p>

  // L'API refuse d'éditer l'archive — l'UI le dit d'avance plutôt que de
  // laisser l'utilisateur le découvrir par une erreur au blur.
  const archived = task.file.includes('_archive/')

  const allErrors = Object.values(fieldErrors).flat()
  const setFieldErr = (field: string, errs: string[]) =>
    setFieldErrors((prev) => {
      const next = { ...prev }
      if (errs.length) next[field] = errs
      else delete next[field]
      return next
    })

  // Sauvegarde d'un champ : PATCH puis reload, sauf si la valeur n'a pas bougé.
  const save = async (field: string, patch: Record<string, unknown>) => {
    const errs = await patchTask(id, patch)
    setFieldErr(field, errs)
    if (errs.length === 0) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1500)
      await reload()
    }
  }
  const saveIfChanged = (field: keyof TaskNode, value: unknown) => {
    if (JSON.stringify(task[field] ?? null) !== JSON.stringify(value ?? null)) void save(field, { [field]: value })
  }
  const csv = (v: string): string[] => v.split(',').map((s) => s.trim()).filter(Boolean)
  // Champs CSV : après normalisation, réafficher la valeur CANONIQUE dans le
  // champ pour que l'affiché ne mente jamais sur l'enregistré.
  const csvBlur = (e: FocusEvent<HTMLInputElement>, field: 'tags' | 'refs') => {
    const parsed = csv(e.target.value)
    e.currentTarget.value = parsed.join(', ')
    saveIfChanged(field, parsed)
  }
  const linksBlur = (e: FocusEvent<HTMLInputElement>) => {
    const parsed = csv(e.target.value).map(Number).filter((n) => !Number.isNaN(n))
    e.currentTarget.value = parsed.join(', ')
    saveIfChanged('links', parsed)
  }

  // Prérequis sélectionnables : actives + ARCHIVÉES (soi-même exclu). Les
  // archivées doivent figurer dans items, sinon une dep archivée existante
  // serait invisible ET silencieusement perdue à la prochaine édition
  // (onValueChange ne renvoie que les items présents).
  const dependItems = tree
    ? [
        ...activeTasks(tree).filter((t) => t.id !== id)
          .map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title}` })),
        ...archivedTasks(tree).filter((t) => t.id !== id)
          .map((t) => ({ value: String(t.id), label: `#${t.id} ${t.title} (archivée)` })),
      ]
    : []

  const archive = async () => {
    if (pending) return
    setPending(true)
    try {
      const r = await fetch(`/api/tasks/${id}/archive`, { method: 'POST' })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { await reload(); close() } else setFieldErr('_action', data.errors ?? [])
    } catch {
      setFieldErr('_action', ['Échec réseau — la tâche n’a pas été archivée.'])
    } finally {
      setPending(false)
    }
  }
  const remove = async () => {
    if (pending) return
    if (!window.confirm(`Supprimer définitivement la tâche #${id} ? (l'id ne sera jamais réutilisé)`)) return
    setPending(true)
    try {
      const r = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { await reload(); close() } else setFieldErr('_action', data.errors ?? [])
    } catch {
      setFieldErr('_action', ['Échec réseau — la tâche n’a pas été supprimée.'])
    } finally {
      setPending(false)
    }
  }

  const consignation = [
    { label: 'dates', value: `créée ${task.createdAt}${task.completedAt ? ` · terminée ${task.completedAt}` : ''}` },
    task.commit ? { label: 'commit', value: task.commit } : null,
    task.verification ? { label: 'vérification', value: task.verification } : null,
    task.release ? { label: 'release', value: task.release } : null,
  ].filter((m): m is { label: string; value: string } => m !== null)

  return (
    <div className="flex flex-col gap-4">
      <ErrorBanner errors={allErrors} />

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate font-mono text-xs text-neutral-400">#{task.id} · {task.file}</div>
        {saved && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-neutral-500">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
              <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Enregistré
          </span>
        )}
      </div>

      {archived && (
        <p className="rounded border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          Tâche archivée — lecture seule.
        </p>
      )}

      <Row label="Titre">
        <TextInput
          defaultValue={task.title}
          disabled={archived}
          onKeyDown={blurOnEnter}
          onBlur={(e) => saveIfChanged('title', e.target.value)}
        />
      </Row>

      <Row label="Détail">
        <TextArea
          className="min-h-[120px]"
          defaultValue={task.detail ?? ''}
          disabled={archived}
          onBlur={(e) => saveIfChanged('detail', e.target.value === '' ? null : e.target.value)}
        />
      </Row>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Statut">
          <Select
            aria-label="Statut"
            defaultValue={task.status}
            items={STATUS_ITEMS}
            disabled={archived}
            onValueChange={(v) => saveIfChanged('status', v)}
          />
        </Row>
        <Row label="Taille">
          <Select
            aria-label="Taille"
            defaultValue={task.size ?? ''}
            items={SIZE_ITEMS}
            disabled={archived}
            onValueChange={(v) => saveIfChanged('size', v === '' ? null : v)}
          />
        </Row>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Row label="Zone">
          <TextInput
            defaultValue={task.zone ?? ''}
            disabled={archived}
            onKeyDown={blurOnEnter}
            onBlur={(e) => saveIfChanged('zone', e.target.value === '' ? null : e.target.value)}
          />
        </Row>
        <Row label="Code">
          <TextInput
            defaultValue={task.code ?? ''}
            disabled={archived}
            onKeyDown={blurOnEnter}
            onBlur={(e) => saveIfChanged('code', e.target.value === '' ? null : e.target.value)}
          />
        </Row>
      </div>

      {!archived && (
        <Row label="Dépend de">
          <MultiCombobox
            aria-label="Dépend de"
            value={task.dependsOn}
            items={dependItems}
            placeholder="Rechercher une tâche prérequise…"
            onValueChange={(ids) => saveIfChanged('dependsOn', ids)}
          />
        </Row>
      )}

      <Row label="Tags (séparés par des virgules)">
        <TextInput
          defaultValue={task.tags.join(', ')}
          disabled={archived}
          onKeyDown={blurOnEnter}
          onBlur={(e) => csvBlur(e, 'tags')}
        />
      </Row>
      <Row label="Refs (séparés par des virgules)">
        <TextInput
          defaultValue={task.refs.join(', ')}
          disabled={archived}
          onKeyDown={blurOnEnter}
          onBlur={(e) => csvBlur(e, 'refs')}
        />
      </Row>
      <Row label="Liens (ids séparés par des virgules)">
        <TextInput
          defaultValue={task.links.join(', ')}
          disabled={archived}
          onKeyDown={blurOnEnter}
          onBlur={linksBlur}
        />
      </Row>

      <Row label="Outcome (ce qui a été livré — matière à changelog)">
        <TextInput
          defaultValue={task.outcome ?? ''}
          disabled={archived}
          onKeyDown={blurOnEnter}
          onBlur={(e) => saveIfChanged('outcome', e.target.value === '' ? null : e.target.value)}
        />
      </Row>

      {consignation.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          {consignation.map((m) => <MetaLine key={m.label} label={m.label} value={m.value} />)}
        </div>
      )}

      <button
        type="button"
        className="self-start rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-900 hover:text-white"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(agentBrief(task))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // clipboard indisponible (contexte non sécurisé) — copie manuelle.
            window.prompt('Copie manuelle du brief :', agentBrief(task))
          }
        }}
      >
        {copied ? 'Copié' : 'Copier le brief agent'}
      </button>

      {/* Supprimer reste disponible sur l'archive (deleteTask la couvre) ;
          seul Archiver disparaît (déjà archivée / non done). */}
      <div className="mt-2 flex gap-2 border-t border-neutral-200 pt-4">
        {!archived && task.status === 'done' && (
          <button
            type="button"
            onClick={archive}
            disabled={pending}
            className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
          >
            {pending ? 'Archivage…' : 'Archiver'}
          </button>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-900 hover:text-white disabled:opacity-50"
        >
          {pending ? 'Suppression…' : 'Supprimer'}
        </button>
      </div>
    </div>
  )
}
