import { useState } from 'react'
import { Plus } from 'trinil-react'
import { TaskRow } from './TaskRow'
import { Chip } from './Chip'
import { StatusGlyph } from './glyphs'
import { EpicRow, splitBacklogItems, type EpicListItem } from './EpicRow'
import { ErrorBanner, GhostInput, Select, type SelectItem } from './ui'
import { usePanel } from '../state/PanelContext'
import { allEpics, epicProgress } from '../lib/roadmap'
import { TEAMS, TEAM_ABBR, type Team, type TaskNode, type TaskTree } from '../lib/tasks'

const TEAM_ITEMS: SelectItem[] = TEAMS.map((t) => ({ value: t, label: t }))

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
      {label}{filtered ? ' avec ces filtres' : ''}.
    </p>
  )
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>À faire — par stage puis ancienneté</span>
          <span className="font-mono text-[11px]">{open.length}</span>
        </h2>
        {open.length === 0 ? empty("Rien d'ouvert") : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {visible.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-800"
              >
                Voir les {hidden} autres
              </button>
            )}
            {showAll && openItems.length > PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Réduire
              </button>
            )}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
          <span>Terminées — dernière bouclée en premier</span>
          <span className="font-mono text-[11px]">{done.length}</span>
        </h2>
        {done.length === 0 ? empty('Rien de terminé') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {doneItems.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} />)}
          </div>
        )}
      </section>
    </div>
  )
}

/** Tri canonique des ouvertes : stage (préfixe NN du dossier) puis id. */
export function sortOpen(tasks: TaskNode[], stageOf: (id: number) => string): TaskNode[] {
  const prefix = (id: number) => parseInt(stageOf(id), 10) || 99
  return [...tasks].sort((a, b) => prefix(a.id) - prefix(b.id) || a.id - b.id)
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
  const [team, setTeam] = useState<Team>('engineering')
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
        body: JSON.stringify({ section: '04-build', title: t, team, kind: 'quick', source: 'user' }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { setTitle(''); await reload() }
      else setError((data.errors ?? ['Erreur inconnue.']).join(' · '))
    } catch {
      setError('Échec réseau — le mini n’a pas été créé.')
    } finally {
      setBusy(false)
    }
  }

  const quickDone = async (t: TaskNode) => {
    const outcome = window.prompt(`Terminer #${t.id} — qu'est-ce qui a été livré ?`)
    if (outcome === null) return
    if (outcome.trim() === '') { setError('Un outcome est requis pour terminer un mini.'); return }
    try {
      const r = await fetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done', outcome: outcome.trim() }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) await reload()
      else setError((data.errors ?? ['Erreur inconnue.']).join(' · '))
    } catch {
      setError('Échec réseau — le mini n’a pas été terminé.')
    }
  }

  return (
    <section>
      <h2 className="mb-2 flex items-baseline justify-between px-1 text-xs font-medium text-neutral-500">
        <span>Mini — changements éclair, terminés d'un clic sur le glyphe</span>
        <span className="font-mono text-[11px]">{quicks.length}</span>
      </h2>
      <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
        {/* Création inline : titre puis Entrée — la team en Select compact (Base UI).
            Titre en peau ghost canonique (ghostCls) : invisible au repos, hover gris,
            focus bordure + fond blanc — le :focus-visible global reste actif. */}
        <div className="flex items-center gap-2 px-4 py-1.5">
          <Plus size={11} className="shrink-0 text-neutral-500" />
          <GhostInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
            placeholder="Nouveau mini — titre puis Entrée"
            aria-label="Nouveau mini"
            disabled={busy}
            className="min-w-0 flex-1 text-sm placeholder:text-neutral-500"
          />
          <div className="w-32 shrink-0">
            <Select
              defaultValue={team}
              onValueChange={(v) => setTeam(v as Team)}
              items={TEAM_ITEMS}
              aria-label="Team du mini"
              disabled={busy}
              compact
            />
          </div>
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
                title="Terminer (outcome demandé)"
                aria-label={`Terminer #${t.id}`}
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
                <span className="ml-auto shrink-0"><Chip label={TEAM_ABBR[t.team]} /></span>
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
