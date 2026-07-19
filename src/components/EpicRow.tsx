import { useState } from 'react'
import { Collapsible } from '@base-ui/react/collapsible'
import { Chevron, EpicGlyph } from './glyphs'
import { TaskRow } from './TaskRow'
import { ErrorBanner, GhostInput, blurOnEnter } from './ui'
import { usePersistentStringFlag } from '../state/uiPersist'
import { useOptionalTreeState } from '../state/TreeContext'
import type { TaskNode, Epic } from '../lib/tasks'

/**
 * Epic-groupe (#135) : partout où des tâches sont listées, un epic s'affiche
 * comme une ligne-GROUPE repliée par défaut — chevron + carré (EpicGlyph) +
 * nombre de tâches + complétion done/total — qu'on déplie pour révéler ses
 * membres, indentés comme les sous-tâches d'une TaskRow. Les tâches sans epic
 * restent des lignes normales au même niveau. Remplace le toggle « par epic »
 * (#133, rendu à plat rejeté).
 *
 * Dé-duplication (#140) : un epic n'apparaît qu'UNE fois par vue — côté ouvert
 * tant qu'il n'est pas 100 % terminé (ses membres done vivent DANS le groupe),
 * côté « Terminées » seulement quand tout est bouclé (splitBacklogItems). En
 * Roadmap, plus AUCUN groupe en colonne (#235) : le transversal vit dans la
 * bande d'epics (EpicBand) — l'ancrage (epicAnchorStage/groupByEpicAnchored)
 * est mort avec elle.
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
 * Dé-dup du Backlog (#140-B) : un epic ne vit que d'UN côté.
 * - ≥ 1 tâche non-done (globalement, `isComplete`) → il vit côté OUVERT, avec
 *   TOUTES ses tâches dedans (les done du contexte y sont absorbées, rendues
 *   comme done dans le groupe) — jamais répété côté « Terminées ».
 * - 100 % done → il ne vit que côté « Terminées ».
 * Cas filtre : si un epic incomplet n'a QUE des done visibles (recherche/team),
 * son groupe est ajouté en fin de liste ouverte — jamais côté terminé.
 */
export function splitBacklogItems(
  open: TaskNode[],
  done: TaskNode[],
  epics: Epic[],
  isComplete: (slug: string) => boolean,
): { open: EpicListItem[]; done: EpicListItem[] } {
  const titleOf = new Map(epics.map((e) => [e.slug, e.title]))
  // Membres done des epics INCOMPLETS : à absorber côté ouvert.
  const doneOf = new Map<string, TaskNode[]>()
  for (const t of done) {
    if (t.epic === null || isComplete(t.epic)) continue
    const arr = doneOf.get(t.epic)
    if (arr) arr.push(t)
    else doneOf.set(t.epic, [t])
  }
  const openItems = groupByEpic(open, epics)
  for (const item of openItems) {
    if (item.type !== 'epic') continue
    const extra = doneOf.get(item.slug)
    if (extra) {
      item.tasks = [...item.tasks, ...extra]
      doneOf.delete(item.slug)
    }
  }
  // Epics incomplets sans membre ouvert VISIBLE (filtres) : groupe en queue.
  for (const [slug, tasks] of doneOf) {
    openItems.push({ type: 'epic', slug, title: titleOf.get(slug) ?? slug, tasks })
  }
  const doneItems = groupByEpic(done.filter((t) => t.epic === null || isComplete(t.epic)), epics)
  return { open: openItems, done: doneItems }
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

/** Accord singulier/pluriel élémentaire (anglais). */
const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`

/**
 * Titre d'epic ÉDITABLE (#140-A) : input ghost permanent (jamais de swap
 * lecture→input, décision Rémi) camouflé en texte — hover gris, focus bordure.
 * Au blur/Entrée, si le titre a changé, upsert {slug, title} dans _epics.yaml
 * via PUT /api/epics (réécriture complète : les déclarés existants + celui-ci) —
 * un epic découvert (titre = slug) qu'on renomme devient déclaré. Le slug
 * (identité portée par les tâches) ne change JAMAIS ici. Non contrôlé
 * (defaultValue) : le reload remonte l'input via key={title} au niveau parent.
 */
function EpicTitleInput({ slug, title, onError, done = false }: {
  slug: string
  title: string
  onError: (msg: string | null) => void
  /** Epic 100 % terminé → titre barré + grisé (#151). */
  done?: boolean
}) {
  const treeState = useOptionalTreeState()
  // Largeur au contenu (ch) : le nom seul est la zone d'édition, le reste de
  // la ligne reste le trigger du dépliage.
  const [len, setLen] = useState(title.length)
  const [busy, setBusy] = useState(false)

  const save = async (el: HTMLInputElement) => {
    const next = el.value.trim()
    const revert = () => { el.value = title; setLen(title.length) }
    if (next === '' ) { revert(); return }
    if (next === title || treeState === null) return
    setBusy(true)
    onError(null)
    try {
      const declared = treeState.tree?.epics ?? []
      const upserted = declared.some((e) => e.slug === slug)
        ? declared.map((e) => (e.slug === slug ? { slug, title: next } : e))
        : [...declared, { slug, title: next }]
      const r = await fetch('/api/epics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epics: upserted }),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) await treeState.reload()
      else { revert(); onError((data.errors ?? ['Unknown error.']).join(' · ')) }
    } catch {
      revert()
      onError('Network error — the epic name was not saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    // relative : peint AU-DESSUS du trigger plein-rang (positionné) — le clic
    // sur le nom édite, le clic partout ailleurs déplie.
    <span className="relative min-w-0" style={{ width: `calc(${Math.max(len, 2)}ch + 1.25rem)` }}>
      <GhostInput
        key={title}
        defaultValue={title}
        aria-label={`Rename epic ${slug}`}
        title="Rename the epic (the slug does not change)"
        disabled={busy}
        onChange={(e) => setLen(e.target.value.length)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.currentTarget.value = title; setLen(title.length); e.currentTarget.blur(); return }
          blurOnEnter(e)
        }}
        onBlur={(e) => void save(e.currentTarget)}
        // `text-neutral-500!` (important) : ghostCls impose `text-neutral-900` en
        // base — sans le forcer, le titre d'epic terminé reste barré mais en encre
        // foncée, pas gris comme une task done (#209).
        className={`truncate py-0.5 text-sm font-medium ${done ? 'text-neutral-500! line-through' : ''}`}
      />
    </span>
  )
}

/**
 * Ligne-groupe d'un epic dans une liste de type Backlog. Anatomie d'une
 * TaskRow (px-4, text-sm, hover neutral-50) mais lue UN CRAN parente :
 * chevron TOUJOURS présent, carré EpicGlyph, titre en font-medium, compte de
 * tâches, complétion done/total en mono (registre du badge sous-tâches).
 * Le trigger (aria-expanded via Base UI) est un calque plein-rang : toute la
 * ligne déplie SAUF le nom, input ghost posé au-dessus qui renomme (#140-A).
 * Repliée par défaut, l'ouverture est persistée par slug (`persistKey`).
 * La ligne est `relative` : ancre du trigger ET des spans absolus (sr-only) —
 * sans ça ils s'échappent du scroller et gonflent le scroll de la page (#141).
 */
export function EpicRow({ slug, title, tasks, progress, persistKey, forceOpen = false }: {
  slug: string
  title: string
  /** Membres à rendre dans CE contexte de liste (peut être un sous-ensemble de l'epic). */
  tasks: TaskNode[]
  /** Complétion GLOBALE de l'epic (epicProgress) — pas celle du sous-ensemble local. */
  progress: { done: number; total: number }
  persistKey: string
  /**
   * Force le dépliage sans toucher à la préférence persistée (#348) : en
   * recherche/filtre, les membres matchés vivent DANS le groupe — replié, ils
   * sont DÉMONTÉS (Collapsible Base UI) et la recherche « ne retourne rien ».
   * On ouvre donc le groupe le temps du filtre ; l'état persisté reprend la main
   * dès qu'il est levé.
   */
  forceOpen?: boolean
}) {
  const [persistedOpen, setOpen] = usePersistentStringFlag(persistKey, slug)
  const open = forceOpen || persistedOpen
  const [renameError, setRenameError] = useState<string | null>(null)
  const partial = tasks.length < progress.total
  // Compte LOCAL (ce que ce dépliage révèle) — « ici » quand l'epic a aussi des
  // tâches ailleurs (autre liste, autre stage).
  const countLabel = `${plural(tasks.length, 'task')}${partial ? ' here' : ''}`
  // Epic 100 % terminé (#151) : titre barré + grisé comme une tâche done, sinon
  // confusion visuelle avec les epics à faire / en cours.
  const status = epicStatusOf(progress, tasks)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      {/* data-panel-open reproduit l'attribut Base UI (posé sur le trigger) sur
          la LIGNE pour que la rotation .chev (index.css) s'applique — le
          chevron ne vit plus dans le trigger. */}
      <div
        data-panel-open={open ? '' : undefined}
        className="relative flex w-full items-center gap-2 px-4 py-1.5 text-sm hover:bg-neutral-50"
      >
        <Collapsible.Trigger
          aria-label={`${title} — ${countLabel}, ${progress.done} of ${progress.total} tasks done`}
          className="absolute inset-0 h-full w-full"
        />
        <Chevron />
        {/* pointer-events-none : décoration posée SUR le calque-trigger — sans ça,
            cliquer pile dessus n'atteint pas le trigger (même cause que #252). */}
        <span className="pointer-events-none flex shrink-0"><EpicGlyph status={status} /></span>
        <EpicTitleInput slug={slug} title={title} onError={setRenameError} done={status === 'done'} />
        {/* aria-hidden : la même info vit dans le nom accessible du trigger. */}
        <span aria-hidden className="pointer-events-none shrink-0 text-[11px] text-neutral-500">{countLabel}</span>
        <span aria-hidden className="pointer-events-none ml-auto flex shrink-0 items-center gap-1.5">
          <EpicProgressBar done={progress.done} total={progress.total} />
          <span
            className="font-mono text-[11px] text-neutral-500"
            title={`Epic overall completion: ${progress.done}/${progress.total}`}
          >
            {progress.done}/{progress.total}
          </span>
        </span>
      </div>
      {renameError && (
        <div className="px-4 py-1.5">
          <ErrorBanner errors={[renameError]} />
        </div>
      )}
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
