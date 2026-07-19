import { useMemo, useState, type ReactNode } from 'react'
import { ViewHeader } from './ViewHeader'
import { TypesRadar } from './TypesRadar'
import { KbGraph } from './KbGraph'
import { TempBadge } from './Temperature'
import { rowStateClass } from './ui'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { FlowAreaChart } from './FlowAreaChart'
import { tagKbGraph } from '../lib/tagKbGraph'
import { mostUrgent, oldest, recentlyAdded, createdVsClosedByDay } from '../lib/overview'
import { activeTasks, temperature, ageInDays } from '../lib/roadmap'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import type { KbFilters } from '../lib/kbFilter'
import type { TaskNode, TaskTree } from '../lib/tasks'

/**
 * Écran Overview (#375, ticket 4 de la spec 2026-07-19-overview-activity-ux) —
 * ÉTAPE 1. Les visualisations sorties du Backlog (#373) rassemblées dans une
 * GRILLE DE CARTES (design.md §3 tri-couche : la page reste #fafafa, jamais
 * redéclarée ici ; chaque carte est bg-white + filet neutral-200) :
 *   1. le radar par TYPE (TypesRadar, en LECTURE) ;
 *   2. le graphe nodal des TAGS rendu dans le visualiseur Graphify (KbGraph),
 *      via l'adaptateur pur tagKbGraph — continuité DS, décision Rémi ;
 *   3. un aperçu 5 TICKETS à 3 bascules (Urgents / Anciens / Récents).
 * L'étape 2 (chart créés-vs-fermés) arrive en #376.
 */

/** Date du jour locale "YYYY-MM-DD" (source de l'âge affiché ; parse local partout). */
function todayLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Filtres NEUTRES pour le graphe de tags : rien de masqué, tout visible. */
const NEUTRAL_FILTERS: KbFilters = { communities: [], fileTypes: [], hideInferred: false }

/** Carte de la grille — coquille tri-couche (bg-white + filet), titre optionnel. */
function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col overflow-hidden rounded border border-neutral-200 bg-white ${className}`}>
      {title && (
        <h2 className="shrink-0 border-b border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-500">{title}</h2>
      )}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  )
}

/** Compte des tickets OUVERTS (status ≠ done, sous-tâches comprises) par section/type. */
function openCountsByType(tree: TaskTree): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    let c = 0
    const visit = (t: TaskNode) => {
      if (t.status !== 'done') c += 1
      t.subtasks.forEach(visit)
    }
    s.tasks.forEach(visit)
    m.set(s.key, c)
  }
  return m
}

type PreviewMode = 'urgent' | 'old' | 'recent'
const MODES: { key: PreviewMode; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'old', label: 'Oldest' },
  { key: 'recent', label: 'Recent' },
]

/**
 * Bascule segmentée à sélection unique (langage « actif » du DS : bg-accent-tint
 * sur l'option courante, hover neutre sur les autres). Boutons aria-pressed —
 * même idiome que le toggle `inferred` de KbView et les axes du radar.
 */
function Segmented({ value, onChange }: { value: PreviewMode; onChange: (m: PreviewMode) => void }) {
  return (
    <div role="group" aria-label="Choose preview" className="inline-flex rounded-md border border-neutral-300 bg-white p-0.5">
      {MODES.map((m) => {
        const active = m.key === value
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            aria-pressed={active}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              active ? 'bg-accent-tint font-medium text-neutral-900' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {m.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A preview row: #id + truncated title + a contextual hint (temperature for
 * urgent, age for oldest, add date for recent). The whole row opens the
 * TaskPanel — and reflects the CURRENT ticket via the shared selection language
 * (#380, rowStateClass) exactly like TaskRow, so the open one is highlighted.
 */
function PreviewRow({ task, hint, isCurrent, onOpen }: { task: TaskNode; hint: ReactNode; isCurrent: boolean; onOpen: (id: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      aria-current={isCurrent ? 'true' : undefined}
      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${rowStateClass(isCurrent)}`}
    >
      <span className="shrink-0 font-mono text-xs text-neutral-500">#{task.id}</span>
      <span title={task.title} className="min-w-0 flex-1 truncate text-neutral-900">{task.title}</span>
      <span className="ml-auto flex shrink-0 items-center">{hint}</span>
    </button>
  )
}

export function OverviewView() {
  const { tree } = useTree()
  const { openTask, top } = usePanel()
  const [mode, setMode] = useState<PreviewMode>('urgent')
  // Radar en LECTURE : l'état de sélection est LOCAL et ne filtre AUCUNE liste
  // ici (le filtrage type→backlog vit dans le Backlog). Recliquer un axe le
  // désélectionne — le radar reste une carte de charge, pas un contrôle de vue.
  const [radarType, setRadarType] = useState('')

  const today = useMemo(() => todayLocal(), [])
  const counts = useMemo(() => (tree ? openCountsByType(tree) : new Map<string, number>()), [tree])
  const tagGraphData = useMemo(() => (tree ? tagKbGraph(activeTasks(tree)) : null), [tree])
  const dailyFlow = useMemo(() => (tree ? createdVsClosedByDay(tree) : []), [tree])
  const preview = useMemo(() => {
    if (!tree) return []
    if (mode === 'urgent') return mostUrgent(tree, 5, today)
    if (mode === 'old') return oldest(tree, 5)
    return recentlyAdded(tree, 5)
  }, [tree, mode, today])

  if (!tree) {
    return (
      <div className="flex h-full flex-col">
        <ViewHeader />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="text-sm text-neutral-500">Overview — waiting for the backlog…</p>
        </div>
      </div>
    )
  }

  const hintOf = (task: TaskNode): ReactNode => {
    if (mode === 'urgent') return <TempBadge t={temperature(tree, task, today)} />
    if (mode === 'old') {
      const age = task.createdAt ? ageInDays(task.createdAt, today) : null
      return <span className="font-mono text-[11px] text-neutral-500">{age === null ? '—' : `${age}d`}</span>
    }
    return task.createdAt ? (
      <span className="font-mono text-[11px] text-neutral-500" title={absoluteDate(task.createdAt)}>
        {relativeTime(task.createdAt)}
      </span>
    ) : (
      <span className="font-mono text-[11px] text-neutral-500">—</span>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ViewHeader />
      {/* Scroller sur la PAGE (#fafafa, jamais redéclaré) : la grille s'empile en
          une colonne sur petit écran, deux à partir de lg. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 1 — Radar par type (LECTURE). */}
            <Card title="Load by type">
              <div className="p-4">
                <TypesRadar counts={counts} selected={radarType} onSelect={setRadarType} />
              </div>
            </Card>

            {/* 3 — Aperçu 5 tickets à 3 bascules. */}
            <Card title="Backlog preview">
              <div className="flex h-full flex-col">
                <div className="shrink-0 px-4 pb-3 pt-1">
                  <Segmented value={mode} onChange={setMode} />
                </div>
                {preview.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-neutral-500">No tickets to show.</p>
                ) : (
                  <div className="divide-y divide-neutral-100 border-t border-neutral-100">
                    {preview.map((t) => (
                      <PreviewRow key={t.id} task={t} hint={hintOf(t)} isCurrent={top?.type === 'task' && top.id === t.id} onOpen={openTask} />
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* 4 — Graphe en aires créés-vs-fermés par JOUR (#376, étape 2 ; style
                shadcn, retour Rémi). Pleine largeur, aires lissées superposées.
                Données via createdVsClosedByDay — jamais recomptées ici. */}
            <Card title="Created vs closed / day" className="lg:col-span-2">
              <FlowAreaChart data={dailyFlow} />
            </Card>

            {/* 2 — Graphe nodal des TAGS via KbGraph (visualiseur Graphify réutilisé).
                Le clic-nœud est NEUTRALISÉ (onNodeClick no-op) : un tag n'ouvre pas
                de KbNodePanel. Hauteur FIXE (KbGraph prend tout l'espace de son
                conteneur — il n'est pas fait pour s'auto-dimensionner dans une carte). */}
            <Card title="Graphe des tags" className="lg:col-span-2">
              {tagGraphData && tagGraphData.nodes.length > 0 ? (
                <div className="h-[440px]">
                  <KbGraph graph={tagGraphData} filters={NEUTRAL_FILTERS} query="" onNodeClick={() => {}} />
                </div>
              ) : (
                <p className="px-4 py-12 text-center text-xs text-neutral-500">
                  No tags on tickets yet — the graph appears once a ticket carries tags.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
