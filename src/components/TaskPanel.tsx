import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { agentBrief } from './TaskRow'
import { findTaskInTree } from '../lib/findTaskInTree'
import { reverseDependents, depState } from '../lib/roadmap'
import { StatusGlyph } from './glyphs'
import { Chip } from './Chip'
import { ErrorBanner } from './ui'
import { Markdown } from './Markdown'
import type { TaskNode, TaskTree } from '../lib/tasks'

/**
 * Panneau de tâche v2 « lecture d'abord » (spec docs/specs/2026-07-07-task-panel.md).
 * Cette version est le MODE LECTURE : une fiche lisible, zéro input visible.
 * L'édition au clic (tâche #26) et le done guidé (#27) s'ajoutent par-dessus.
 */

const STATUS_FR: Record<TaskNode['status'], string> = {
  todo: 'à faire', in_progress: 'en cours', done: 'faite',
}
const DEP_STATE_FR = {
  done: 'faite', available: 'disponible', locked: 'verrouillée', archived: 'archivée',
} as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wide text-neutral-400">{children}</div>
}

/** Ligne cliquable d'une tâche liée : glyphe + id + titre + badge d'état. Empile la navigation. */
function RelationRow({ tree, id, badge }: { tree: TaskTree; id: number; badge?: string }) {
  const { openTask } = usePanel()
  const t = findTaskInTree(tree, id)
  if (!t) {
    // Ne devrait pas arriver (deps validées) — on reste lisible plutôt que de planter.
    return <div className="px-1 py-1 font-mono text-xs text-neutral-400">#{id}</div>
  }
  return (
    <button
      type="button"
      onClick={() => openTask(id)}
      className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-neutral-100"
    >
      <StatusGlyph status={t.status} />
      <span className="shrink-0 font-mono text-xs text-neutral-400">#{t.id}</span>
      <span
        title={t.title}
        className={`min-w-0 truncate ${t.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}
      >
        {t.title}
      </span>
      {badge && <span className="ml-auto shrink-0 text-[11px] text-neutral-400">{badge}</span>}
    </button>
  )
}

function RelationList({ label, tree, ids, badgeOf }: {
  label: string
  tree: TaskTree
  ids: number[]
  badgeOf?: (id: number) => string
}) {
  if (ids.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-col">
        {ids.map((id) => (
          <RelationRow key={id} tree={tree} id={id} badge={badgeOf?.(id)} />
        ))}
      </div>
    </div>
  )
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-20 shrink-0 text-neutral-400">{label}</span>
      <span className="min-w-0 text-neutral-600">{value}</span>
    </div>
  )
}

/** Une ref = un chemin par ligne ; les docs markdown naviguent vers la Vue Docs. */
function RefLine({ refPath }: { refPath: string }) {
  const { close } = usePanel()
  const isDoc = refPath.startsWith('docs/') && refPath.endsWith('.md')
  if (!isDoc) return <div className="truncate font-mono text-xs text-neutral-600" title={refPath}>{refPath}</div>
  return (
    <button
      type="button"
      title={refPath}
      onClick={() => {
        // L'état vue/doc vit dans App (événement documenté là-bas). docPath est
        // relatif à docsDir — on retire le préfixe docs/ de la ref repo-relative.
        window.dispatchEvent(new CustomEvent('roadmaped:open-doc', { detail: refPath.replace(/^docs\//, '') }))
        close()
      }}
      className="w-full truncate rounded text-left font-mono text-xs text-neutral-800 underline decoration-neutral-300 underline-offset-2 hover:decoration-neutral-800"
    >
      {refPath}
    </button>
  )
}

export function TaskPanel({ id }: { id: number }) {
  const { tree, reload } = useTree()
  const { close } = usePanel()
  const [actionErrors, setActionErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  const task = tree ? findTaskInTree(tree, id) : null
  if (!tree || !task) return <p className="text-sm text-neutral-400">Tâche introuvable (rechargez).</p>

  const archived = task.file.includes('_archive/')
  const blocks = reverseDependents(tree, id).map((t) => t.id)
  const depBadge = (depId: number) => DEP_STATE_FR[depState(tree, depId)]
  const subBadge = (subId: number) => {
    const sub = task.subtasks.find((s) => s.id === subId)
    return sub ? STATUS_FR[sub.status] : ''
  }

  const act = async (url: string, init: RequestInit, failMsg: string) => {
    if (pending) return
    setPending(true)
    try {
      const r = await fetch(url, init)
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { await reload(); close() } else setActionErrors(data.errors ?? [])
    } catch {
      setActionErrors([failMsg])
    } finally {
      setPending(false)
    }
  }
  const archive = () => act(`/api/tasks/${id}/archive`, { method: 'POST' }, 'Échec réseau — la tâche n’a pas été archivée.')
  const remove = () => {
    if (!window.confirm(`Supprimer définitivement la tâche #${id} ? (l'id ne sera jamais réutilisé)`)) return
    void act(`/api/tasks/${id}`, { method: 'DELETE' }, 'Échec réseau — la tâche n’a pas été supprimée.')
  }

  const consignation = [
    { label: 'dates', value: `créée ${task.createdAt}${task.completedAt ? ` · terminée ${task.completedAt}` : ''}` },
    task.commit ? { label: 'commit', value: task.commit } : null,
    task.outcome ? { label: 'outcome', value: task.outcome } : null,
    task.verification ? { label: 'vérification', value: task.verification } : null,
    task.release ? { label: 'release', value: task.release } : null,
  ].filter((m): m is { label: string; value: string } => m !== null)

  return (
    <div className="flex min-h-full flex-col gap-5">
      <ErrorBanner errors={actionErrors} />

      {/* En-tête : glyphe + id (+ badge archive), puis le titre en gros. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <StatusGlyph status={task.status} />
          <span className="font-mono text-xs text-neutral-400">#{task.id}</span>
          <span className="text-xs text-neutral-500">{STATUS_FR[task.status]}</span>
          {archived && <Chip label="archivée" />}
        </div>
        <h2 className={`text-base font-semibold leading-snug tracking-tight ${task.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
          {task.title}
        </h2>
        {(task.size || task.zone || task.code || task.tags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {task.tags.map((t) => (
              <span key={t} className="text-[11px] text-neutral-400">#{t}</span>
            ))}
            {task.code && <Chip label={task.code} mono />}
            {task.zone && <Chip label={task.zone} />}
            {task.size && <Chip label={task.size} mono strong />}
          </div>
        )}
      </div>

      {/* Détail : markdown rendu, pleine hauteur naturelle (fini la lucarne). */}
      <div className="flex flex-col gap-1">
        <SectionLabel>Détail</SectionLabel>
        {task.detail ? (
          <Markdown source={task.detail} className="text-sm" />
        ) : (
          <p className="text-xs text-neutral-400">Aucun détail.</p>
        )}
      </div>

      <RelationList label="Dépend de" tree={tree} ids={task.dependsOn} badgeOf={depBadge} />
      <RelationList label="Bloque" tree={tree} ids={blocks} />
      <RelationList label="Sous-tâches" tree={tree} ids={task.subtasks.map((s) => s.id)} badgeOf={subBadge} />
      <RelationList label="Liens" tree={tree} ids={task.links} />

      {task.refs.length > 0 && (
        <div className="flex flex-col gap-1">
          <SectionLabel>Références</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {task.refs.map((r) => <RefLine key={r} refPath={r} />)}
          </div>
        </div>
      )}

      {consignation.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded border border-neutral-200 bg-neutral-50 px-3 py-2.5">
          {consignation.map((m) => <MetaLine key={m.label} label={m.label} value={m.value} />)}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-900 hover:text-white"
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
        {!archived && task.status === 'done' && (
          <button type="button" onClick={archive} disabled={pending}
            className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
            Archiver
          </button>
        )}
        <button type="button" onClick={remove} disabled={pending}
          className="rounded border border-neutral-300 px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-900 hover:text-white disabled:opacity-50">
          Supprimer
        </button>
      </div>

      {/* Pied : le chemin technique, relégué ici (audit UX). */}
      <div className="mt-auto border-t border-neutral-200 pt-3">
        <div className="truncate font-mono text-[11px] text-neutral-400" title={task.file}>{task.file}</div>
      </div>
    </div>
  )
}
