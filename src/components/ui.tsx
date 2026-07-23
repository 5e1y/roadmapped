import { Select as BaseSelect } from '@base-ui/react/select'
import { Input as BaseInput } from '@base-ui/react/input'
import { Combobox } from '@base-ui/react/combobox'
import { Toast } from '@base-ui/react/toast'
import { forwardRef, useEffect, useRef, useState, type ComponentProps, type ComponentPropsWithoutRef, type ComponentType, type KeyboardEvent, type ReactNode } from 'react'
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
 *   repos  → ring Border + fond Foreground + encre TextSoft, survol Rollover
 *   ACTIF  → ring Accent + fond Active + font-medium + encre TextHard
 * Bordure en RING box-shadow (jamais `border` : zéro largeur DOM, #395). Rayon
 * `rounded-interactive`. Focus-visible hérité du :focus-visible global (index.css).
 *
 * Se compose comme trigger de Popover via `render={<TogglePill active=… />}` :
 * Base UI fusionne ses props (onClick, aria-expanded, ref) sur le <button>.
 */
const togglePillCls = (active: boolean) =>
  `flex items-center gap-s rounded-interactive px-m py-xs text-xs transition-colors ${
    active
      ? 'ring-1 ring-inset ring-accent bg-active font-medium text-texthard'
      : 'ring-1 ring-inset ring-border bg-foreground text-textsoft hover:bg-rollover'
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
 * optionnel (encre TextSoft, purement décoratif → aria-hidden) + titre
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
    <div className={`flex flex-col items-center justify-center gap-s px-xl text-center ${className}`}>
      {glyph && <div className="text-textsoft" aria-hidden="true">{glyph}</div>}
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
    return <div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))] text-sm text-textsoft">Loading…</div>
  }
  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
        <h1 className="text-lg font-semibold tracking-tight">Server unreachable</h1>
        <p className="mt-xs font-mono text-xs text-textsoft">{loadError}</p>
      </div>
    )
  }
  if (errors.length > 0) {
    return (
      <div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
        <h1 className="text-lg font-semibold tracking-tight">
          {errors.length} validation error{errors.length > 1 ? 's' : ''} in docs/tasks/
        </h1>
        {detail ? (
          <>
            <p className="mt-xs text-sm text-textsoft">
              Fix the offending files — nothing renders until the source is healthy.
            </p>
            <ul className="rm-list mt-xl bg-foreground">
              {errors.map((e, i) => (
                <li key={i} className="rm-list-item px-l py-m font-mono text-xs text-texthard">{e}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-xs text-sm text-textsoft">The roadmap will render once the source is healthy — details in the Backlog.</p>
        )}
      </div>
    )
  }
  return <>{children}</>
}

// Champ canonique : au repos un puits légèrement enfoncé (fond Background + ring
// Border 1px inset). Au focus il « remonte » (fond Foreground) et le ring passe à
// 2px accent — indicateur de focus UNIQUE partagé par tous les cousins (ghost,
// Select, Combobox). Aucune largeur DOM (ring = box-shadow).
export const fieldCls =
  'w-full rounded-interactive bg-background px-s py-s text-sm text-texthard ring-1 ring-inset ring-border transition-[background-color,box-shadow] focus:bg-foreground disabled:bg-background disabled:text-textsoft'

/**
 * Peau « ghost » (décision Rémi 2026-07-07) : l'élément éditable est un input
 * MONTÉ EN PERMANENCE, camouflé en lecture — transparent, même typo que le
 * texte lu ; fond gris au survol ; contour au focus (le :focus-visible global
 * d'index.css). Jamais de swap lecture→input, jamais d'étape crayon.
 */
export const ghostCls =
  'w-full rounded-interactive bg-transparent px-s py-xs text-texthard transition-colors hover:bg-rollover focus:bg-foreground disabled:text-textsoft disabled:hover:bg-transparent'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

/** Icône du bouton canonique : TOUJOURS 12px = la line-height du libellé
 *  (text-xs 12px × leading-none, cf. className du Button) — seule ou à côté
 *  d'un libellé, jamais ajustée par emplacement (#419/#420, retour Rémi : on
 *  unifie d'abord, les impacts UI se corrigent après coup, pas de surcharge
 *  de taille au cas par cas). Si la typo du bouton change, cette constante
 *  DOIT suivre sa line-height en px. Exporté (#427) pour que le champ de
 *  recherche global (ViewHeader) matérialise le MÊME gabarit vertical : son
 *  icône Search reprend cette taille, et son <input> est figé à cette hauteur
 *  littérale (12px) — voir le commentaire là-bas. */
export const BUTTON_ICON_SIZE = 12

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'bg-action text-foreground transition-[filter] hover:brightness-95',
  secondary: 'ring-1 ring-inset ring-border text-texthard transition-colors hover:bg-rollover',
  ghost: 'text-textsoft transition-colors hover:bg-rollover hover:text-texthard',
}

/**
 * LE bouton canonique (design.md §2, #419) — UN composant, 3 variants
 * (primary = fond plein, secondary = bordé, ghost = aucun fond). `icon` et
 * `children` (texte) sont chacun OPTIONNELS et combinables : icône seule,
 * texte seul, ou les deux — pas de composant « bouton icône » séparé.
 * GABARIT UNIQUE (#420, retour Rémi) : padding UNIFORME `p-s` (même valeur sur
 * les 4 côtés), texte text-xs à line-height resserrée (`leading-none` → 12px),
 * icône = exactement cette line-height (BUTTON_ICON_SIZE) — la hauteur ne varie
 * jamais selon variant/icône/texte (icône seule = carré exact 28×28, RIEN
 * d'autre autour). Zéro `gap` sur le conteneur : l'espacement icône↔texte est
 * porté par le SPAN du texte (`px-s`), pas par le bouton — le texte (seul ou
 * à côté d'une icône) gagne son propre respire, sans jamais toucher au carré
 * de l'icône seule.
 * `reveal` = registre « révélé au survol/focus de sa ligne » (retrait d'une
 * dépendance/ref/ligne de liste) — nécessite un ancêtre `.group`.
 * `rounded={false}` = registre « segment d'un groupe » (ex. ZoomControls) : le
 * bouton ABANDONNE son propre rayon — c'est le CONTENEUR du groupe qui porte
 * `rounded-interactive overflow-hidden` et clippe les seuls coins extérieurs de
 * la pilule. Sans ça, chaque segment garde son rayon individuel et les
 * séparateurs `shadow-inset` suivent ses coins arrondis (effet « boursouflé »
 * sur les thèmes à grand rayon). Prop dédié plutôt qu'un écrasement du rayon
 * via className : l'ordre de cascade des utilitaires Tailwind ne suit PAS
 * l'ordre textuel du className (ordre d'émission dans la feuille compilée),
 * l'écrasement ne serait pas garanti. (Et ne PAS citer l'utilitaire zéro-rayon
 * littéralement ici : le scanner Tailwind lit aussi les commentaires et
 * l'émettrait dans le CSS.)
 * forwardRef (même doctrine que TogglePill) : se compose via `render={<Button …/>}`
 * dans Base UI (Toast.Close, Popover.Trigger…) — Base UI y fusionne ses props.
 */
export const Button = forwardRef<HTMLButtonElement, {
  variant: ButtonVariant
  icon?: ComponentType<{ size?: number }>
  children?: ReactNode
  reveal?: boolean
  rounded?: boolean
} & ComponentPropsWithoutRef<'button'>>(function Button({
  variant, icon: Icon, children, reveal = false, rounded = true, className = '', ...rest
}, ref) {
  return (
    <button
      type="button"
      ref={ref}
      className={`flex items-center justify-center ${rounded ? 'rounded-interactive ' : ''}p-s text-xs leading-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLS[variant]} ${
        reveal ? 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100' : ''
      } ${className}`}
      {...rest}
    >
      {Icon && <Icon size={BUTTON_ICON_SIZE} />}
      {/* Espacement porté par le SPAN du texte (retour Rémi), pas par un gap du
          bouton : icône seule reste le carré exact p-s+icône+p-s (rien à retirer),
          texte (seul ou à côté de l'icône) gagne son propre respire px-s de
          chaque côté — le déséquilibre "plus d'air pour le texte" est voulu et
          ne dépend plus de la présence de l'icône. */}
      {children && <span className="px-s">{children}</span>}
    </button>
  )
})

/** ✓ fugace « enregistré » posé sur la zone sauvée (spec §Feedback des panneaux). */
export function SavedTick({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="flex shrink-0 items-center gap-xs text-[11px] text-textsoft">
      <Check size={10} />
      saved
    </span>
  )
}

/** Erreur de VALIDATION affichée SOUS la zone fautive (⚠ + texte). Monochrome. */
export function FieldError({ errs }: { errs?: string[] }) {
  if (!errs || errs.length === 0) return null
  return (
    <div className="flex items-start gap-s px-s text-[11px] text-texthard">
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
 * d'info neutre — libellé « Erreur » + icône d'alerte, trait gauche en inset
 * box-shadow accent (`shadow-[inset_3px_0_0_var(--color-accent)]`, #395 —
 * jamais de vraie `border`), fond Foreground. Monochrome strict.
 */
export function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div role="alert" className="rounded-surface bg-foreground px-m py-s text-xs text-textsoft shadow-[inset_3px_0_0_var(--color-accent)]">
      <div className="mb-xs flex items-center gap-s font-semibold text-texthard">
        <Warning size={12} className="shrink-0" />
        Error
      </div>
      <ul className="flex flex-col gap-xs">
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
  return <textarea rows={4} {...props} className={`${fieldCls} resize-y ${props.className ?? ''}`} />
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
      className={`${fieldCls} resize-none overflow-hidden ${className}`}
      rows={3}
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
    <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex max-w-72 flex-col gap-s">
      {toasts.map((toast) => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          className="rounded-surface bg-foreground px-m py-m shadow-lg ring-1 ring-inset ring-border transition-opacity duration-150 data-[ending]:opacity-0 data-[starting]:opacity-0 motion-reduce:transition-none"
        >
          {/* Aligné sur le popup Activity (filet neutral-200, shadow-lg, rounded-md,
              monochrome) — un petit Check accent signale la tâche bouclée (l'accent
              est ici légitime : point d'attention). Fini la boîte à bordure noire. */}
          <div className="flex items-start gap-s">
            <Check size={12} className="mt-px shrink-0 text-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <Toast.Title className="text-xs font-semibold text-texthard" />
              <Toast.Description className="mt-xs text-xs text-textsoft" />
            </div>
            {/* La croix du toast est LE vrai Button (demande initiale #419 : « la
                croix de la notif… un vrai composant ») : Toast.Close se compose via
                `render` (même doctrine que Popover.Trigger×TogglePill) — Base UI
                fusionne onClick/ref sur le <button> du Button ghost. */}
            <Toast.Close
              aria-label="Close"
              render={<Button variant="ghost" icon={Cross} className="shrink-0" />}
            />
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
    <span className="flex min-w-0 flex-1 items-center gap-s">
      <KindGlyph task={{ kind: p.kind, status: p.status }} />
      <span className="shrink-0 font-mono text-xs text-textsoft">#{p.id}</span>
      <span
        title={p.title}
        className={`min-w-0 truncate ${p.status === 'done' ? 'text-textsoft line-through' : 'text-texthard'}`}
      >
        {p.title}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-s">
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
      (py-xs, text-xs) — rounded-interactive 4px comme tout contrôle du corps (design.md §1). */
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
        className={`${ghost ? `${ghostCls} text-sm` : compact ? 'w-full rounded-interactive bg-foreground px-m py-xs text-xs text-texthard ring-1 ring-inset ring-border transition-colors hover:bg-rollover' : fieldCls} flex items-center justify-between gap-s text-left data-[disabled]:opacity-60 data-[disabled]:text-textsoft ${ghost ? 'data-[disabled]:bg-transparent' : ''}`}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon className="shrink-0 text-textsoft">
          <ChevronDown size={10} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] rounded-interactive bg-foreground py-xs shadow-sm ring-1 ring-inset ring-border">
            {items.map((item) => (
              <BaseSelect.Item
                key={item.value}
                value={item.value}
                className="flex cursor-default items-center justify-between gap-s px-m py-s text-sm text-texthard data-[highlighted]:bg-rollover"
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
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-xs shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-m py-s text-sm text-textsoft">No tasks.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center px-m py-s text-sm text-texthard data-[highlighted]:bg-rollover"
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
      <div className="flex flex-wrap items-center gap-s px-s py-xs">
        {tags.length === 0 && <span className="text-sm text-textsoft">—</span>}
        {tags.map((t) => <span key={t} className="text-sm text-textsoft">#{t}</span>)}
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
      <Combobox.Chips className={`${ghostCls} flex flex-wrap items-center gap-s focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent focus-within:bg-foreground`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.id}
            className="flex items-center gap-xs text-sm text-textsoft"
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
          className="min-w-[60px] flex-1 bg-transparent text-sm text-texthard placeholder:text-textsoft focus:outline-none"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-56 min-w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-xs shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-m py-s text-sm text-textsoft">No tags.</Combobox.Empty>
            <Combobox.List>
              {(item: TagItem) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  className="flex cursor-default items-center gap-s px-m py-s text-sm text-texthard data-[highlighted]:bg-rollover"
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
      <div className="px-s py-xs font-mono text-sm text-textsoft">{value ?? '—'}</div>
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
            <Combobox.Popup className="max-h-56 min-w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-xs shadow-sm ring-1 ring-inset ring-border">
              <Combobox.Empty className="px-m py-s text-sm text-textsoft">No epics.</Combobox.Empty>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item
                    key={item}
                    value={item}
                    className="flex cursor-default items-center gap-s px-m py-s text-sm text-texthard data-[highlighted]:bg-rollover"
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
        <Button variant="ghost" icon={Cross} reveal aria-label="Remove epic" title="Remove epic" onClick={() => onSave(null)} />
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
      <Combobox.Chips className={`${fieldCls} flex flex-wrap items-center gap-xs focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent focus-within:bg-foreground`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.value}
            className="flex max-w-full items-center gap-xs bg-active px-s py-xs text-xs text-texthard"
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
          <Combobox.Popup className="max-h-64 w-[var(--anchor-width)] overflow-y-auto rounded-interactive bg-foreground py-xs shadow-sm ring-1 ring-inset ring-border">
            <Combobox.Empty className="px-m py-s text-sm text-textsoft">No tasks.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center gap-s px-m py-s text-sm text-texthard data-[highlighted]:bg-rollover"
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
