import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { computeAvailability, missingPrereqs, type Availability } from '../lib/roadmap'
import { LockLocked } from 'trinil-react'
import { StatusGlyph } from './glyphs'
import { Chip } from './Chip'
import { countTasksDeep, SECTION_STATUS_FR, TEAM_ABBR } from '../lib/tasks'
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
 *  - done      : coche (StatusGlyph) + titre barré/atténué + chips zone/size ;
 *  - available : bordure pleine marquée + mention « Disponible » ;
 *  - locked    : carte estompée + « Prérequis manquants (#…) ».
 */
function TaskCard({ task, state, missing }: { task: TaskNode; state: Availability; missing: number[] }) {
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
  const titleCls = task.status === 'done' ? 'text-neutral-400 line-through' : dim ? 'text-neutral-400' : 'text-neutral-900'
  const subs = task.subtasks.length > 0 ? countTasksDeep(task.subtasks) : null
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      className={`relative -mt-px flex w-full flex-col gap-1.5 px-3 py-2.5 text-left first:mt-0 ${skin}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          {state === 'locked'
            ? <LockLocked size={11} className="shrink-0 text-neutral-400" ariaLabel="Verrouillée" />
            : <StatusGlyph status={task.status} />}
        </span>
        <span className="mt-px shrink-0 font-mono text-xs text-neutral-400">#{task.id}</span>
        <span className={`min-w-0 line-clamp-2 text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {/* Contenu de carte identique quel que soit l'état : glyphe + id + titre
          + ligne d'état. Les cartes done n'affichent plus de chips (le détail
          vit dans le panneau) — cohérence entre états et avec le Graphe. */}
      {state === 'locked' ? (
        <span className="text-[11px] text-neutral-400">
          Prérequis manquants{missing.length ? ` (${missing.map((d) => `#${d}`).join(' ')})` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Disponible</span>
      ) : null}
      {subs && (
        <span className="font-mono text-[11px] text-neutral-400">{subs.done}/{subs.total} sous-tâches</span>
      )}
      {/* Badge team (le QUI) — abrégé, coin bas droit de la carte. Même donnée
          = même rendu que le Backlog : Chip (design.md §2). */}
      <span className="absolute bottom-1.5 right-2"><Chip label={TEAM_ABBR[task.team]} /></span>
    </button>
  )
}

/**
 * Chaque colonne est une sous-grille alignée sur les 4 rangées partagées du
 * conteneur (titre / note / barre / cartes) : les en-têtes prennent tous la
 * hauteur du plus grand et les barres de progression sont alignées entre
 * colonnes, quelle que soit la longueur des notes. Les rangées vides gardent
 * un placeholder pour ne pas décaler les suivantes.
 */
function Column({ section, visible, avail }: { section: SectionNode; visible: TaskNode[]; avail: Map<number, Availability> }) {
  // Compteurs et barre = RÉEL (section.tasks) ; les cartes rendues = visible
  // (les done masqués ne changent pas la progression affichée).
  const { done, total } = countTasksDeep(section.tasks)
  const empty = section.tasks.length === 0
  const statusFr = section.status !== 'open' ? SECTION_STATUS_FR[section.status] : null
  return (
    // min-w-0 : un enfant de grille a min-width:auto par défaut → sans ça, un contenu
    // plus large que la piste (280px) déborde sur la colonne voisine (#97).
    <div className="grid row-span-4 min-w-0 grid-rows-subgrid">
      {/* Rangée titre collante : le contexte (titre + compteur) survit au scroll
          vertical. Le pt-8 du conteneur vit ici pour que rien ne dépasse au-dessus. */}
      <div className="sticky top-0 z-20 flex items-baseline justify-between gap-2 bg-[#fafafa] pb-0.5 pt-8">
        <span
          className={`min-w-0 truncate text-sm font-semibold tracking-tight ${empty ? 'text-neutral-300' : 'text-neutral-900'}`}
          title={section.title}
        >
          {section.title}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {statusFr && !empty && <Chip label={statusFr} />}
          <span className={`font-mono text-xs ${empty ? 'text-neutral-300' : 'text-neutral-400'}`}>{done}/{total}</span>
        </span>
      </div>
      {/* Stage vide = estompé : ni note ni barre, l'espace va aux stages peuplés. */}
      {section.note && !empty ? (
        <p className="text-xs leading-relaxed text-neutral-500">{section.note}</p>
      ) : (
        <div aria-hidden />
      )}
      <div className="self-end">{!empty && <ProgressBar done={done} total={total} />}</div>
      {/* Cartes accolées (gap 0, bordures fusionnées par -mt-px) : liste dense.
          Les cartes à liseré fort (sélection, disponible) passent au-dessus (z-10)
          pour que leur bordure ne soit pas mangée par la carte suivante. */}
      <div className="flex min-w-0 flex-col pt-1.5">
        {visible.map((t) => (
          <TaskCard key={t.id} task={t} state={avail.get(t.id) ?? 'available'} missing={missingPrereqs(t, avail)} />
        ))}
      </div>
    </div>
  )
}

/** Vue stages : une colonne par stage canonique — les vides restent visibles, estompés et resserrés. */
export function RoadmapColumns() {
  const { tree } = useTree()
  const [showDone] = useShowDone()
  if (!tree) return null
  // Pas de filtre team en Roadmap (décision Rémi) : la vue montre TOUT le
  // lancement — un filtre posé via le radar du Backlog ne déborde pas ici.
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const visibleOf = (s: SectionNode) => (showDone ? s.tasks : s.tasks.filter((t) => t.status !== 'done'))
  const avail = computeAvailability(tree)

  // Largeurs par colonne : un stage vide (ou vidé par le filtre) est resserré —
  // le chemin Idea→Mature reste entièrement visible sans voler l'espace.
  const template = sections.map((s) => (s.tasks.length === 0 ? '180px' : '280px')).join(' ')

  return (
    <div
      className="roadmap-cols-scroll grid h-full grid-flow-col grid-rows-[auto_auto_auto_1fr] gap-x-4 gap-y-1.5 overflow-x-auto px-6 pb-6"
      style={{ gridTemplateColumns: template }}
    >
      {sections.map((s) => <Column key={s.key} section={s} visible={visibleOf(s)} avail={avail} />)}
    </div>
  )
}
