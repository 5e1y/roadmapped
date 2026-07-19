import { useLayoutEffect, useRef, useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { TaskRow } from './TaskRow'
import { EpicRow, splitBacklogItems, type EpicListItem } from './EpicRow'
import { Chevron } from './glyphs'
import { allEpics, epicProgress } from '../lib/roadmap'
import { type TaskNode, type TaskTree } from '../lib/tasks'
import { groupByRelease, compareReleasesDesc, PRE_RELEASE } from '../lib/release'

const PREVIEW = 12

/** Clé stable d'un item de liste mixte (epic-groupe ou tâche à plat). */
const keyOf = (i: EpicListItem) => (i.type === 'epic' ? `epic:${i.slug}` : `task:${i.task.id}`)

/** Rend un item de liste mixte : ligne-epic repliable ou TaskRow à plat (#135). */
function ListItemRow({ item, tree, filtered = false }: { item: EpicListItem; tree: TaskTree; filtered?: boolean }) {
  return item.type === 'epic' ? (
    <EpicRow
      slug={item.slug}
      title={item.title}
      tasks={item.tasks}
      progress={epicProgress(tree, item.slug)}
      persistKey="backlog:epics"
      // #348 : en recherche/filtre, déplier le groupe pour que les membres
      // matchés (sinon démontés, repliés) soient visibles.
      forceOpen={filtered}
    />
  ) : (
    <TaskRow task={item.task} />
  )
}

/**
 * Release d'un item terminé (#342). Une tâche à plat porte sa propre release ;
 * un epic-groupe (100 % done) est rattaché à sa release la plus RÉCENTE (code
 * défensif si ses membres en mêlent plusieurs), pour rester d'un seul tenant
 * sous un accordéon. `null`/absente → 'pre-release' (via groupByRelease).
 */
function releaseOfItem(item: EpicListItem): string | null {
  if (item.type === 'task') return item.task.release
  let best: string | null = null
  for (const t of item.tasks) {
    const r = t.release ?? PRE_RELEASE
    if (best === null || compareReleasesDesc(r, best) < 0) best = r
  }
  return best
}

/** Nombre de tâches terminées d'un groupe de release (un epic-groupe = N tâches). */
const countTasks = (items: EpicListItem[]) =>
  items.reduce((n, i) => n + (i.type === 'epic' ? i.tasks.length : 1), 0)

/**
 * Accordéon d'une release dans la colonne « Terminées » (#342). Même mécanique
 * de pliage que l'EpicRow (Collapsible Base UI + calque-trigger plein-rang,
 * `data-panel-open` sur la ligne pour la rotation `.chev`), mais l'état
 * d'ouverture est de SESSION (useState, pas persisté) : la plus récente ouverte
 * par défaut, le reste replié — un coup d'œil d'historique, pas une préférence.
 */
function ReleaseSection({ release, items, tree, defaultOpen, filtered = false }: {
  release: string
  items: EpicListItem[]
  tree: TaskTree
  defaultOpen: boolean
  /** #348 : en recherche/filtre, forcer l'ouverture — un match dans un accordéon
      replié (démonté) ferait « aucun résultat ». L'état de session reprend la main après. */
  filtered?: boolean
}) {
  const [sessionOpen, setSessionOpen] = useState(defaultOpen)
  const open = filtered || sessionOpen
  const setOpen = setSessionOpen
  const count = countTasks(items)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <div
        data-panel-open={open ? '' : undefined}
        className="relative flex w-full items-center gap-2 px-4 py-1.5 text-sm hover:bg-neutral-50"
      >
        <Collapsible.Trigger
          aria-label={`Release ${release} — ${count} done`}
          className="absolute inset-0 h-full w-full"
        />
        <Chevron />
        <span className="pointer-events-none min-w-0 truncate font-medium text-neutral-700">{release}</span>
        <span aria-hidden className="pointer-events-none ml-auto shrink-0 font-mono text-[11px] text-neutral-500">
          {count}
        </span>
      </div>
      <Collapsible.Panel>
        <div className="divide-y divide-neutral-100 border-t border-neutral-100">
          {items.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} filtered={filtered} />)}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
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
  // #385 — « Show more/less » se démonte au clic (le bouton cliqué disparaît, son
  // jumeau le remplace) : focus perdu sur <body> (design.md §3.4). On replace le
  // focus sur le bouton jumeau après la bascule, jamais au montage initial.
  const toggleRef = useRef<HTMLButtonElement>(null)
  const refocusToggle = useRef(false)
  const toggleShowAll = (next: boolean) => { refocusToggle.current = true; setShowAll(next) }
  useLayoutEffect(() => {
    if (refocusToggle.current) { refocusToggle.current = false; toggleRef.current?.focus() }
  }, [showAll])
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
  // Terminées pliées par RELEASE (#342) : accordéons « 0.2.3 (12) », la plus
  // récente ouverte, le reste replié. doneItems est déjà trié par recency —
  // groupByRelease préserve cet ordre DANS chaque groupe.
  const releaseGroups = groupByRelease(doneItems, releaseOfItem)
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
        {/* Garde sur openItems, pas open (#348) : un epic INCOMPLET dont seuls des
            membres DONE sont visibles (recherche/filtre) est absorbé côté ouvert
            comme groupe — `open` (tâches brutes) est alors vide alors qu'il y a
            bien un item à rendre. Garder open.length faisait « Nothing open »
            malgré un match. */}
        {openItems.length === 0 ? empty('Nothing open') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {visible.map((i) => <ListItemRow key={keyOf(i)} item={i} tree={tree} filtered={filtered} />)}
            {hidden > 0 && (
              <button
                ref={toggleRef}
                type="button"
                onClick={() => toggleShowAll(true)}
                className="w-full px-4 py-2.5 text-center text-xs text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
              >
                Show {hidden} more
              </button>
            )}
            {showAll && openItems.length > PREVIEW && (
              <button
                ref={toggleRef}
                type="button"
                onClick={() => toggleShowAll(false)}
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
        {/* Garde sur doneItems (#348) : cohérent avec la colonne ouverte — seuls
            les done d'epics COMPLETS y vivent, `done` brut peut en contenir qui
            partent côté ouvert (epic incomplet). */}
        {doneItems.length === 0 ? empty('Nothing done yet') : (
          <div className="divide-y divide-neutral-100 border border-neutral-200 bg-white">
            {releaseGroups.map((g, idx) => (
              <ReleaseSection key={g.release} release={g.release} items={g.items} tree={tree} defaultOpen={idx === 0} filtered={filtered} />
            ))}
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
