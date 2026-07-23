import { useMemo, useState, type ReactNode } from 'react'
import { ViewShell } from './ViewHeader'
import { TypesRadar } from './TypesRadar'
import { TagBars } from './TagBars'
import { TempBadge } from './Temperature'
import { EmptyState, rowStateClass, TogglePill, TreeStateGuard } from './ui'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { FlowAreaChart } from './FlowAreaChart'
import { mostUrgent, oldest, recentlyAdded, createdVsClosedByDay } from '../lib/overview'
import { activeTasks, temperature, ageInDays } from '../lib/roadmap'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
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

/** Fréquence des tags sur les tickets OUVERTS, du plus fréquent au moins, plafonné. */
function tagFrequency(tree: TaskTree): { tag: string; count: number }[] {
  const m = new Map<string, number>()
  for (const t of activeTasks(tree)) for (const tag of t.tags) m.set(tag, (m.get(tag) ?? 0) + 1)
  return [...m.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 20)
}

/** Carte de la grille — coquille tri-couche (bg-white + filet), titre optionnel. */
function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-surface bg-foreground ring-1 ring-inset ring-border ${className}`}>
      {title && (
        <h2 className="shrink-0 px-l py-s text-xs font-medium text-textsoft shadow-[inset_0_-1px_0_var(--color-border)]">{title}</h2>
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
 * Bascule à sélection unique : un groupe de TogglePill (langage « contrôle
 * enclenché » unifié, cf. ui.tsx), une seule active à la fois. Chaque pill gère
 * son aria-pressed ; le groupe porte role/aria-label pour l'annonce lecteur.
 */
function Segmented({ value, onChange }: { value: PreviewMode; onChange: (m: PreviewMode) => void }) {
  return (
    <div role="group" aria-label="Choose preview" className="inline-flex gap-xs">
      {MODES.map((m) => (
        <TogglePill key={m.key} active={m.key === value} onClick={() => onChange(m.key)}>
          {m.label}
        </TogglePill>
      ))}
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
      className={`flex w-full items-center gap-s px-l py-s text-left text-sm transition-colors ${rowStateClass(isCurrent)}`}
    >
      <span className="shrink-0 font-mono text-xs text-textsoft">#{task.id}</span>
      <span title={task.title} className="min-w-0 flex-1 truncate text-texthard">{task.title}</span>
      <span className="ml-auto flex shrink-0 items-center">{hint}</span>
    </button>
  )
}

export function OverviewView() {
  const { tree } = useTree()
  const { openTask, top } = usePanel()
  const [mode, setMode] = useState<PreviewMode>('urgent')

  const today = useMemo(() => todayLocal(), [])
  const counts = useMemo(() => (tree ? openCountsByType(tree) : new Map<string, number>()), [tree])
  const tagCounts = useMemo(() => (tree ? tagFrequency(tree) : []), [tree])
  const dailyFlow = useMemo(() => (tree ? createdVsClosedByDay(tree) : []), [tree])
  const preview = useMemo(() => {
    if (!tree) return []
    if (mode === 'urgent') return mostUrgent(tree, 5, today)
    if (mode === 'old') return oldest(tree, 5)
    return recentlyAdded(tree, 5)
  }, [tree, mode, today])

  // Overview honore désormais loadError (#384, H2) : la garde PARTAGÉE remplace
  // l'ancien « waiting for the backlog… » à l'infini quand le serveur est mort —
  // elle montre « Server unreachable » / « Loading… » comme les autres vues, sous
  // le header. Rendue depuis le corps du ViewShell (le header reste visible).
  if (!tree) {
    return (
      <ViewShell>
        <TreeStateGuard>{null}</TreeStateGuard>
      </ViewShell>
    )
  }

  const hintOf = (task: TaskNode): ReactNode => {
    if (mode === 'urgent') return <TempBadge t={temperature(tree, task, today)} />
    if (mode === 'old') {
      const age = task.createdAt ? ageInDays(task.createdAt, today) : null
      return <span className="font-mono text-[11px] text-textsoft">{age === null ? '—' : `${age}d`}</span>
    }
    return task.createdAt ? (
      <span className="font-mono text-[11px] text-textsoft" title={absoluteDate(task.createdAt)}>
        {relativeTime(task.createdAt)}
      </span>
    ) : (
      <span className="font-mono text-[11px] text-textsoft">—</span>
    )
  }

  return (
    <ViewShell>
      <TreeStateGuard>
      {/* Scroller sur la PAGE (#fafafa, jamais redéclaré) : la grille s'empile en
          une colonne sur petit écran, deux à partir de lg. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-xl py-xl">
          <div className="grid grid-cols-1 gap-l lg:grid-cols-2">
            {/* Rangée 1 (retour Rémi) — radar | chart CÔTE À CÔTE : deux viz de
                hauteur comparable, fini la colonne à moitié vide. */}
            {/* 1 — Radar par type (LECTURE pure, la sélection ne filtrait rien).
                PLEINE TAILLE : le radar a besoin de sa place (lisibilité des 9 axes) —
                c'est le CHART qui s'étire en hauteur pour s'aligner sur lui (un graphe
                x/y grandit sans coût d'UX), pas l'inverse (décision Rémi). */}
            <Card title="Open tickets by type">
              <div className="p-l">
                <TypesRadar counts={counts} />
              </div>
            </Card>

            {/* 2 — Graphe en aires créés-vs-fermés par JOUR (aires lissées superposées,
                style shadcn). Données via createdVsClosedByDay — jamais recomptées ici. */}
            <Card title="Created vs closed / day">
              <FlowAreaChart data={dailyFlow} />
            </Card>

            {/* Rangée 2 — Aperçu 5 tickets à 3 bascules, PLEINE LARGEUR sous la rangée. */}
            <Card title="Backlog preview" className="lg:col-span-2">
              <div className="flex h-full flex-col">
                <div className="shrink-0 px-l pb-m pt-xs">
                  <Segmented value={mode} onChange={setMode} />
                </div>
                {preview.length === 0 ? (
                  <EmptyState className="py-[calc(var(--spacing-xl)+var(--spacing-s))]" title="No tickets to show" />
                ) : (
                  <div className="rm-list rm-nest">
                    {preview.map((t) => (
                      <div key={t.id} className="rm-list-item">
                        <PreviewRow task={t} hint={hintOf(t)} isCurrent={top?.type === 'task' && top.id === t.id} onOpen={openTask} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Rangée 3 — Tickets ouverts par TAG (diagramme en bâtons verticaux,
                décision Rémi : remplace l'ex-graphe nodal). */}
            <Card title="Open tickets by tag" className="lg:col-span-2">
              {tagCounts.length > 0 ? (
                <TagBars data={tagCounts} />
              ) : (
                <EmptyState className="py-[calc(var(--spacing-xl)*2)]" title="No tags on tickets yet" hint="The chart appears once an open ticket carries tags." />
              )}
            </Card>
          </div>
        </div>
      </div>
      </TreeStateGuard>
    </ViewShell>
  )
}
