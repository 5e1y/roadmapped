import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings } from '../state/uiPersist'
import { TEAMS, type TaskNode, type Team } from '../lib/tasks'
import { ViewHeader } from './ViewHeader'
import { TaskColumns, sortOpen, sortDone } from './TaskColumns'

/** Team sélectionnée dans la vue Teams ('' = aucune) — persistée. */
function useSelectedTeam(): [Team | '', (next: Team | '') => void] {
  const [arr, setArr] = usePersistentStrings('teams:selected')
  return [(arr[0] as Team) ?? '', (next) => setArr(next ? [next] : [])]
}

const SIZE = 520
const CX = SIZE / 2
const CY = SIZE / 2
const R = 185
const RINGS = 4

/** Coordonnées du sommet i (8 axes, départ en haut, sens horaire). */
function vertex(i: number, r: number): [number, number] {
  const a = (Math.PI * 2 * i) / 8 - Math.PI / 2
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}
const ringPath = (r: number) =>
  Array.from({ length: 8 }, (_, i) => vertex(i, r).join(',')).join(' ')

/**
 * Radar octogonal de CHARGE (référence visuelle de Rémi) : un axe par team,
 * valeur = tickets ouverts. Anneaux + axes gris fins, polygone accent,
 * sommets cliquables → sélection de la team.
 */
function TeamsRadar({ counts, selected, onSelect }: {
  counts: Map<Team, number>
  selected: Team | ''
  onSelect: (t: Team | '') => void
}) {
  const max = Math.max(1, ...counts.values())
  const rOf = (team: Team) => ((counts.get(team) ?? 0) / max) * R
  const poly = TEAMS.map((t, i) => vertex(i, rOf(t)).join(',')).join(' ')
  return (
    <svg viewBox={`-70 -40 ${SIZE + 140} ${SIZE + 80}`} className="max-h-full w-full" role="img" aria-label="Charge par team">
      {/* anneaux concentriques + axes */}
      {Array.from({ length: RINGS }, (_, k) => (
        <polygon key={k} points={ringPath(((k + 1) / RINGS) * R)} fill="none" stroke="#e5e5e5" strokeWidth={1} />
      ))}
      {TEAMS.map((_, i) => {
        const [x, y] = vertex(i, R)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#e5e5e5" strokeWidth={1} />
      })}
      {/* polygone de charge */}
      <polygon points={poly} fill="var(--color-accent)" fillOpacity={0.12} stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
      {TEAMS.map((t, i) => {
        const [x, y] = vertex(i, rOf(t))
        return <circle key={t} cx={x} cy={y} r={4} fill="var(--color-accent)" />
      })}
      {/* labels cliquables (team + compte) aux sommets extérieurs */}
      {TEAMS.map((t, i) => {
        const [x, y] = vertex(i, R + 28)
        const active = selected === t
        return (
          <g key={t} className="cursor-pointer" onClick={() => onSelect(active ? '' : t)}>
            <text
              x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              className={active ? 'fill-accent text-[14px] font-semibold' : 'fill-neutral-600 text-[14px]'}
            >
              {t}
            </text>
            <text x={x} y={y + 17} textAnchor="middle" dominantBaseline="middle" className="fill-neutral-400 font-mono text-[11px]">
              {counts.get(t) ?? 0}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Vue Teams : radar de charge centré ; clic sur une team → radar en colonne
 * gauche + backlog (deux colonnes) filtré par la team à droite. Quand le
 * panneau de tâche est ouvert et que la place manque (< 2xl), la colonne
 * radar s'efface — elle revient à la fermeture du panneau.
 */
export function TeamsView() {
  const { tree, loading, loadError } = useTree()
  const { top } = usePanel()
  const [selected, setSelected] = useSelectedTeam()

  if (loading && !tree) {
    return <div className="px-6 py-14 text-sm text-neutral-500">Chargement…</div>
  }
  if (loadError || !tree) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-lg font-semibold tracking-tight">Serveur injoignable</h1>
        {loadError && <p className="mt-1 font-mono text-xs text-neutral-500">{loadError}</p>}
      </div>
    )
  }

  // Charge (radar) = tickets ouverts, SOUS-TÂCHES COMPRISES ; les listes ne
  // rendent que le premier niveau (TaskRow imbrique les sous-tâches).
  const counts = new Map<Team, number>(TEAMS.map((t) => [t, 0]))
  const stageOfId = new Map<number, string>()
  const topLevel: TaskNode[] = []
  const countLoad = (t: TaskNode) => {
    if (t.status !== 'done') counts.set(t.team, (counts.get(t.team) ?? 0) + 1)
    t.subtasks.forEach(countLoad)
  }
  for (const s of tree.sections) {
    if (s.status === 'abandoned') continue
    for (const t of s.tasks) {
      topLevel.push(t)
      stageOfId.set(t.id, s.key)
      countLoad(t)
    }
  }

  const panelOpen = top !== null
  const teamTasks = selected ? topLevel.filter((t) => t.team === selected) : []
  const open = sortOpen(teamTasks.filter((t) => t.status !== 'done'), (id) => stageOfId.get(id) ?? '99')
  const done = sortDone(teamTasks.filter((t) => t.status === 'done'))

  return (
    <div className="flex h-full flex-col">
      <ViewHeader title="Teams" meta={selected || 'charge par team — cliquer un sommet'}>
        {selected && (
          <button
            type="button"
            onClick={() => setSelected('')}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
          >
            Toutes les teams
          </button>
        )}
      </ViewHeader>

      {!selected ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8">
          <div className="h-full max-h-[640px] w-full max-w-[640px]">
            <TeamsRadar counts={counts} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Colonne radar : s'efface quand le panneau est ouvert et que la
              place manque (< 2xl) — réapparaît à la fermeture. */}
          <div className={`${panelOpen ? 'hidden 2xl:flex' : 'flex'} w-[420px] shrink-0 items-center border-r border-neutral-200 p-4`}>
            <TeamsRadar counts={counts} selected={selected} onSelect={setSelected} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl px-6 py-8">
              <TaskColumns open={open} done={done} filtered />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
