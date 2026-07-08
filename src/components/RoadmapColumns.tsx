import { Collapsible } from '@base-ui/react/collapsible'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { usePersistentStringFlag } from '../state/uiPersist'
import { computeAvailability, missingPrereqs, reverseDependents, globalProgress, allEpics, epicProgress, type Availability } from '../lib/roadmap'
import { EditPen, LockLocked } from 'trinil-react'
import { Chevron, EpicGlyph, KindGlyph } from './glyphs'
import { Chip } from './Chip'
import { groupByEpicAnchored, epicAnchorStage, epicStatusOf, type EpicListItem } from './EpicRow'
import { countTasksDeep, SECTION_STATUS_FR, TEAM_ABBR } from '../lib/tasks'
import type { SectionNode, TaskNode, TaskTree } from '../lib/tasks'
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
  return (
    <button type="button" onClick={() => openTask(task.id)} title={task.title}
      className={`relative -mt-px flex w-full flex-col gap-1.5 px-3 py-2.5 text-left first:mt-0 ${skin}`}>
      <div className="flex items-start gap-2">
        <span className="flex h-5 shrink-0 items-center">
          {state === 'locked'
            ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Verrouillée" />
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
          Prérequis manquants{missing.length ? ` (${missing.map((d) => `#${d}`).join(' ')})` : ''}
        </span>
      ) : state === 'available' ? (
        <span className="text-[11px] font-medium text-neutral-700">Disponible</span>
      ) : null}
      {subs && (
        <span className="font-mono text-[11px] text-neutral-500">{subs.done}/{subs.total} sous-tâches</span>
      )}
      {/* Jalon (#133) : le poids du verrou — combien de tâches ce diamant retient. */}
      {task.kind === 'milestone' && blocksCount > 0 && (
        <span className="text-[11px] text-neutral-500">bloque {blocksCount}</span>
      )}
      {/* Badge team (le QUI) — abrégé, coin bas droit de la carte. Même donnée
          = même rendu que le Backlog : Chip (design.md §2). */}
      <span className="absolute bottom-1.5 right-2"><Chip label={TEAM_ABBR[task.team]} /></span>
    </button>
  )
}

/**
 * Carte-GROUPE d'un epic dans une colonne de stage (#135) : repliée par défaut,
 * même gabarit qu'une TaskCard mais marquée groupe (chevron + carré EpicGlyph +
 * titre en font-medium). Dé-dup (#140-B) : un epic n'apparaît que dans UNE
 * colonne — son stage d'ancrage (epicAnchorStage : ticket non terminé le plus
 * amont, ou dernier ticket si 100 % done) — avec TOUS ses membres (« n ici »
 * si d'autres stages y contribuent) et sa complétion GLOBALE (epicProgress).
 * Le dépliage (persisté par slug) révèle les cartes membres, indentées.
 */
function EpicCardGroup({ item, tree, avail, blocksOf }: {
  item: Extract<EpicListItem, { type: 'epic' }>
  tree: TaskTree
  avail: Map<number, Availability>
  blocksOf: (t: TaskNode) => number
}) {
  const [open, setOpen] = usePersistentStringFlag('roadmap:epics', item.slug)
  const progress = epicProgress(tree, item.slug)
  const partial = item.tasks.length < progress.total
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="-mt-px first:mt-0">
      <Collapsible.Trigger
        title={item.title}
        className="relative flex w-full flex-col gap-1.5 border border-neutral-200 bg-white px-3 py-2.5 text-left hover:z-10 hover:border-neutral-400"
      >
        <div className="flex items-center gap-2">
          <Chevron />
          <EpicGlyph status={epicStatusOf(progress, item.tasks)} />
          <span className="min-w-0 truncate text-sm font-medium text-neutral-900">{item.title}</span>
        </div>
        <div className="flex items-center gap-1.5 pl-[26px]">
          <span className="text-[11px] text-neutral-500">
            {item.tasks.length} tâche{item.tasks.length === 1 ? '' : 's'}{partial ? ' ici' : ''}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span
              className="font-mono text-[11px] text-neutral-500"
              title={`Complétion globale de l'epic : ${progress.done}/${progress.total}`}
            >
              {progress.done}/{progress.total}
            </span>
            <span className="sr-only">, {progress.done} sur {progress.total} tâches terminées</span>
          </span>
        </div>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {/* Membres indentés d'un cran sous la carte-groupe (langage sous-tâches). */}
        <div className="-mt-px ml-3 flex flex-col">
          {item.tasks.map((t) => (
            <TaskCard key={t.id} task={t} state={avail.get(t.id) ?? 'available'} missing={missingPrereqs(t, avail)} blocksCount={blocksOf(t)} />
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/**
 * Chaque colonne est une sous-grille alignée sur les 4 rangées partagées du
 * conteneur (titre / note / barre / cartes) : les en-têtes prennent tous la
 * hauteur du plus grand et les barres de progression sont alignées entre
 * colonnes, quelle que soit la longueur des notes. Les rangées vides gardent
 * un placeholder pour ne pas décaler les suivantes.
 */
function Column({ section, items, avail, blocksOf, tree }: { section: SectionNode; items: EpicListItem[]; avail: Map<number, Availability>; blocksOf: (t: TaskNode) => number; tree: TaskTree }) {
  const { openSection } = usePanel()
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
      <div className="group sticky top-0 z-20 flex items-baseline justify-between gap-2 bg-neutral-50 pb-0.5 pt-8">
        <span
          className={`min-w-0 truncate text-sm font-semibold tracking-tight ${empty ? 'text-neutral-300' : 'text-neutral-900'}`}
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
            aria-label={`Éditer la section ${section.title}`}
            title="Éditer la section"
            onClick={() => openSection(section.key)}
            className="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <EditPen size={12} />
          </button>
          {statusFr && !empty && <Chip label={statusFr} />}
          {/* Compteur porteur de sens même à 0/0 : plancher neutral-500 (audit #108). */}
          <span className="font-mono text-xs text-neutral-500">{done}/{total}</span>
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
          pour que leur bordure ne soit pas mangée par la carte suivante.
          Epics (#135/#140-B) : les tâches à epic vivent dans une carte-groupe
          repliable — rendue UNIQUEMENT dans la colonne d'ancrage de l'epic
          (items calculés par RoadmapColumns), à la position de sa première
          membre locale. */}
      <div className="flex min-w-0 flex-col pt-1.5">
        {items.map((item) =>
          item.type === 'epic' ? (
            <EpicCardGroup key={`epic:${item.slug}`} item={item} tree={tree} avail={avail} blocksOf={blocksOf} />
          ) : (
            <TaskCard key={item.task.id} task={item.task} state={avail.get(item.task.id) ?? 'available'} missing={missingPrereqs(item.task, avail)} blocksCount={blocksOf(item.task)} />
          ),
        )}
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
  // « bloque N » des jalons : dépendants inverses, calculé une fois par carte jalon.
  const blocksOf = (t: TaskNode) => (t.kind === 'milestone' ? reverseDependents(tree, t.id).length : 0)

  // Ancrage unique des epics (#140-B) : un epic ne vit que dans UNE colonne —
  // le stage de son ticket non terminé le plus amont (ou de son dernier ticket
  // si tout est done). Membres collectés en ordre canonique (sections NN, puis
  // ordre de la colonne) — le dépliage montre TOUT l'epic, autres stages compris.
  const epics = allEpics(tree)
  const epicMembers = new Map<string, Array<{ stage: string; task: TaskNode }>>()
  for (const s of sections) {
    for (const t of s.tasks) {
      if (t.epic === null) continue
      const arr = epicMembers.get(t.epic)
      if (arr) arr.push({ stage: s.key, task: t })
      else epicMembers.set(t.epic, [{ stage: s.key, task: t }])
    }
  }
  const anchorOf = new Map<string, string>()
  for (const [slug, members] of epicMembers) {
    const anchor = epicAnchorStage(members)
    if (anchor !== null) anchorOf.set(slug, anchor)
  }
  // Membres affichés dans le groupe : tout l'epic, filtré par le toggle
  // « terminées » (la complétion affichée reste GLOBALE via epicProgress).
  const membersOf = (slug: string) =>
    (epicMembers.get(slug) ?? []).map((m) => m.task).filter((t) => showDone || t.status !== 'done')
  const itemsOf = (s: SectionNode) =>
    groupByEpicAnchored(visibleOf(s), epics, (slug) => anchorOf.get(slug) === s.key, membersOf)

  // Largeurs par colonne : un stage vide (ou vidé par le filtre) est resserré —
  // le chemin Idea→Mature reste entièrement visible sans voler l'espace.
  const template = sections.map((s) => (s.tasks.length === 0 ? '180px' : '280px')).join(' ')

  return (
    <div
      className="roadmap-cols-scroll grid h-full grid-flow-col grid-rows-[auto_auto_auto_1fr] gap-x-4 gap-y-1.5 overflow-x-auto px-6 pb-6"
      style={{ gridTemplateColumns: template }}
    >
      {sections.map((s) => <Column key={s.key} section={s} items={itemsOf(s)} avail={avail} blocksOf={blocksOf} tree={tree} />)}
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
    <span className="flex items-center gap-2" title={`Avancement global : ${done}/${total} tâches (${pct}%)`}>
      <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs text-neutral-500">{done}/{total} · {pct}%</span>
    </span>
  )
}
