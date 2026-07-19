import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { computeAvailability, missingPrereqs, reverseDependents, type Availability } from '../lib/roadmap'
import { EditPen, LockLocked } from 'trinil-react'
import { Chevron, KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { TempBadge, rowTemperature } from './Temperature'
import { EpicBand, epicBandView } from './EpicBand'
import { countTasksDeep, SECTION_STATUS_LABEL } from '../lib/tasks'
import type { SectionNode, TaskNode } from '../lib/tasks'

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="h-1 w-full overflow-hidden rounded-round bg-neutral-200">
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
  // Langage de sélection UNIQUE de l'app (design.md §3.2) : courant = fond Active,
  // sinon survol = fond Rollover. JAMAIS de bordure animée (le ring reste Border,
  // porté par .rm-list-item) — le survol ne touche que le FOND (décision Rémi).
  const skin = isOpenInPanel ? 'bg-active' : 'transition-colors hover:bg-rollover'
  const dim = state === 'done' || state === 'locked'
  const titleCls = task.status === 'done' ? 'text-textsoft line-through' : dim ? 'text-textsoft' : 'text-texthard'
  const subs = task.subtasks.length > 0 ? countTasksDeep(task.subtasks) : null
  const temp = rowTemperature(task)
  return (
    // Densité (#246) : py-2 / gap-1 — la carte gagne ~6px sans perdre une info.
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      className={`rm-list-item relative flex w-full flex-col gap-1 px-3 py-2 text-left ${skin}`}>
      <div className="flex items-start gap-2">
        <span className="flex h-5 shrink-0 items-center">
          {state === 'locked'
            ? <LockLocked size={11} className="shrink-0 text-textsoft" ariaLabel="Locked" />
            : <KindGlyph task={task} />}
        </span>
        <span className="shrink-0 font-mono text-xs leading-5 text-textsoft">#{task.id}</span>
        <span className={`min-w-0 line-clamp-2 text-sm ${titleCls}`}>
          {task.title}
        </span>
      </div>
      {/* Contenu de carte identique quel que soit l'état : glyphe + id + titre
          + ligne d'état. Les cartes done n'affichent plus de chips (le détail
          vit dans le panneau) — cohérence entre états et avec le Graphe. */}
      {state === 'locked' ? (
        <span className="text-[11px] text-textsoft">
          Missing prerequisites{missing.length ? ` (${missing.map((d) => `#${d}`).join(' ')})` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-texthard">Available</span>
      ) : null}
      {subs && (
        <span className="font-mono text-[11px] text-textsoft">{subs.done}/{subs.total} subtasks</span>
      )}
      {/* Jalon (#133) : le poids du verrou — combien de tâches ce diamant retient. */}
      {task.kind === 'milestone' && blocksCount > 0 && (
        <span className="text-[11px] text-textsoft">blocks {blocksCount}</span>
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
 * `open` = les cartes rendues à plat ; `done` = les terminées, repliées
 * derrière « + N done » (#244) — [] quand le toggle done global est OFF.
 */
function Column({ section, scope, open, done, avail, blocksOf }: {
  section: SectionNode
  scope: TaskNode[]
  open: TaskNode[]
  done: TaskNode[]
  avail: Map<number, Availability>
  blocksOf: (t: TaskNode) => number
}) {
  // Dépli des done de LA colonne : état de session, replié par défaut.
  const [doneOpen, setDoneOpen] = useState(false)
  const { openSection } = usePanel()
  // Compteurs et barre = le périmètre RÉEL de la colonne (scope) ; les cartes
  // rendues = visible (les done masqués ne changent pas la progression affichée).
  const { done: doneCount, total } = countTasksDeep(scope)
  const empty = scope.length === 0
  const statusLabel = section.status !== 'open' ? SECTION_STATUS_LABEL[section.status] : null
  return (
    // min-w-0 : un enfant de grille a min-width:auto par défaut → sans ça, un contenu
    // plus large que la piste (280px) déborde sur la colonne voisine (#97).
    <div className="grid row-span-4 min-w-0 grid-rows-subgrid">
      {/* Rangée titre collante : le contexte (titre + compteur) survit au scroll
          vertical. Le pt-5 du conteneur vit ici pour que rien ne dépasse au-dessus. */}
      {/* bg-page (pas neutral-50) : le header colle sur la PAGE — depuis le split
          page/neutral-50 (#269), neutral-50 est plus clair que la page en sombre
          et dessinait une bande. En clair les deux valent ~#fafafa. */}
      <div className="group sticky top-0 z-20 flex items-baseline justify-between gap-2 bg-background pb-0.5 pt-5">
        <span
          className={`min-w-0 truncate text-sm font-semibold tracking-tight ${empty ? 'text-textsoft' : 'text-texthard'}`}
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
            className="rounded-interactive p-1 text-textsoft opacity-0 transition-opacity hover:bg-neutral-200 hover:text-texthard focus-visible:opacity-100 group-hover:opacity-100"
          >
            <EditPen size={12} />
          </button>
          {statusLabel && !empty && <Chip label={statusLabel} />}
          {/* Compteur porteur de sens même à 0/0 : plancher neutral-500 (audit #108). */}
          <span className="font-mono text-xs text-textsoft">{doneCount}/{total}</span>
        </span>
      </div>
      {/* Type vide = estompé : ni note ni barre, l'espace va aux types peuplés.
          Note CLAMPÉE à 2 lignes (#246) : une note longue gonflait la rangée
          subgrid de TOUTES les colonnes — l'intégrale vit dans le title. */}
      {section.note && !empty ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-textsoft" title={section.note}>{section.note}</p>
      ) : (
        <div aria-hidden />
      )}
      <div className="self-end">{!empty && <ProgressBar done={doneCount} total={total} />}</div>
      {/* Cartes accolées (gap 0, bordures fusionnées par -mt-px) : liste dense,
          à PLAT — plus de carte-groupe d'epic dans les colonnes (#235) : le
          transversal vit dans la bande d'epics au-dessus, chaque tâche chez
          son type. Les cartes à liseré fort (sélection) passent au-dessus
          (z-10) pour que leur bordure ne soit pas mangée par la suivante. */}
      <div className="rm-list min-w-0 pt-1.5">
        {open.map((task) => (
          <TaskCard key={task.id} task={task} state={avail.get(task.id) ?? 'available'} missing={missingPrereqs(task, avail)} blocksCount={blocksOf(task)} />
        ))}
        {/* Repli « + N done » (#244) : l'historique de la colonne à la demande,
            jamais N cartes barrées d'office. Rendu seulement toggle done ON. */}
        {done.length > 0 && (
          <Collapsible.Root open={doneOpen} onOpenChange={setDoneOpen}>
            <Collapsible.Trigger
              title={doneOpen ? 'Fold the completed tasks of this column' : 'Unfold the completed tasks of this column'}
              className="rm-list-item flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
            >
              <Chevron />
              {done.length} done
            </Collapsible.Trigger>
            <Collapsible.Panel>
              <div className="rm-list min-w-0">
                {done.map((task) => (
                  <TaskCard key={task.id} task={task} state={avail.get(task.id) ?? 'available'} missing={missingPrereqs(task, avail)} blocksCount={blocksOf(task)} />
                ))}
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        )}
      </div>
    </div>
  )
}

/**
 * Vue types (#235) : la bande d'epics transversale en tête + une colonne par
 * type canonique (9) — les vides restent visibles, estompés et resserrés.
 * Le filtre epic (clic sur une carte de la bande) restreint les 9 colonnes
 * aux membres de cet epic ; les compteurs/barres suivent le périmètre filtré.
 * L'état du filtre est REMONTÉ à RoadmapView (#343) — partagé avec le Graphe.
 */
export function RoadmapColumns({ showDone, epicFilter, onEpicFilter }: {
  showDone: boolean
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  const { tree } = useTree()
  if (!tree) return null
  const sections = tree.sections.filter((s) => s.status !== 'abandoned')
  const avail = computeAvailability(tree)
  // « bloque N » des jalons : dépendants inverses, calculé une fois par carte jalon.
  const blocksOf = (t: TaskNode) => (t.kind === 'milestone' ? reverseDependents(tree, t.id).length : 0)

  // Bande d'epics (#243) : découpe partagée avec le Graphe (#343) — non-terminés
  // en cartes, 100 % done derrière « + N done » (toggle done ON), epic
  // sélectionné toujours en carte, filtre d'un epic disparu ignoré.
  const { items: openBand, doneItems: doneBand, selected } = epicBandView(tree, showDone, epicFilter)

  const scopeOf = (s: SectionNode) =>
    selected === null ? s.tasks : s.tasks.filter((t) => t.epic === selected)
  // Cartes à plat = les non-terminées ; les done vont au repli par colonne
  // (#244) quand le toggle done global les rend visibles, sinon nulle part.
  const openOf = (s: SectionNode) => scopeOf(s).filter((t) => t.status !== 'done')
  const doneOf = (s: SectionNode) => (showDone ? scopeOf(s).filter((t) => t.status === 'done') : [])

  // Largeurs par colonne : un type vide (ou vidé par le filtre epic) est
  // resserré — les 9 colonnes restent visibles sans voler l'espace.
  const template = sections.map((s) => (scopeOf(s).length === 0 ? '180px' : '280px')).join(' ')

  return (
    <div className="flex h-full flex-col">
      <EpicBand items={openBand} doneItems={doneBand} selected={selected} onSelect={onEpicFilter} />
      <div
        className="roadmap-cols-scroll grid min-h-0 flex-1 grid-flow-col grid-rows-[auto_auto_auto_1fr] gap-x-4 gap-y-1.5 overflow-x-auto px-6 pb-6"
        style={{ gridTemplateColumns: template }}
      >
        {sections.map((s) => (
          <Column key={s.key} section={s} scope={scopeOf(s)} open={openOf(s)} done={doneOf(s)} avail={avail} blocksOf={blocksOf} />
        ))}
      </div>
    </div>
  )
}
