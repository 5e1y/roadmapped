import { Bank, Code, ColorPalette, Gear, Hammer, Handshake, Headphones, Megaphone } from 'trinil-react'
import type { ComponentType } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStrings } from '../state/uiPersist'
import { TEAMS, type TaskNode, type Team } from '../lib/tasks'
import { ViewHeader } from './ViewHeader'
import { TaskList, sortOpen, sortDone } from './TaskColumns'

/** Icône trinil de chaque métier (cartes du radar). */
const TEAM_ICON: Record<Team, ComponentType<{ size?: number; className?: string }>> = {
  marketing: Megaphone, sales: Handshake, support: Headphones, operations: Gear,
  finance: Bank, legal: Hammer, engineering: Code, design: ColorPalette,
}

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
 * Radar octogonal de CHARGE. Lisibilité à TOUTE échelle (retour Rémi) :
 *  - le SVG ne porte que la géométrie (anneaux, axes, polygone, points) avec
 *    des traits NON-SCALANTS (vector-effect) — visibles même tout petit ;
 *  - les cartes de teams sont des BOUTONS HTML superposés, positionnés en %,
 *    police 12px FIXE quelle que soit la taille du radar, ancrés vers
 *    l'extérieur (jamais par-dessus les anneaux, jamais hors cadre).
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
    <div className="relative aspect-square w-full" role="img" aria-label="Charge par team">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-[15%] h-[70%] w-[70%] overflow-visible" aria-hidden="true">
        {Array.from({ length: RINGS }, (_, k) => (
          <polygon key={k} points={ringPath(((k + 1) / RINGS) * R)} fill="none" stroke="#d4d4d4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {TEAMS.map((_, i) => {
          const [x, y] = vertex(i, R)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#d4d4d4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        })}
        <polygon points={poly} fill="var(--color-accent)" fillOpacity={0.12} stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {TEAMS.map((t, i) => {
          const [x, y] = vertex(i, rOf(t))
          return <circle key={t} cx={x} cy={y} r={5} fill="var(--color-accent)" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      {/* Cartes HTML à taille FIXE, centrées sur un rayon au-delà des anneaux
          (l'anneau extérieur vit à ~25 % du conteneur, les cartes à 35/38 %) :
          jamais sur la grille, jamais hors cadre. */}
      {TEAMS.map((t, i) => {
        const a = (Math.PI * 2 * i) / 8 - Math.PI / 2
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        const active = selected === t
        const Icon = TEAM_ICON[t]
        return (
          <button
            key={t}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(active ? '' : t) }}
            aria-pressed={active}
            style={{
              left: `${50 + cos * 35}%`,
              top: `${50 + sin * 38}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`absolute flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs transition-colors ${
              active
                ? 'border-accent bg-accent-tint font-medium text-neutral-900'
                : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-900'
            }`}
          >
            <Icon size={12} className={active ? 'text-accent' : 'text-neutral-400'} />
            {t}
            <span className={`font-mono text-[11px] ${active ? 'text-accent' : 'text-neutral-400'}`}>
              {counts.get(t) ?? 0}
            </span>
          </button>
        )
      })}
    </div>
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
      <ViewHeader title="Teams" meta={selected ? `${selected} — cliquer dans le vide du radar pour tout revoir` : 'charge par team — cliquer un sommet'} />

      {!selected ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8" onClick={() => setSelected('')}>
          <div className="h-full max-h-[640px] w-full max-w-[640px]">
            <TeamsRadar counts={counts} selected={selected} onSelect={setSelected} />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Colonne radar : s'efface quand le panneau est ouvert et que la
              place manque (< 2xl) — réapparaît à la fermeture. */}
          {/* Clic dans le vide de la fenêtre du radar = revoir toutes les teams. */}
          <div
            onClick={() => setSelected('')}
            className={`${panelOpen ? 'hidden 2xl:flex' : 'flex'} w-[420px] shrink-0 cursor-pointer items-center border-r border-neutral-200 p-2`}
          >
            <TeamsRadar counts={counts} selected={selected} onSelect={setSelected} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-6 py-8">
              <TaskList open={open} done={done} filtered />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
