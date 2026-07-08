import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { Toast } from '@base-ui/react/toast'
import { Cross, LockLocked } from 'trinil-react'
import { Collapsible } from '@base-ui/react/collapsible'
import { useTree } from '../state/TreeContext'
import { usePanel } from '../state/PanelContext'
import { agentBrief } from './TaskRow'
import { findTaskInTree } from '../lib/findTaskInTree'
import { reverseDependents, depState, activeTasks, computeAvailability, allEpics, slugify } from '../lib/roadmap'
import { KindGlyph } from './glyphs'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import { Chip } from './Chip'
import {
  ErrorBanner, Select, TextInput, AutoTextArea, GhostInput, GhostAutoTextArea,
  AddCombobox, TagsCombobox, EpicCombobox, ToastViewport, blurOnEnter,
  SavedTick, FieldError, primaryBtn, actionBtn, type SelectItem,
} from './ui'
import { Markdown } from './Markdown'
import { TEAMS, TEAM_ABBR } from '../lib/tasks'
import { OPEN_DOC_EVENT } from '../lib/events'
import type { TaskNode, TaskTree } from '../lib/tasks'

/**
 * Panneau de tâche v2 « lecture d'abord » (spec docs/specs/2026-07-07-task-panel.md)
 * revu en GHOST INPUTS (décision Rémi 2026-07-07, cf. ghostCls dans ui.tsx) :
 * tout élément éditable est un input MONTÉ EN PERMANENCE, camouflé en lecture —
 * jamais de swap qui rétrécit, jamais d'étape crayon. Blur/Entrée sauvegarde,
 * ✓ fugace sur la zone, erreur de validation SOUS la zone, Toast réseau.
 * Exception assumée : le DÉTAIL reste rendu en markdown au repos (un long
 * detail brut serait illisible) — le clic bascule en textarea À TAILLE
 * IDENTIQUE (hauteur mesurée sur le rendu), aucun rétrécissement.
 */

const STATUS_FR: Record<TaskNode['status'], string> = {
  todo: 'à faire', in_progress: 'en cours', done: 'faite',
}
const DEP_STATE_FR = {
  done: 'faite', available: 'disponible', locked: 'verrouillée',
} as const

// Choisir « faite » dans ce Select n'écrit jamais directement : il ouvre le
// mini-formulaire « Terminer… » (done guidé, outcome requis). Aucun chemin UI
// ne mène à done sans outcome. Les retours en arrière restent des PATCH directs.
const STATUS_ITEMS: SelectItem[] = [
  { value: 'todo', label: 'à faire' },
  { value: 'in_progress', label: 'en cours' },
  { value: 'done', label: 'faite' },
]
// '' = aucune (null). Enum réel validate.ts : S/M/L/null.
const SIZE_ITEMS: SelectItem[] = [
  { value: '', label: '—' },
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
]
const TEAM_ITEMS: SelectItem[] = TEAMS.map((t) => ({ value: t, label: t }))

/** Deux valeurs (potentiellement listes) diffèrent-elles ? Comparaison structurelle, null-safe. */
const changed = (a: unknown, b: unknown) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)

/**
 * Offset dans la SOURCE markdown correspondant à un clic dans le texte RENDU :
 * (1) point de clic → position de caret dans le DOM rendu (caretRangeFromPoint,
 * ou caretPositionFromPoint sur Firefox) ; (2) texte rendu avant ce caret ;
 * (3) retrouver dans la source brute le plus long suffixe de ce texte (le rendu
 * omet la syntaxe **…**, `-`, `#` — un suffixe court finit toujours par matcher).
 * null si introuvable (l'appelant garde alors le comportement par défaut).
 */
function caretOffsetFromClick(container: HTMLElement, x: number, y: number, raw: string): number | null {
  let node: Node | null = null
  let offset = 0
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    if (r) { node = r.startContainer; offset = r.startOffset }
  } else if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) { node = p.offsetNode; offset = p.offset }
  }
  if (!node || !container.contains(node)) return null
  const range = document.createRange()
  range.setStart(container, 0)
  range.setEnd(node, offset)
  const before = range.toString()
  if (before.length === 0) return 0
  for (let len = Math.min(60, before.length); len >= 3; len--) {
    const needle = before.slice(-len)
    const idx = raw.indexOf(needle)
    if (idx >= 0) return idx + needle.length
  }
  return null
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-1.5 text-[11px] font-medium text-neutral-500">{children}</div>
}

/**
 * Item de relation AVEC APERÇU (#125) pour les combobox « dépend de » / « bloque » /
 * liens : #id, titre, statut (glyphe), stage (dérivé du dossier du fichier YAML)
 * et team abrégée. `label` reste le texte de recherche du filtre intégré
 * Base UI ; `preview` porte le rendu riche (RelOption, ui.tsx).
 */
export function relItemOf(t: TaskNode): SelectItem {
  // "docs/tasks/04-build/…" → [2].
  const dir = t.file.split('/')[2] ?? ''
  return {
    value: String(t.id),
    label: `#${t.id} ${t.title}`,
    preview: {
      id: t.id,
      title: t.title,
      status: t.status,
      kind: t.kind,
      team: TEAM_ABBR[t.team] ?? (t.team ? String(t.team) : ''),
      stage: dir.replace(/^\d+-/, ''),
    },
  }
}

/** ✕ discret, révélé au survol de sa ligne (retrait d'une dépendance, d'un lien, d'une ref). */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="shrink-0 rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-200 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Cross size={9} />
    </button>
  )
}

/** Ligne d'une tâche liée : navigable (pile) + ✕ de retrait au survol si éditable. */
function RelationRow({ tree, id, badge, onRemove }: {
  tree: TaskTree
  id: number
  badge?: string
  onRemove?: () => void
}) {
  const { openTask } = usePanel()
  const t = findTaskInTree(tree, id)
  if (!t) {
    // Ne devrait pas arriver (deps validées) — on reste lisible plutôt que de planter.
    return <div className="px-1.5 py-1 font-mono text-xs text-neutral-500">#{id}</div>
  }
  return (
    <div className="group flex items-center">
      <button
        type="button"
        onClick={() => openTask(id)}
        className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left text-sm hover:bg-neutral-100"
      >
        <KindGlyph task={t} />
        <span className="shrink-0 font-mono text-xs text-neutral-500">#{t.id}</span>
        <span
          title={t.title}
          className={`min-w-0 truncate ${t.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}
        >
          {t.title}
        </span>
        {badge && <span className="ml-auto shrink-0 text-[11px] text-neutral-500">{badge}</span>}
      </button>
      {onRemove && <RemoveButton label={`Retirer #${id}`} onClick={onRemove} />}
    </div>
  )
}

/** Liste de relations LECTURE SEULE (Bloque, Sous-tâches) — masquée si vide. */
function RelationList({ label, tree, ids, badgeOf }: {
  label: string
  tree: TaskTree
  ids: number[]
  badgeOf?: (id: number) => string
}) {
  if (ids.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-col">
        {ids.map((id) => (
          <RelationRow key={id} tree={tree} id={id} badge={badgeOf?.(id)} />
        ))}
      </div>
    </div>
  )
}

/** Une ref = une ligne : naviguer vers la Vue Docs si c'est un doc, ✕ au survol. */
function RefLine({ refPath, onRemove }: { refPath: string; onRemove?: () => void }) {
  const { close } = usePanel()
  const isDoc = refPath.startsWith('docs/') && refPath.endsWith('.md')
  return (
    <div className="group flex items-center">
      {isDoc ? (
        <button
          type="button"
          title={refPath}
          onClick={() => {
            // L'état vue/doc vit dans App (événement documenté là-bas). docPath est
            // relatif à docsDir — on retire le préfixe docs/ de la ref repo-relative.
            window.dispatchEvent(new CustomEvent(OPEN_DOC_EVENT, { detail: refPath.replace(/^docs\//, '') }))
            close()
          }}
          className="min-w-0 flex-1 truncate px-1.5 py-0.5 text-left font-mono text-xs text-neutral-800 underline decoration-neutral-500 underline-offset-2 hover:decoration-neutral-800"
        >
          {refPath}
        </button>
      ) : (
        <div className="min-w-0 flex-1 truncate px-1.5 py-0.5 font-mono text-xs text-neutral-600" title={refPath}>{refPath}</div>
      )}
      {onRemove && <RemoveButton label={`Retirer ${refPath}`} onClick={onRemove} />}
    </div>
  )
}

/**
 * Mini-formulaire du done guidé (#27, spec §Structure 2). outcome REQUIS (le
 * bouton « Done ✓ » est disabled tant qu'il est vide) ; vérification, commit,
 * release optionnels → un SEUL PATCH {status:'done', …}. État local isolé :
 * démonté à la fermeture, il repart propre à la prochaine ouverture.
 */
function DoneForm({ task, busy, onCancel, onSubmit }: {
  task: TaskNode
  busy: boolean
  onCancel: () => void
  onSubmit: (fields: { outcome: string; verification: string | null; commit: string | null; release: string | null }) => void
}) {
  const [outcome, setOutcome] = useState(task.outcome ?? '')
  const [verification, setVerification] = useState(task.verification ?? '')
  const [commit, setCommit] = useState(task.commit ?? '')
  const [release, setRelease] = useState(task.release ?? '')
  const canDone = outcome.trim().length > 0 && !busy

  return (
    <div className="mt-2 flex flex-col gap-2.5 border border-neutral-200 bg-neutral-50 p-3">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-neutral-500">Outcome — ce qui a été livré (requis)</span>
        <AutoTextArea
          autoFocus
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="Une phrase orientée utilisateur, matière à changelog."
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-neutral-500">Vérification (optionnel)</span>
        <TextInput value={verification} onChange={(e) => setVerification(e.target.value)} placeholder="Comment l'artefact a été vérifié." />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-neutral-500">Commit (optionnel)</span>
          <TextInput value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="sha" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-neutral-500">Release (optionnel)</span>
          <TextInput value={release} onChange={(e) => setRelease(e.target.value)} placeholder="v0.1.0" />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canDone}
          onClick={() => onSubmit({
            outcome: outcome.trim(),
            verification: verification.trim() || null,
            commit: commit.trim() || null,
            release: release.trim() || null,
          })}
          className={primaryBtn}
        >
          {busy ? 'Enregistrement…' : 'Done ✓'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={actionBtn}>Annuler</button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- panneau

export function TaskPanel({ id }: { id: number }) {
  // Toast monté LOCALEMENT au panneau (spec §Feedback : erreurs réseau seulement,
  // composant Base UI, pas un div maison). Le corps émet via Toast.useToastManager.
  return (
    <Toast.Provider>
      <TaskPanelBody id={id} />
      <ToastViewport />
    </Toast.Provider>
  )
}

function TaskPanelBody({ id }: { id: number }) {
  const { tree, reload } = useTree()
  const { close } = usePanel()
  const toast = Toast.useToastManager()

  // Erreurs / ✓ suivis PAR zone.
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [savedField, setSavedField] = useState<string | null>(null)
  const [actionErrors, setActionErrors] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [doneOpen, setDoneOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Seule exception au « tout est input » : le détail (markdown rendu au repos).
  const [detailEditing, setDetailEditing] = useState(false)
  const detailReadRef = useRef<HTMLDivElement>(null)
  const detailMinHeight = useRef<number>(0)
  /** Position de caret à poser dans la textarea au focus (mappée depuis le clic). */
  const detailCaret = useRef<number | null>(null)
  // Conteneurs des listes supprimables (deps/liens/refs) : cibles de refocus
  // après le retrait d'une ligne (design.md §3.4 — focus jamais abandonné).
  const depsListRef = useRef<HTMLDivElement>(null)
  const linksListRef = useRef<HTMLDivElement>(null)
  const refsListRef = useRef<HTMLDivElement>(null)

  const task = tree ? findTaskInTree(tree, id) : null
  if (!tree || !task) return <p className="text-sm text-neutral-500">Tâche introuvable (rechargez).</p>

  // Même source d'état que la Roadmap : computeAvailability (aucun recalcul
  // maison). 'locked' = prérequis non faits → cadenas au lieu du glyphe.
  const locked = computeAvailability(tree).get(id) === 'locked'
  const blocks = reverseDependents(tree, id).map((t) => t.id)
  const depBadge = (depId: number) => DEP_STATE_FR[depState(tree, depId)]
  const subBadge = (subId: number) => {
    const sub = task.subtasks.find((s) => s.id === subId)
    return sub ? STATUS_FR[sub.status] : ''
  }
  // Vocabulaire de tags du projet — suggestions du Creatable.
  const allTags = [...new Set(activeTasks(tree).flatMap((t) => t.tags))]
  // Epics du projet (déclarés + auto-découverts) — suggestions du champ Epic (#133).
  const epicSlugs = allEpics(tree).map((e) => e.slug)
  // Tâches proposables en relation (soi-même exclu), moins celles déjà liées
  // (l'AddCombobox ne fait qu'AJOUTER). Items avec aperçu (#125) : glyphe,
  // #id, titre, stage, team — relItemOf. Les OUVERTES d'abord (candidates
  // naturelles), les faites ensuite.
  const relItems = (already: number[]): SelectItem[] => {
    const pool = activeTasks(tree)
      .filter((t) => t.id !== id && !already.includes(t.id))
    return [...pool.filter((t) => t.status !== 'done'), ...pool.filter((t) => t.status === 'done')]
      .map(relItemOf)
  }

  // --------------------------------------------------------------- sauvegarde
  const flash = (field: string) => {
    setSavedField(field)
    window.setTimeout(() => setSavedField((s) => (s === field ? null : s)), 1500)
  }
  const setErr = (field: string, errs: string[]) => setErrors((p) => ({ ...p, [field]: errs }))
  const clearErr = (field: string) =>
    setErrors((p) => { const n = { ...p }; delete n[field]; return n })
  const savedIn = (...fields: string[]) => savedField !== null && fields.includes(savedField)

  /** PATCH d'une zone : ✓ au succès, erreur de validation sous la zone, Toast réseau. */
  const save = async (field: string, isChanged: boolean, patch: Record<string, unknown>): Promise<boolean> => {
    if (!isChanged) { clearErr(field); return true }
    try {
      const r = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { clearErr(field); flash(field); await reload(); return true }
      setErr(field, data.errors ?? ['Erreur inconnue.'])
      return false
    } catch {
      // Erreur RÉSEAU uniquement → Toast (spec §Feedback), la saisie reste en place.
      toast.add({ title: 'Erreur réseau', description: 'La modification n’a pas été enregistrée.', priority: 'high' })
      return false
    }
  }

  /**
   * Retrait d'une ligne supprimable : après le PATCH, la ligne (et son ✕
   * potentiellement focalisé) a disparu au reload — le focus est REPLACÉ sur
   * le conteneur de la liste (audit #107). rAF : on attend le commit React ;
   * si l'utilisateur a déjà focalisé autre chose (clic souris), on ne vole rien.
   */
  const removeAndRefocus = (field: string, patch: Record<string, unknown>, listRef: RefObject<HTMLDivElement | null>) =>
    void save(field, true, patch).then((ok) => {
      if (!ok) return
      requestAnimationFrame(() => {
        const el = document.activeElement
        if ((el === document.body || !(el instanceof HTMLElement) || !el.isConnected) && listRef.current?.isConnected) {
          listRef.current.focus()
        }
      })
    })

  // --------------------------------------------------------------- actions cycle de vie
  const runAction = async (
    url: string, init: RequestInit, netMsg: string, closeOnSuccess: boolean,
  ): Promise<boolean> => {
    if (pending) return false
    setPending(true)
    setActionErrors([])
    try {
      const r = await fetch(url, init)
      const data = (await r.json()) as { ok: boolean; errors?: string[] }
      if (data.ok) { await reload(); if (closeOnSuccess) close(); return true }
      setActionErrors(data.errors ?? ['Erreur inconnue.'])
      return false
    } catch {
      toast.add({ title: 'Erreur réseau', description: netMsg, priority: 'high' })
      return false
    } finally {
      setPending(false)
    }
  }
  const patchInit = (body: Record<string, unknown>): RequestInit => ({
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const start = () => void runAction(`/api/tasks/${id}`, patchInit({ status: 'in_progress' }), 'La tâche n’a pas pu être démarrée.', false)
  const finishDone = async (fields: { outcome: string; verification: string | null; commit: string | null; release: string | null }) => {
    const ok = await runAction(`/api/tasks/${id}`, patchInit({ status: 'done', ...fields }), 'La tâche n’a pas pu être terminée.', false)
    if (ok) setDoneOpen(false)
  }
  const remove = () => {
    if (!window.confirm(`Supprimer définitivement la tâche #${id} ? (l'id ne sera jamais réutilisé)`)) return
    void runAction(`/api/tasks/${id}`, { method: 'DELETE' }, 'La tâche n’a pas été supprimée.', true)
  }

  const openDetailEditor = (click?: { x: number; y: number }) => {
    // Le passage en édition se fait À TAILLE IDENTIQUE : la textarea reprend la
    // hauteur du markdown rendu — rien ne rétrécit, aucun repère perdu.
    detailMinHeight.current = detailReadRef.current?.offsetHeight ?? 0
    // Le curseur se pose LÀ OÙ on a cliqué (mappé rendu → source markdown) ;
    // ouverture au clavier (Entrée) → début du texte.
    detailCaret.current = click && task.detail && detailReadRef.current
      ? caretOffsetFromClick(detailReadRef.current, click.x, click.y, task.detail)
      : 0
    setDetailEditing(true)
  }

  const titleCls = task.status === 'done' ? 'text-neutral-500 line-through' : 'text-neutral-900'

  return (
    <div className="flex min-h-full flex-col gap-5">
      <ErrorBanner errors={actionErrors} />

      {/* En-tête : glyphe + id + statut (ghost select permanent). */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          {locked
            ? <LockLocked size={11} className="shrink-0 text-neutral-500" ariaLabel="Verrouillée" />
            : <KindGlyph task={task} />}
          <span className="font-mono text-xs text-neutral-500">#{task.id}</span>
          <div className="w-32">
            <Select
              ghost
              aria-label="Statut"
              defaultValue={task.status}
              items={STATUS_ITEMS}
              onValueChange={(v) => {
                // Verrou done guidé : « faite » ouvre le mini-formulaire, jamais
                // de PATCH direct vers done. (Le Select non contrôlé affiche déjà
                // « faite » — le reload post-done confirme, Annuler remonte le panneau.)
                if (v === 'done') setDoneOpen(true)
                else void save('status', changed(task.status, v), { status: v })
              }}
            />
          </div>
          {/* Jalon (#133) : « bloque N » = dépendants inverses — le poids du verrou, visible. */}
          {task.kind === 'milestone' && blocks.length > 0 && (
            <Chip label={`bloque ${blocks.length}`} />
          )}
          <SavedTick show={savedIn('status')} />
        </div>
        <FieldError errs={errors.status} />

        {/* Titre : textarea ghost permanente, même typo que la lecture. */}
        <GhostAutoTextArea
          key={`title-${task.title}`}
          defaultValue={task.title}
          aria-label="Titre"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v) void save('title', changed(task.title, v), { title: v })
            else e.target.value = task.title // titre vide interdit : on restaure
          }}
          className={`text-base font-semibold leading-snug tracking-tight ${titleCls}`}
        />
        <div className="px-1.5"><SavedTick show={savedIn('title')} /></div>
        <FieldError errs={errors.title} />

        {/* Tags : Combobox multiple « Creatable » ghost — suggestions = tous les
            tags du backlog, saisie inconnue → « Créer "xxx" ». */}
        <TagsCombobox
          tags={task.tags}
          suggestions={allTags}
          onSave={(next) => void save('tags', changed(task.tags, next), { tags: next })}
        />
        <FieldError errs={errors.tags} />
        <div className="px-1.5"><SavedTick show={savedIn('tags')} /></div>
      </div>

      {/* #124 — LA barre d'actions : toutes les actions de la tâche, regroupées.
          Primaire (noir plein) = l'action de cycle de vie (#27) ; secondaires
          (actionBtn) = brief agent et Supprimer — le destructif ferme la barre,
          calé à droite. Le done guidé (#27) se déplie sous la barre, inchangé. */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {task.status === 'todo' && (
            <button type="button" onClick={start} disabled={pending} className={primaryBtn}>
              {pending ? 'Démarrage…' : 'Démarrer'}
            </button>
          )}
          {task.status === 'in_progress' && (
            <button type="button" onClick={() => setDoneOpen((o) => !o)} className={primaryBtn}>
              {doneOpen ? 'Fermer' : 'Terminer…'}
            </button>
          )}
          <button
            type="button"
            className={actionBtn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(agentBrief(task))
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                // clipboard indisponible (contexte non sécurisé) — copie manuelle.
                window.prompt('Copie manuelle du brief :', agentBrief(task))
              }
            }}
          >
            {copied ? 'Copié' : 'Copier le brief agent'}
          </button>
          <button type="button" onClick={remove} disabled={pending} className={`ml-auto ${actionBtn}`}>
            Supprimer
          </button>
        </div>
        <Collapsible.Root open={doneOpen} onOpenChange={setDoneOpen}>
          <Collapsible.Panel>
            <DoneForm task={task} busy={pending} onCancel={() => setDoneOpen(false)} onSubmit={finishDone} />
          </Collapsible.Panel>
        </Collapsible.Root>
      </div>

      {/* Métadonnées : champs ghost permanents, étiquetés. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Taille</SectionLabel>
          <Select
            ghost
            aria-label="Taille"
            defaultValue={task.size ?? ''}
            items={SIZE_ITEMS}
            onValueChange={(v) => void save('size', changed(task.size, v || null), { size: v || null })}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Team</SectionLabel>
          {/* Enum stricte (8 teams, requise) : Select ghost, pas d'option vide. */}
          <Select
            ghost
            aria-label="Team"
            defaultValue={task.team}
            items={TEAM_ITEMS}
            onValueChange={(v) => void save('team', changed(task.team, v), { team: v })}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Code</SectionLabel>
          <GhostInput
            key={`code-${task.code ?? ''}`}
            defaultValue={task.code ?? ''}
            placeholder="—"
            aria-label="Code"
            onKeyDown={blurOnEnter}
            onBlur={(e) => void save('code', changed(task.code, e.target.value || null), { code: e.target.value || null })}
            className="font-mono text-sm"
          />
        </div>
      </div>
      <div className="-mt-4 px-1.5"><SavedTick show={savedIn('size', 'team', 'code')} /></div>
      <FieldError errs={errors.size ?? errors.team ?? errors.code} />

      {/* Epic : LE regroupement transverse aux stages (#133) — combobox des epics
          existants + création à la volée (saisie slugifiée), ✕ pour retirer. */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <SectionLabel>Epic</SectionLabel>
          <SavedTick show={savedIn('epic')} />
        </div>
        <EpicCombobox
          key={`epic-${task.epic ?? ''}`}
          value={task.epic}
          suggestions={epicSlugs}
          toSlug={slugify}
          onSave={(next) => void save('epic', changed(task.epic, next), { epic: next })}
        />
        <FieldError errs={errors.epic} />
      </div>

      {/* Détail : markdown rendu au repos ; clic → textarea à taille identique. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SectionLabel>Détail</SectionLabel>
          <SavedTick show={savedIn('detail')} />
        </div>
        {detailEditing ? (
          <GhostAutoTextArea
            autoFocus
            defaultValue={task.detail ?? ''}
            style={{ minHeight: detailMinHeight.current }}
            onFocus={(e) => {
              // Curseur posé à l'endroit cliqué (une seule fois, au focus initial).
              const c = detailCaret.current
              if (c !== null) { e.currentTarget.setSelectionRange(c, c); detailCaret.current = null }
            }}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.blur() }}
            onBlur={(e) => {
              const v = e.target.value || null
              void save('detail', changed(task.detail, v), { detail: v }).then((ok) => {
                if (!ok) return
                setDetailEditing(false)
                // La textarea est démontée : le focus est REPLACÉ sur la zone de
                // lecture (audit #107) — sauf si le blur vient d'un clic qui a
                // déjà posé le focus ailleurs (on ne vole pas ce focus-là).
                requestAnimationFrame(() => {
                  if (document.activeElement === document.body) detailReadRef.current?.focus()
                })
              })
            }}
            className="text-sm leading-relaxed"
          />
        ) : (
          <div
            ref={detailReadRef}
            role="button"
            tabIndex={0}
            title="Cliquer pour éditer"
            // Nom accessible COURT (sinon tout le markdown devient le nom du bouton).
            aria-label="Modifier le détail"
            onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) openDetailEditor({ x: e.clientX, y: e.clientY }) }}
            // Un role="button" répond à Entrée ET Espace (design.md §3.5).
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailEditor() } }}
            className="cursor-text border border-transparent px-1.5 py-1 transition-colors hover:bg-neutral-100"
          >
            {task.detail ? (
              <Markdown source={task.detail} className="doc-prose--panel" />
            ) : (
              <p className="text-xs text-neutral-500">Aucun détail. Cliquer pour ajouter.</p>
            )}
          </div>
        )}
        <FieldError errs={errors.detail} />
      </div>

      {/* Dépend de : lignes navigables (✕ au survol) + ajout ghost permanent. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SectionLabel>Dépend de</SectionLabel>
          <SavedTick show={savedIn('dependsOn')} />
        </div>
        <div ref={depsListRef} tabIndex={-1} className="flex flex-col">
          {task.dependsOn.map((d) => (
            <RelationRow
              key={d} tree={tree} id={d} badge={depBadge(d)}
              onRemove={() => removeAndRefocus('dependsOn', { dependsOn: task.dependsOn.filter((x) => x !== d) }, depsListRef)}
            />
          ))}
          <AddCombobox
            items={relItems(task.dependsOn)}
            placeholder="+ ajouter une dépendance"
            aria-label="Ajouter une dépendance"
            onAdd={(v) => void save('dependsOn', true, { dependsOn: [...task.dependsOn, Number(v)] })}
          />
        </div>
        <FieldError errs={errors.dependsOn} />
      </div>

      <RelationList label="Bloque" tree={tree} ids={blocks} />
      <RelationList label="Sous-tâches" tree={tree} ids={task.subtasks.map((s) => s.id)} badgeOf={subBadge} />

      {/* Liens : même patron que Dépend de. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SectionLabel>Liens</SectionLabel>
          <SavedTick show={savedIn('links')} />
        </div>
        <div ref={linksListRef} tabIndex={-1} className="flex flex-col">
          {task.links.map((l) => (
            <RelationRow
              key={l} tree={tree} id={l}
              onRemove={() => removeAndRefocus('links', { links: task.links.filter((x) => x !== l) }, linksListRef)}
            />
          ))}
          <AddCombobox
            items={relItems(task.links)}
            placeholder="+ ajouter un lien"
            aria-label="Ajouter un lien"
            onAdd={(v) => void save('links', true, { links: [...task.links, Number(v)] })}
          />
        </div>
        <FieldError errs={errors.links} />
      </div>

      {/* Références : lignes (✕ au survol) + input d'ajout ghost (Entrée = ajouter). */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SectionLabel>Références</SectionLabel>
          <SavedTick show={savedIn('refs')} />
        </div>
        <div ref={refsListRef} tabIndex={-1} className="flex flex-col gap-0.5">
          {task.refs.map((r) => (
            <RefLine
              key={r} refPath={r}
              onRemove={() => removeAndRefocus('refs', { refs: task.refs.filter((x) => x !== r) }, refsListRef)}
            />
          ))}
          <GhostInput
            key={`refs-${task.refs.length}`}
            placeholder="+ ajouter une référence (chemin, Entrée)"
            aria-label="Ajouter une référence"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const v = e.currentTarget.value.trim()
              if (!v) return
              e.currentTarget.value = ''
              if (!task.refs.includes(v)) void save('refs', true, { refs: [...task.refs, v] })
            }}
            className="font-mono text-xs"
          />
        </div>
        <FieldError errs={errors.refs} />
      </div>

      {/* Consignation : inputs ghost permanents (corrections rares mais directes). */}
      <div className="flex flex-col gap-1 border border-neutral-200 bg-neutral-50 px-2 py-2">
        <div className="flex items-center gap-2 px-1.5">
          <div className="text-[11px] font-medium text-neutral-500">Consignation</div>
          <SavedTick show={savedIn('outcome', 'verification', 'commit', 'release')} />
        </div>
        <div className="px-1.5 text-xs text-neutral-500">
          <span title={absoluteDate(task.createdAt)}>créée {relativeTime(task.createdAt)}</span>
          {task.completedAt ? <> · <span title={absoluteDate(task.completedAt)}>terminée {relativeTime(task.completedAt)}</span></> : ''}
        </div>
        {([
          { field: 'outcome', label: 'outcome', value: task.outcome, area: true },
          { field: 'verification', label: 'vérification', value: task.verification, area: true },
          { field: 'commit', label: 'commit', value: task.commit, area: false },
          { field: 'release', label: 'release', value: task.release, area: false },
        ] as const).map(({ field, label, value, area }) => (
          <label key={field} className="flex flex-col">
            <span className="px-1.5 text-[11px] text-neutral-500">{label}</span>
            {area ? (
              <GhostAutoTextArea
                key={`${field}-${value ?? ''}`}
                defaultValue={value ?? ''}
                placeholder="—"
                aria-label={label}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.blur() }}
                onBlur={(e) => void save(field, changed(value, e.target.value || null), { [field]: e.target.value || null })}
                className="bg-transparent text-xs"
              />
            ) : (
              <GhostInput
                key={`${field}-${value ?? ''}`}
                defaultValue={value ?? ''}
                placeholder="—"
                aria-label={label}
                onKeyDown={blurOnEnter}
                onBlur={(e) => void save(field, changed(value, e.target.value || null), { [field]: e.target.value || null })}
                className="bg-transparent font-mono text-xs"
              />
            )}
            <FieldError errs={errors[field]} />
          </label>
        ))}
      </div>

      {/* Pied : le chemin technique, relégué ici (audit UX). */}
      <div className="mt-auto border-t border-neutral-200 pt-3">
        <div className="truncate font-mono text-[11px] text-neutral-500" title={task.file}>{task.file}</div>
      </div>
    </div>
  )
}
