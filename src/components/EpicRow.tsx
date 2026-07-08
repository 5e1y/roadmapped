import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron, EpicGlyph } from './glyphs'
import { TaskRow } from './TaskRow'
import { usePersistentStringFlag } from '../state/uiPersist'
import type { TaskNode, Epic } from '../lib/tasks'

/**
 * Epic-groupe (#135) : partout où des tâches sont listées, un epic s'affiche
 * comme une ligne-GROUPE repliée par défaut — chevron + carré (EpicGlyph) +
 * nombre de tâches + complétion done/total — qu'on déplie pour révéler ses
 * membres, indentés comme les sous-tâches d'une TaskRow. Les tâches sans epic
 * restent des lignes normales au même niveau. Remplace le toggle « par epic »
 * (#133, rendu à plat rejeté).
 */

/** Item d'une liste mixte : tâche à plat OU groupe-epic portant ses membres. */
export type EpicListItem =
  | { type: 'task'; task: TaskNode }
  | { type: 'epic'; slug: string; title: string; tasks: TaskNode[] }

/**
 * Regroupe une liste ORDONNÉE de tâches : la PREMIÈRE tâche membre ancre la
 * position de son epic dans la liste (l'ordre de tri de l'appelant reste la
 * vérité), les suivantes le rejoignent, les tâches sans epic restent à plat.
 * Titres lisibles via `allEpics` (déclarés d'abord, sinon slug).
 */
export function groupByEpic(tasks: TaskNode[], epics: Epic[]): EpicListItem[] {
  const titleOf = new Map(epics.map((e) => [e.slug, e.title]))
  const bySlug = new Map<string, Extract<EpicListItem, { type: 'epic' }>>()
  const items: EpicListItem[] = []
  for (const t of tasks) {
    if (t.epic === null) {
      items.push({ type: 'task', task: t })
      continue
    }
    const existing = bySlug.get(t.epic)
    if (existing) {
      existing.tasks.push(t)
    } else {
      const item: Extract<EpicListItem, { type: 'epic' }> = {
        type: 'epic', slug: t.epic, title: titleOf.get(t.epic) ?? t.epic, tasks: [t],
      }
      bySlug.set(t.epic, item)
      items.push(item)
    }
  }
  return items
}

/**
 * État d'encre du groupe, même langage que StatusGlyph : plein = tout terminé,
 * demi accent = entamé (au moins une done OU une membre in_progress), vide sinon.
 * La progression est GLOBALE (epicProgress) même si la liste locale est partielle.
 */
export function epicStatusOf(progress: { done: number; total: number }, tasks: TaskNode[]): TaskNode['status'] {
  if (progress.total > 0 && progress.done === progress.total) return 'done'
  if (progress.done > 0 || tasks.some((t) => t.status === 'in_progress')) return 'in_progress'
  return 'todo'
}

/** Accord singulier/pluriel élémentaire (français). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

/**
 * Ligne-groupe d'un epic dans une liste de type Backlog. Anatomie d'une
 * TaskRow (px-4, text-sm, hover neutral-50) mais lue UN CRAN parente :
 * chevron TOUJOURS présent, carré EpicGlyph, titre en font-medium, compte de
 * tâches, complétion done/total en mono (registre du badge sous-tâches).
 * Toute la ligne est LE trigger (aria-expanded via Base UI) ; repliée par
 * défaut, l'ouverture est persistée par slug (`persistKey`).
 */
export function EpicRow({ slug, title, tasks, progress, persistKey }: {
  slug: string
  title: string
  /** Membres à rendre dans CE contexte de liste (peut être un sous-ensemble de l'epic). */
  tasks: TaskNode[]
  /** Complétion GLOBALE de l'epic (epicProgress) — pas celle du sous-ensemble local. */
  progress: { done: number; total: number }
  persistKey: string
}) {
  const [open, setOpen] = usePersistentStringFlag(persistKey, slug)
  const partial = tasks.length < progress.total
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-neutral-50"
        title={title}
      >
        <Chevron />
        <EpicGlyph status={epicStatusOf(progress, tasks)} />
        <span className="min-w-0 truncate font-medium text-neutral-900">{title}</span>
        {/* Compte LOCAL (ce que ce dépliage révèle) — « ici » quand l'epic a
            aussi des tâches ailleurs (autre liste, autre stage). */}
        <span className="shrink-0 text-[11px] text-neutral-500">
          {plural(tasks.length, 'tâche')}{partial ? ' ici' : ''}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <EpicProgressBar done={progress.done} total={progress.total} />
          <span
            className="font-mono text-[11px] text-neutral-500"
            title={`Complétion globale de l'epic : ${progress.done}/${progress.total}`}
          >
            {progress.done}/{progress.total}
          </span>
          <span className="sr-only">, {progress.done} sur {progress.total} tâches terminées</span>
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        {/* Même langage d'imbrication que les sous-tâches d'une TaskRow. */}
        <div className="ml-9 divide-y divide-neutral-100 border-l border-neutral-200">
          {tasks.map((t) => <TaskRow key={t.id} task={t} />)}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/** Barre de complétion miniature du groupe — même registre que les barres de colonne. */
export function EpicProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-neutral-200">
      <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
    </span>
  )
}
