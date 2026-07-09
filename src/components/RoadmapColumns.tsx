import { useState } from 'react'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { computeAvailability, missingPrereqs, reverseDependents, globalProgress, type Availability } from '../lib/roadmap'
import { EditPen, LockLocked } from 'trinil-react'
import { KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { TempBadge, rowTemperature } from './Temperature'
import { EpicBand, epicBandItems } from './EpicBand'
import { countTasksDeep, SECTION_STATUS_LABEL } from '../lib/tasks'
import type { SectionNode, TaskNode } from '../lib/tasks'
import { useShowDone } from './RoadmapView'

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * Carte de tâche du mode Colonnes. Rend les trois états d'availability comme
 * GraphCard (mode Graphe) pour que les deux modes soient cohérents :
 *  - done      : coche (StatusGlyph) + titre barré/atténué ;
 *  - available : mention « Available » ;
 *  - locked    : carte estompée + « Missing prerequisites (#…) ».
 * Température (#235) : badge thermomètre + valeur au coin bas droit — LE slot
 * de l'ex-chip team — sur toute carte ouverte (rowTemperature).
 */
function TaskCard({ task, state, missing, blocksCount = 0 }: { task: TaskNode; state: Availability; missing: number[]; blocksCount?: number }) {
  const { openTask, top } = usePanel()
  // Même convention visuelle que GraphCard : fond blanc opaque, l'état estompé
  // s'exprime par la bordure et l'encre (pas d'opacity), la disponibilité par la
  // bordure pleine marquée. Tâche ouverte dans le panneau → bordure accent (#36).
  const isOpenInPanel = top?.type === 'task' && top.id === task.id
  // Le hover ne masque JAMAIS la sélection : une carte ouverte reste accent
  // sous la souris (sinon le clic paraît « gris » jusqu'au mouse exit).
  // Sélection = même langage que le Backlog (fond accent + filet gauche) ;
  // les disponibles n'ont PLUS de contour fort (décision Rémi batch 2).
  const skin = isOpenInPanel
    ? 'border border-neutral-200 bg-accent-tint shadow-[inset_2px_0_0_var(--color-accent)]'
    : 'border border-neutral-200 bg-white hover:z-10 hover:border-neutral-400'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-neutral-500 line-through' : dim ? 'text-neutral-500' : 'text-neutral-900'
  const subs = task.subtasks.length > 0 ? countTasksDeep(task.subtasks) : null
  const temp = rowTemperature(task)
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      className={`relative -mt-px flex w-full flex-col gap-1.5 px-3 py-2.5 text-left first:mt-0 ${skin}`}>
      <div className="flex items-start gap-2">
        <span className="flex h-5 shrink-0 items-center">
          {state === 'locked'
            ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Locked" />
            : <KindGlyph task={task} />}
        </span>
        <span className="shrink-0 font-mono text-xs leading-5 text-neutral-500">#{task.id}</span>
        <span className={`min-w-0 line-clamp-2 text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {/* Contenu de carte identique quel que soit l'état : glyphe + id + titre
          + ligne d'état. Les cartes done n'affichent plus de chips (le détail
          vit dans le panneau) — cohérence entre états et avec le Graphe. */}
      {state === 'locked' ? (
        <span className="text-[11px] text-neutral-500">
          Missing prerequisites{missing.length ? ` (${missing.map((d) => `#${d}`).join(' ')})` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Available</span>
      ) : null}
      {subs && (
        <span className="font-mono text-[11px] text-neutral-500">{subs.done}/{subs.total} subtasks</span>
      )}
      {/* Jalon (#133) : le poids du verrou — combien de tâches ce diamant retient. */}
      {task.kind === 'milestone' && blocksCount > 0 && (
        <span className="text-[11px] text-neutral-500">blocks {blocksCount}</span>
      )}
      {/* Température (#235) — coin bas droit, l'emplacement exact de l'ex-chip team. */}
      {temp && <span className="absolute bottom-1.5 right-2"><TempBadge t={temp} /></span>}
    </button>
  )
}

/**
 * Chaque colonne est une sous-grille alignée sur les 4 rangées partagées du
 * conteneur (titre / note / barre / cartes) : les en-têtes prennent tous la
 * hauteur du plus grand et les barres de progression sont alignées entre
 * colonnes, quelle que soit la longueur des notes. Les rangées vides gardent
 * un placeholder pour ne pas décaler les suivantes.
 * `scope` = les tâches comptées (filtre epic appliqué, done compris) ;
 * `tasks` = les cartes rendues (toggle « done » appliqué en plus).
 */
function Column({ section, scope, tasks, avail, blocksOf }: {
  section: SectionNode
  scope: TaskNode[]
  tasks: TaskNode[]
  avail: Map<number, Availability>
  blocksOf: (t: TaskNode) => number
}) {
  const { openSection } = usePanel()
  // Compteurs et barre = le périmètre RÉEL de la colonne (scope) ; les cartes
  // rendues = visible (les done masqués ne changent pas la progression affichée).
  const { done, total } = countTasksDeep(scope)
  const empty = scope.length === 0
  const statusLabel = section.status !== 'open' ? SECTION_STATUS_LABEL[section.status] : null
  return (
    // min-w-0 : un enfant de grille a min-width:auto par défaut → sans ça, un contenu
    // plus large que la piste (280px) déborde sur la colonne voisine (#97).
    <div className="grid row-span-4 min-w-0 grid-rows-subgrid">
      {/* Rangée titre collante : le contexte (titre + compteur) survit au scroll
          vertical. Le pt-5 du conteneur vit ici pour que rien ne dépasse au-dessus. */}
      <div className="group sticky top-0 z-20 flex items-baseline justify-between gap-2 bg-neutral-50 pb-0.5 pt-5">
        <span
          className={`min-w-0 truncate text-sm font-semibold tracking-tight ${empty ? 'text-neutral-500' : 'text-neutral-900'}`}
          title={section.title}
        >
          {section.title}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Entrée du panneau de section (#28) : LE point d'accès à l'édition
              statut/note depuis que le Backlog n'accordéonne plus les sections
              actives. Révélé au survol ET au focus (design.md §3.4). */}
          <button
            type="button"
            aria-label={`Edit section ${section.title}`}
            title="Edit section"
            onClick={() => openSection(section.key)}
            className="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <EditPen size={12} />
          </button>
          {statusLabel && !empty && <Chip label={statusLabel} />}
          {/* Compteur porteur de sens même à 0/0 : plancher neutral-500 (audit #108). */}
          <span className="font-mono text-xs text-neutral-500">{done}/{total}</span>
        </span>
      </div>
      {/* Type vide = estompé : ni note ni barre, l'espace va aux types peuplés. */}
      {section.note && !empty ? (
        <p className="text-xs leading-relaxed text-neutral-500">{section.note}</p>
      ) : (
        <div aria-hidden />
      )}
      <div className="self-end">{!empty && <ProgressBar done={done} total={total} />}</div>
      {/* Cartes accolées (gap 0, bordures fusionnées par -mt-px) : liste dense,
          à PLAT — plus de carte-groupe d'epic dans les colonnes (#235) : le
          transversal vit dans la bande d'epics au-dessus, chaque tâche chez
          son type. Les cartes à liseré fort (sélection) passent au-dessus
          (z-10) pour que leur bordure ne soit pas mangée par la suivante. */}
      <div className="flex min-w-0 flex-col pt-1.5">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} state={avail.get(task.id) ?? 'available'} missing={missingPrereqs(task, avail)} blocksCount={blocksOf(task)} />
        ))}
      </div>
    </div>
  )
}

/**
 * Vue types (#235) : la bande d'epics transversale en tête + une colonne par
 * type canonique (9) — les vides restent visibles, estompés et resserrés.
 * Le filtre epic (clic sur une carte de la bande) restreint les 9 colonnes
 * aux membres de cet epic ; les compteurs/barres suivent le périmètre filtré.
 */
export function RoadmapColumns() {
  const { tree } = useTree()
  const [showDone] = useShowDone()
  // Filtre epic : état de session (pas persisté — un filtre de lecture, pas une préférence).
  const [epicFilter, setEpicFilter] = useState<string | null>(null)
  if (!tree) return null
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const avail = computeAvailability(tree)
  // « bloque N » des jalons : dépendants inverses, calculé une fois par carte jalon.
  const blocksOf = (t: TaskNode) => (t.kind === 'milestone' ? reverseDependents(tree, t.id).length : 0)

  // Bande d'epics : les terminés suivent le toggle « done » (repli, comme les
  // cartes) — sauf celui éventuellement sélectionné, jamais escamoté sous son
  // propre filtre. Le filtre d'un epic disparu (rename/reload) est ignoré.
  const band = epicBandItems(tree).filter(
    (i) => showDone || i.status !== 'done' || i.slug === epicFilter,
  )
  const selected = epicFilter !== null && band.some((i) => i.slug === epicFilter) ? epicFilter : null

  const scopeOf = (s: SectionNode) =>
    selected === null ? s.tasks : s.tasks.filter((t) => t.epic === selected)
  const visibleOf = (s: SectionNode) =>
    scopeOf(s).filter((t) => showDone || t.status !== 'done')

  // Largeurs par colonne : un type vide (ou vidé par le filtre epic) est
  // resserré — les 9 colonnes restent visibles sans voler l'espace.
  const template = sections.map((s) => (scopeOf(s).length === 0 ? '180px' : '280px')).join(' ')

  return (
    <div className="flex h-full flex-col">
      <EpicBand items={band} selected={selected} onSelect={setEpicFilter} />
      <div
        className="roadmap-cols-scroll grid min-h-0 flex-1 grid-flow-col grid-rows-[auto_auto_auto_1fr] gap-x-4 gap-y-1.5 overflow-x-auto px-6 pb-6"
        style={{ gridTemplateColumns: template }}
      >
        {sections.map((s) => (
          <Column key={s.key} section={s} scope={scopeOf(s)} tasks={visibleOf(s)} avail={avail} blocksOf={blocksOf} />
        ))}
      </div>
    </div>
  )
}

/**
 * Avancement global du lancement (#133) — servi au header de la vue Roadmap :
 * compteur x/y + barre fine, même langage que les barres de colonne.
 */
export function GlobalProgress() {
  const { tree } = useTree()
  if (!tree) return null
  const { done, total } = globalProgress(tree)
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span className="flex items-center gap-2" title={`Overall progress: ${done}/${total} tasks (${pct}%)`}>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs text-neutral-500">{done}/{total} · {pct}%</span>
    </span>
  )
}
