import { Select as BaseSelect } from '@base-ui/react/select'
import { Input as BaseInput } from '@base-ui/react/input'
import { Combobox } from '@base-ui/react/combobox'
import { Toast } from '@base-ui/react/toast'
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, Cross, Plus, Warning } from 'trinil-react'
import { KindGlyph } from './glyphs'
import { useTree } from '../state/TreeContext'

/**
 * Mini-kit de primitives Base UI stylées monochrome — source unique des
 * champs de formulaire du dashboard (panneaux tâche/section/création).
 */

// Langage de SÉLECTION de l'app (design.md §3.2) — l'item « courant » (ouvert
// dans le panneau) : fond Active (accent-tint) SEUL. Le trait inset accent à
// gauche a été retiré (#395, décision Rémi) : trop marqueur Roadmapped, il
// s'intégrait mal dans les autres thèmes (GitHub, Claude…). Source UNIQUE, à
// réutiliser partout où une ligne peut être « la courante » (#380) : TaskRow,
// l'aperçu Overview, le feed Activity… Non-courant → survol Rollover.
export const CURRENT_ROW = 'bg-active'
export const rowStateClass = (isCurrent: boolean) =>
  isCurrent ? CURRENT_ROW : 'hover:bg-rollover'

/**
 * Langage « contrôle ENCLENCHÉ/actif » (design.md §3.2, registre « pill bordée »,
 * décision #311) — source UNIQUE des toggles / filtres / bascules. À NE PAS
 * confondre avec le registre « ligne courante » ci-dessus (rowStateClass /
 * CURRENT_ROW, #380) : celui-là décore une RANGÉE sélectionnée ; celui-ci un
 * CONTRÔLE que l'on presse pour l'enclencher.
 *
 * Dialecte canonique (le plus riche, le plus utilisé) :
 *   repos  → bord neutral-300 + fond blanc + encre 600, survol neutral-100
 *   ACTIF  → bord accent + fond accent-tint + font-medium + encre 900
 * Rayon 4px (`rounded-interactive`) = « contrôle du corps » de la doctrine strate (design.md
 * §1). Focus-visible hérité du :focus-visible global (index.css).
 *
 * Se compose comme trigger de Popover via `render={<TogglePill active=… />}` :
 * Base UI fusionne ses props (onClick, aria-expanded, ref) sur le <button>.
 */
const togglePillCls = (active: boolean) =>
  `flex items-center gap-1.5 rounded-interactive border px-2.5 py-1 text-xs transition-colors ${
    active
      ? 'border-accent bg-active font-medium text-texthard'
      : 'border-neutral-300 bg-foreground text-textsoft hover:bg-rollover'
  }`

export const TogglePill = forwardRef<HTMLButtonElement, ComponentProps<'button'> & { active: boolean }>(
  function TogglePill({ active, className, children, ...rest }, ref) {
    return (
      <button
        type="button"
        {...rest}
        ref={ref}
        aria-pressed={active}
        className={`${togglePillCls(active)}${className ? ` ${className}` : ''}`}
      >
        {children}
      </button>
    )
  },
)

/**
 * État VIDE canonique (design.md §4, #384) — UNE seule primitive pour les ~12
 * empty states qui divergeaient (dashed box, héro, `<p>` nu…). Centré : glyphe
 * optionnel (encre neutral-300, purement décoratif → aria-hidden) + titre
 * (`text-sm font-medium text-texthard`) + indice optionnel sur une ligne
 * (`text-xs text-textsoft`). Le `className` porte le calage vertical/hauteur
 * du contexte : `h-full` en pleine zone, `py-8`/`py-12` dans une carte.
 */
export function EmptyState({ glyph, title, hint, className = '' }: {
  glyph?: ReactNode
  title: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 px-6 text-center ${className}`}>
      {glyph && <div className="text-neutral-300" aria-hidden="true">{glyph}</div>}
      <p className="text-sm font-medium text-texthard">{title}</p>
      {hint && <p className="max-w-sm text-xs text-textsoft">{hint}</p>}
    </div>
  )
}

/**
 * Garde d'état de l'arbre de tâches (design.md §4, #384) — source UNIQUE des
 * états chargement / erreur serveur / erreurs de validation, PARTAGÉE par le
 * Backlog, la Roadmap, la vue Dépendances et l'Overview (ex-`RoadmapStateGuard`
 * dupliqué verbatim dans le Backlog). Rendu SOUS le header : montée dans le corps
 * d'un `<ViewShell>`, elle laisse le `ViewHeader` toujours visible. Rend
 * `children` une fois l'arbre sain. `detail` = liste des erreurs de validation
 * dans une carte (le Backlog est la vue de détail) ; sinon renvoi vers le Backlog.
 */
export function TreeStateGuard({ detail = false, children }: { detail?: boolean; children: ReactNode }) {
  const { tree, errors, loading, loadError } = useTree()
  if (loading && !tree) {
    return <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-textsoft">Loading…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">Server unreachable</h1>
        <p className="mt-1 font-mono text-xs text-textsoft">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} validation error{errors.length > 1 ? 's' : ''} in docs/tasks/
        </h1>
        {detail ? (
          <>
            <p className="mt-1 text-sm text-textsoft">
              Fix the offending files — nothing renders until the source is healthy.
            </p>
            <ul className="mt-6 flex flex-col divide-y divide-neutral-100 border border-border bg-foreground">
              {errors.map((e, i) => (
                <li key={i} className="px-4 py-2.5 font-mono text-xs text-texthard">{e}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-sm text-textsoft">The roadmap will render once the source is healthy — details in the Backlog.</p>
        )}
      </div>
    )
  }
  return <>{children}</>
}

// Bordure neutral-300 conservée (design.md §2, option douce de l'audit #108) :
// le champ se différencie du fond par bg-neutral-50 au repos, blanc au focus.
export const fieldCls =
  'w-full rounded-interactive border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-sm text-texthard transition-colors focus:border-neutral-900 focus:bg-foreground focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400'

/**
 * Peau « ghost » (décision Rémi 2026-07-07) : l'élément éditable est un input
 * MONTÉ EN PERMANENCE, camouflé en lecture — transparent, même typo que le
 * texte lu ; fond gris au survol ; contour au focus (le :focus-visible global
 * d'index.css). Jamais de swap lecture→input, jamais d'étape crayon.
 */
export const ghostCls =
  'w-full rounded-interactive border border-transparent bg-transparent px-1.5 py-1 text-texthard transition-colors hover:bg-rollover focus:border-neutral-300 focus:bg-foreground focus:outline-none disabled:text-textsoft disabled:hover:bg-transparent'

/**
 * Boutons canoniques des panneaux (design.md §2) — source unique :
 * primaire = L'action principale (démarrer/terminer, créer, done) ;
 * secondaire (actionBtn) = tout le reste, « Supprimer » compris (registre
 * destructif global : non — monochrome assumé).
 */
export const primaryBtn =
  'rounded-interactive border border-action bg-action px-2.5 py-1 text-xs text-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-300'
export const actionBtn =
  'rounded-interactive border border-neutral-300 px-2.5 py-1 text-[11px] text-texthard transition-colors hover:bg-rollover disabled:opacity-50'

/** ✓ fugace « enregistré » posé sur la zone sauvée (spec §Feedback des panneaux). */
export function SavedTick({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="flex shrink-0 items-center gap-1 text-[11px] text-textsoft">
      <Check size={10} />
      saved
    </span>
  )
}

/** Erreur de VALIDATION affichée SOUS la zone fautive (⚠ + texte). Monochrome. */
export function FieldError({ errs }: { errs?: string[] }) {
  if (!errs || errs.length === 0) return null
  return (
    <div className="flex items-start gap-1.5 px-1.5 text-[11px] text-neutral-800">
      <Warning size={11} className="mt-px shrink-0" />
      <span className="font-mono">{errs.join(' · ')}</span>
    </div>
  )
}

/**
 * Enter = valider (blur déclenche la sauvegarde des champs "au blur"), puis le
 * focus est RESTITUÉ au champ (design.md §3.4 : jamais abandonné sur body).
 * Pas de boucle possible : le refocus ne re-déclenche pas de blur, et les
 * handlers onBlur ne PATCHent que si la valeur a changé (cf. save/changed).
 * Limite connue : si la valeur a changé, le reload remonte le champ (pattern
 * key={valeur}) et le focus repart — le refocus ne tient que pour l'Enter
 * « sans modification » ; l'isConnected évite de focaliser un nœud démonté.
 */
export const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter') return
  const el = e.currentTarget
  el.blur()
  requestAnimationFrame(() => { if (el.isConnected) el.focus() })
}

/**
 * Bandeau d'erreur des panneaux : registre visuel distinct d'une simple boîte
 * d'info neutre — libellé « Erreur » + icône d'alerte, bord gauche appuyé
 * (border-l-4 neutral-900), fond neutre-100. Monochrome strict.
 */
export function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div role="alert" className="border border-l-4 border-neutral-900 bg-neutral-100 px-3 py-2 text-xs text-neutral-800">
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-texthard">
        <Warning size={12} className="shrink-0" />
        Error
      </div>
      <ul className="flex flex-col gap-1">
        {errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
      </ul>
    </div>
  )
}

export function TextInput(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...props} className={`${fieldCls} ${props.className ?? ''}`} />
}

export function GhostInput(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...props} className={`${ghostCls} ${props.className ?? ''}`} />
}

/** Textarea ghost auto-grow — l'équivalent camouflé d'AutoTextArea. */
export function GhostAutoTextArea({ className = '', style, ...props }: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => { if (ref.current) grow(ref.current) }, [])
  return (
    <textarea
      ref={ref}
      onInput={(e) => grow(e.currentTarget)}
      className={`${ghostCls} resize-none overflow-hidden ${className}`}
      style={style}
      rows={1}
      {...props}
    />
  )
}

export function TextArea(props: ComponentProps<'textarea'>) {
  // Base UI n'a pas de textarea — même peau que les autres champs.
  return <textarea {...props} className={`${fieldCls} min-h-[100px] resize-y ${props.className ?? ''}`} />
}

/**
 * Textarea qui grandit avec son contenu (édition du détail markdown, spec §3 :
 * « textarea auto-grow, pleine hauteur naturelle »). Même peau que les champs ;
 * pas de scrollbar interne (overflow-hidden) — c'est le panneau qui scrolle.
 */
export function AutoTextArea({ className = '', ...props }: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  useEffect(() => { if (ref.current) grow(ref.current) }, [])
  return (
    <textarea
      ref={ref}
      onInput={(e) => grow(e.currentTarget)}
      className={`${fieldCls} min-h-[80px] resize-none overflow-hidden ${className}`}
      {...props}
    />
  )
}

/**
 * File d'attente des toasts du panneau — Base UI Toast, réservée aux erreurs
 * RÉSEAU (spec §Feedback). Registre visuel de l'ErrorBanner (bord gauche appuyé
 * neutral-900), monochrome strict. À monter DANS un `<Toast.Provider>` ; le
 * `add()` s'obtient via `Toast.useToastManager()` côté émetteur.
 */
export function ToastViewport() {
  const { toasts } = Toast.useToastManager()
  return (
    <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-72 flex-col gap-2">
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          className="rounded-surface bg-foreground px-3 py-2.5 shadow-lg ring-1 ring-inset ring-border transition-opacity duration-150 data-[ending]:opacity-0 data-[starting]:opacity-0 motion-reduce:transition-none"
        >
          {/* Aligné sur le popup Activity (filet neutral-200, shadow-lg, rounded-md,
              monochrome) — un petit Check accent signale la tâche bouclée (l'accent
              est ici légitime : point d'attention). Fini la boîte à bordure noire. */}
          <div className="flex items-start gap-2">
            <Check size={12} className="mt-px shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Toast.Title className="text-xs font-semibold text-texthard" />
              <Toast.Description className="mt-0.5 text-xs text-textsoft" />
            </div>
            <Toast.Close
              aria-label="Close"
              className="shrink-0 rounded-interactive p-0.5 text-textsoft transition-colors hover:bg-rollover hover:text-texthard"
            >
              <Cross size={10} />
            </Toast.Close>
          </div>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  )
}

/**
 * Aperçu d'une tâche dans les listes déroulantes de relations (#125) : de quoi
 * choisir sans ouvrir la tâche — glyphe de statut, #id, titre, stage.
 * Données PRÉ-DIGÉRÉES par l'appelant (stage déjà court) :
 * ui.tsx reste sans dépendance lib (même contrat que le toSlug d'EpicCombobox).
 */
export interface RelPreview {
  id: number
  title: string
  status: 'todo' | 'in_progress' | 'done'
  kind: 'task' | 'milestone'
  /** Stage court (« build », « gtm »…) dérivé du dossier de la tâche. */
  stage: string
}

export interface SelectItem {
  value: string
  /** Texte de recherche ET rendu de repli (chips, items sans aperçu). */
  label: string
  /** Si présent, l'item se rend en ligne riche façon backlog (#125). */
  preview?: RelPreview
}

/**
 * Corps d'un item de relation : ligne compacte façon backlog — glyphe (statut),
 * #id, titre (barré si faite), puis stage ancré à droite. Sans aperçu,
 * repli sur le label brut (items génériques).
 */
function RelOption({ item }: { item: SelectItem }) {
  const p = item.preview
  if (!p) return <span className="min-w-0 flex-1 truncate">{item.label}</span>
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <KindGlyph task={{ kind: p.kind, status: p.status }} />
      <span className="shrink-0 font-mono text-xs text-textsoft">#{p.id}</span>
      <span
        title={p.title}
        className={`min-w-0 truncate ${p.status === 'done' ? 'text-textsoft line-through' : 'text-texthard'}`}
      >
        {p.title}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {p.stage && <span className="font-mono text-[11px] text-textsoft">{p.stage}</span>}
      </span>
    </span>
  )
}

export function Select({
  defaultValue,
  onValueChange,
  items,
  disabled = false,
  ghost = false,
  compact = false,
  'aria-label': ariaLabel,
}: {
  /** Non contrôlé (parité avec les champs "au blur") : le choix s'affiche
      immédiatement, le reload de l'arbre suit. `key` du panneau = remontage. */
  defaultValue: string
  onValueChange: (value: string) => void
  items: SelectItem[]
  disabled?: boolean
  /** Peau camouflée (ghostCls) — pour les champs permanents du panneau. */
  ghost?: boolean
  /** Variante compacte du corps des vues : hauteur réduite
      (py-1, text-xs) — rounded-interactive 4px comme tout contrôle du corps (design.md §1). */
  compact?: boolean
  'aria-label'?: string
}) {
  return (
    <BaseSelect.Root
      items={items}
      defaultValue={defaultValue}
      onValueChange={(v) => { if (typeof v === 'string') onValueChange(v) }}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={`${ghost ? `${ghostCls} text-sm` : compact ? 'w-full rounded-interactive border border-neutral-300 bg-foreground px-2.5 py-1 text-xs text-texthard transition-colors focus:border-neutral-900 focus:outline-none' : fieldCls} flex items-center justify-between gap-2 text-left data-[disabled]:bg-neutral-50 data-[disabled]:text-textsoft ${ghost ? 'data-[disabled]:bg-transparent' : ''}`}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon className="shrink-0 text-textsoft">
          <ChevronDown size={10} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] rounded-interactive bg-foreground py-1 shadow-sm ring-1 ring-inset ring-border">
            {items.map((item) => (
              <BaseSelect.Item
                key={item.value}
                value={item.value}
                className="flex cursor-default items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-texthard data-[highlighted]:bg-neutral-100"
              >
                <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="text-texthard">
                  <Check size={10} />
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
}

/**
 * Combobox « ajouter » ghost : sélection UNITAIRE qui appelle onAdd puis se
 * vide (remontage par clé). Sert aux listes du panneau (dépendances, liens) :
 * les éléments existants s'affichent en lignes navigables avec leur propre ✕,
 * l'ajout se fait ici — pas de chips dupliquées, pas d'étape crayon.
 */
export function AddCombobox({ items, placeholder, onAdd, 'aria-label': ariaLabel }: {
  items: SelectItem[]
  placeholder: string
  onAdd: (value: string) => void
  'aria-label'?: string
}) {
  const [epoch, setEpoch] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // Le remontage key={epoch} démonte l'input focalisé (focus perdu sur body,
  // audit #107) : refocus du nouvel input après chaque ajout — pas au montage.
  useEffect(() => {
    if (epoch > 0) inputRef.current?.focus()
  }, [epoch])
  return (
    <Combobox.Root
      key={epoch}
      items={items}
      onValueChange={(item: SelectItem | null) => {
        if (item) { onAdd(item.value); setEpoch((e) => e + 1) }
      }}
    >
      <Combobox.Input
        ref={inputRef}
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        className={`${ghostCls} text-sm placeholder:text-textsoft`}
      />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          {/* Largeur = celle du champ (pas min-) : les lignes riches (#125)
              tronquent leur titre au lieu de dilater le popup à l'écran. */}
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-1 shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-textsoft">No tasks.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center px-2.5 py-1.5 text-sm text-texthard data-[highlighted]:bg-neutral-100"
                >
                  <RelOption item={item} />
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

interface TagItem {
  id: string
  value: string
  /** Présent sur l'item virtuel « Créer "xxx" » (pattern Creatable de Base UI). */
  creatable?: string
}

/**
 * Tags en Combobox multiple « Creatable » (https://base-ui.com/react/components/combobox#creatable),
 * peau ghost : chips ✕ + saisie filtrante ; `suggestions` = les tags déjà utilisés
 * dans le backlog (cohérence du vocabulaire) ; une saisie inconnue propose
 * « Créer "xxx" ». Chaque geste (ajout, création, retrait) appelle onSave.
 */
export function TagsCombobox({ tags, suggestions, disabled = false, onSave }: {
  tags: string[]
  suggestions: string[]
  disabled?: boolean
  onSave: (next: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const norm = (s: string) => s.trim().replace(/^#/, '')
  const selected: TagItem[] = tags.map((t) => ({ id: t, value: t }))
  const known = [...new Set([...suggestions, ...tags])].sort()
  const trimmed = norm(query)
  const exactExists = known.some((t) => t.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
  const items: TagItem[] =
    trimmed !== '' && !exactExists
      ? [...known.map((t) => ({ id: t, value: t })), { id: `create:${trimmed}`, value: trimmed, creatable: trimmed }]
      : known.map((t) => ({ id: t, value: t }))

  if (disabled) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-1.5 py-1">
        {tags.length === 0 && <span className="text-[12px] text-textsoft">—</span>}
        {tags.map((t) => <span key={t} className="text-[12px] text-textsoft">#{t}</span>)}
      </div>
    )
  }

  return (
    <Combobox.Root
      multiple
      items={items}
      value={selected}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next: TagItem[]) => {
        const created = next.find((i) => i.creatable)
        setQuery('')
        if (created?.creatable) {
          const v = norm(created.creatable)
          if (v && !tags.includes(v)) onSave([...tags, v])
          return
        }
        onSave(next.filter((i) => !i.creatable).map((i) => i.value))
      }}
    >
      <Combobox.Chips className={`${ghostCls} flex flex-wrap items-center gap-1.5 focus-within:border-neutral-300 focus-within:bg-foreground`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.id}
            className="flex items-center gap-1 text-[12px] text-textsoft"
          >
            #{item.value}
            <Combobox.ChipRemove aria-label={`Remove ${item.value}`} className="shrink-0 rounded-interactive text-textsoft hover:text-texthard">
              <Cross size={8} />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          aria-label="Tags"
          placeholder={selected.length === 0 ? '+ tag' : '+'}
          className="min-w-[60px] flex-1 bg-transparent text-[12px] text-texthard placeholder:text-textsoft focus:outline-none"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-56 min-w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-1 shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-textsoft">No tags.</Combobox.Empty>
            <Combobox.List>
              {(item: TagItem) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  className="flex cursor-default items-center gap-2 px-2.5 py-1.5 text-sm text-texthard data-[highlighted]:bg-neutral-100"
                >
                  {item.creatable ? (
                    <>
                      <Plus size={10} className="shrink-0 text-textsoft" />
                      <span>Create “{item.creatable}”</span>
                    </>
                  ) : (
                    <>
                      <Combobox.ItemIndicator className="shrink-0 text-texthard">
                        <Check size={10} />
                      </Combobox.ItemIndicator>
                      <span>#{item.value}</span>
                    </>
                  )}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

/**
 * Epic en Combobox « Creatable » SIMPLE (#133) — un seul slug, peau ghost :
 * suggestions = les epics existants du projet (déclarés + auto-découverts) ; une
 * saisie inconnue propose « Créer "xxx" » (slugifiée à l'enregistrement) ; le ✕
 * (visible quand un epic est posé) retire l'epic. Non contrôlé côté valeur : le
 * parent remonte le composant via key après reload (pattern des autres champs).
 */
export function EpicCombobox({ value, suggestions, disabled = false, onSave, toSlug }: {
  value: string | null
  suggestions: string[]
  disabled?: boolean
  onSave: (next: string | null) => void
  /** Slugifieur partagé (lib/roadmap slugify) — injecté pour garder ui.tsx sans dépendance lib. */
  toSlug: (input: string) => string
}) {
  const [query, setQuery] = useState(value ?? '')
  const known = [...new Set([...suggestions, ...(value ? [value] : [])])].sort()
  const trimmed = query.trim()
  const exactExists = trimmed !== '' && known.includes(toSlug(trimmed))
  // L'item « créer » garde la SAISIE BRUTE (le filtre intégré matche ce qu'on tape) ;
  // la slugification n'arrive qu'à l'enregistrement.
  const items: string[] = trimmed !== '' && !exactExists ? [...known, trimmed] : known

  if (disabled) {
    return (
      <div className="px-1.5 py-1 font-mono text-sm text-textsoft">{value ?? '—'}</div>
    )
  }

  return (
    <div className="group flex items-center">
      <Combobox.Root
        items={items}
        inputValue={query}
        onInputValueChange={setQuery}
        onValueChange={(v: string | null) => {
          if (v === null) return
          const slug = known.includes(v) ? v : toSlug(v)
          setQuery(slug)
          if (slug !== value) onSave(slug)
        }}
      >
        <Combobox.Input
          aria-label="Epic"
          placeholder="—"
          onBlur={() => {
            // Champ vidé puis quitté = retirer l'epic (parité avec les inputs ghost) ;
            // sinon on restaure la valeur courante (une saisie non validée ne PATCHe pas).
            if (trimmed === '' && value !== null) onSave(null)
            else setQuery(value ?? '')
          }}
          className={`${ghostCls} font-mono text-sm placeholder:text-textsoft`}
        />
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50">
            <Combobox.Popup className="max-h-56 min-w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-1 shadow-sm ring-1 ring-inset ring-border">
              <Combobox.Empty className="px-2.5 py-1.5 text-sm text-textsoft">No epics.</Combobox.Empty>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item
                    key={item}
                    value={item}
                    className="flex cursor-default items-center gap-2 px-2.5 py-1.5 text-sm text-texthard data-[highlighted]:bg-neutral-100"
                  >
                    {known.includes(item) ? (
                      <>
                        <Combobox.ItemIndicator className="shrink-0 text-texthard">
                          <Check size={10} />
                        </Combobox.ItemIndicator>
                        <span className="font-mono">{item}</span>
                      </>
                    ) : (
                      <>
                        <Plus size={10} className="shrink-0 text-textsoft" />
                        <span>Create “{toSlug(item)}”</span>
                      </>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {value !== null && (
        <button
          type="button"
          aria-label="Remove epic"
          title="Remove epic"
          onClick={() => onSave(null)}
          className="shrink-0 rounded-interactive p-1 text-textsoft opacity-0 transition-opacity hover:bg-neutral-200 hover:text-texthard focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Cross size={9} />
        </button>
      )}
    </div>
  )
}

/**
 * Multi-sélection filtrable à chips (Base UI Combobox multiple). Items = { value, label }
 * (value = id en string). value/onValueChange manipulent des number[] pour coller au schéma dependsOn.
 */
export function MultiCombobox({
  value, onValueChange, items, placeholder, 'aria-label': ariaLabel,
}: {
  value: number[]
  onValueChange: (value: number[]) => void
  items: SelectItem[]
  placeholder?: string
  'aria-label'?: string
}) {
  const selected = items.filter((i) => value.includes(Number(i.value)))
  return (
    <Combobox.Root
      multiple
      items={items}
      value={selected}
      onValueChange={(objs: SelectItem[]) => onValueChange(objs.map((o) => Number(o.value)))}
    >
      <Combobox.Chips className={`${fieldCls} flex flex-wrap items-center gap-1 focus-within:border-neutral-900 focus-within:bg-foreground`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.value}
            className="flex max-w-full items-center gap-1 bg-neutral-100 px-1.5 py-0.5 text-xs text-texthard"
          >
            <span className="min-w-0 max-w-[200px] truncate" title={item.label}>{item.label}</span>
            <Combobox.ChipRemove className="shrink-0 text-textsoft hover:text-texthard" aria-label={`Remove ${item.label}`}>
              <Cross size={8} />
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          aria-label={ariaLabel}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent text-sm text-texthard focus:outline-none"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          {/* Largeur = celle du champ (pas min-) : les lignes riches (#125)
              tronquent leur titre au lieu de dilater le popup à l'écran. */}
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-1 shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-textsoft">No tasks.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center gap-2 px-2.5 py-1.5 text-sm text-texthard data-[highlighted]:bg-neutral-100"
                >
                  <RelOption item={item} />
                  <Combobox.ItemIndicator className="shrink-0 text-texthard">
                    <Check size={10} />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
