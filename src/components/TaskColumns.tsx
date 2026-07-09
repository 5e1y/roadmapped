import { useState } from 'react'
import { Plus } from 'trinil-react'
import { TaskRow } from './TaskRow'
import { StatusGlyph } from './glyphs'
import { EpicRow, splitBacklogItems, type EpicListItem } from './EpicRow'
import { ErrorBanner, GhostInput } from './ui'
import { usePanel } from '../state/PanelContext'
import { allEpics, epicProgress } from '../lib/roadmap'
import { type TaskNode, type TaskTree } from '../lib/tasks'

const PREVIEW = 12

/** Rend un item de liste mixte : ligne-epic repliable ou TaskRow à plat (#135). */
function ListItemRow({ item, tree }: { item: EpicListItem; tree: TaskTree }) {
  return item.type === 'epic' ? (
    <EpicRow
      slug={item.slug}
      title={item.title}
      tasks={item.tasks}
      progress={epicProgress(tree, item.slug)}
      persistKey="backlog:epics"
    />
  ) : (
    <TaskRow task={item.task} />
  )
}

/**
 * LA liste de travail (Backlog et vue Teams) — UNE colonne large (décision
 * Rémi) : les 12 prochaines à faire (ordre stage puis ancienneté, calculé par
 * l'appelant) + « voir plus », puis les terminées APRÈS (dernière bouclée en
 * premier). Les lignes portent la date de bouclage.
 *
 * Epics (#135) : les tâches portant un epic ne sont PLUS à plat — elles vivent
 * dans une ligne-groupe repliée par défaut (EpicRow), ancrée à la position de
 * sa première membre. Dé-dup (#140-B) : un epic ne vit que d'UN côté — côté
 * « À faire » tant qu'il n'est pas 100 % terminé (ses tâches done sont rendues
 * DANS le groupe), côté « Terminées » seulement quand tout est bouclé.
 */
export function TaskList({ open, done, tree, filtered }: {
  open: TaskNode[]
  done: TaskNode[]
  tree: TaskTree
  /** Vrai si des filtres sont actifs (adapte le texte des états vides). */
  filtered?: boolean
}) {
  const [showAll, setShowAll] = useState(false)
  const epics = allEpics(tree)
  // Complétion GLOBALE (epicProgress, sous-tâches comprises) : c'est elle qui
  // décide du côté, pas le sous-ensemble filtré affiché.
  const isComplete = (slug: string) => {
    const p = epicProgress(tree, slug)
    return p.total > 0 && p.done === p.total
  }
  // Le seuil « voir plus » compte des LIGNES (un epic replié = une ligne).
  const { open: openItems, done: doneItems } = splitBacklogItems(open, done, epics, isComplete)
  const visible = showAll ? openItems : openItems.slice(0, PREVIEW)
  const hidden = openItems.length - visible.length
  const keyOf = (i: EpicListItem) => (i.type === 'epic' ? `epic:${i.slug}` : `task:${i.task.id}`)
  const empty = (label: string) => (
    <p className="border border-dashed border-neutral-300 px-4 py-8 text-center text-xs text-neutral-500">
      {label}{filtered ? ' with these filters' : ''}.
    </p>
  )
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>To do — hottest first</span>
          <span className="font-mono text-[11px]">{open.length}</span>
        </h2>
        {open.length === 0 ? empty('Nothing open') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {visible.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
              >
                Show {hidden} more
              </button>
            )}
            {showAll && openItems.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>Done — most recently completed first</span>
          <span className="font-mono text-[11px]">{done.length}</span>
        </h2>
        {done.length === 0 ? empty('Nothing done yet') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {doneItems.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
          </div>
        )}
      </section>
    </div>
  )
}

/** Tri canonique des ouvertes : stage (préfixe NN du dossier) puis id. */
export function sortOpen(tasks: TaskNode[]): TaskNode[] {
  // Priorité = TEMPÉRATURE (jalons v2) : le backlog sert la file la plus chaude
  // d'abord, comme `next`. Tie-break id croissant (plus ancien). Remplace l'ancien
  // tri par préfixe de stage, qui n'a plus de sens (les colonnes sont des types).
  const temp = (t: TaskNode) => t.temperature?.value ?? 0
  return [...tasks].sort((a, b) => temp(b) - temp(a) || a.id - b.id)
}

/** Tri canonique des terminées : completedAt décroissant puis id décroissant. */
export function sortDone(tasks: TaskNode[]): TaskNode[] {
  return [...tasks].sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '') || b.id - a.id)
}

/**
 * Zone « Mini » (spec token-economy §3) : les quick OUVERTS, au-dessus de
 * « À faire ». Lignes ultra-denses, création inline (titre + team, Entrée),
 * done rapide au clic sur le glyphe (outcome demandé, un seul PATCH). Les
 * quick terminés rejoignent la liste « Terminées » normale.
 */
export function MiniZone({ quicks, reload }: { quicks: TaskNode[]; reload: () => Promise<void> }) {
  const { openTask, top } = usePanel()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: '02-feature', title: t, kind: 'quick', source: 'user' }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { setTitle(''); await reload() }
      else setError((data.errors ?? ['Unknown error.']).join(' · '))
    } catch {
      setError('Network error — the mini was not created.')
    } finally {
      setBusy(false)
    }
  }

  const quickDone = async (t: TaskNode) => {
    const outcome = window.prompt(`Finish #${t.id} — what was delivered?`)
    if (outcome === null) return
    if (outcome.trim() === '') { setError('An outcome is required to finish a mini.'); return }
    try {
      const r = await fetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', outcome: outcome.trim() }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) await reload()
      else setError((data.errors ?? ['Unknown error.']).join(' · '))
    } catch {
      setError('Network error — the mini was not finished.')
    }
  }

  return (
    <section>
      <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
        <span>Mini — lightning changes, finished with one click on the glyph</span>
        <span className="font-mono text-[11px]">{quicks.length}</span>
      </h2>
      <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
        {/* Création inline : titre puis Entrée. Titre en peau ghost canonique
            (ghostCls) : invisible au repos, hover gris, focus bordure + fond
            blanc — le :focus-visible global reste actif. */}
        <div className="flex items-center gap-2 px-4 py-1.5">
          <Plus size={11} className="shrink-0 text-neutral-500" />
          <GhostInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
            placeholder="New mini — title, then Enter"
            aria-label="New mini"
            disabled={busy}
            className="min-w-0 flex-1 text-sm placeholder:text-neutral-500"
          />
        </div>
        {quicks.map((t) => {
          const isOpenInPanel = top?.type === 'task' && top.id === t.id
          return (
            <div
              key={t.id}
              className={`flex items-center gap-2 px-4 ${isOpenInPanel ? 'bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-neutral-50'}`}
            >
              <button
                type="button"
                onClick={() => void quickDone(t)}
                title="Finish (outcome prompted)"
                aria-label={`Finish #${t.id}`}
                className="shrink-0 rounded p-1 hover:bg-neutral-200"
              >
                <StatusGlyph status={t.status} />
              </button>
              <button
                type="button"
                onClick={() => openTask(t.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
              >
                <span className="shrink-0 font-mono text-xs text-neutral-500">#{t.id}</span>
                <span title={t.title} className="min-w-0 truncate text-sm text-neutral-900">{t.title}</span>
              </button>
            </div>
          )
        })}
      </div>
      {/* Registre d'erreur canonique (ErrorBanner, role=alert) — plus de paragraphe nu. */}
      {error && (
        <div className="mt-1">
          <ErrorBanner errors={[error]} />
        </div>
      )}
    </section>
  )
}
