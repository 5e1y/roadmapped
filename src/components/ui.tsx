import { Select as BaseSelect } from '@base-ui/react/select'
import { Input as BaseInput } from '@base-ui/react/input'
import { Combobox } from '@base-ui/react/combobox'
import { Toast } from '@base-ui/react/toast'
import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'

/**
 * Mini-kit de primitives Base UI stylées monochrome — source unique des
 * champs de formulaire du dashboard (panneaux tâche/section/création).
 */

export const fieldCls =
  'w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400'

/**
 * Peau « ghost » (décision Rémi 2026-07-07) : l'élément éditable est un input
 * MONTÉ EN PERMANENCE, camouflé en lecture — transparent, même typo que le
 * texte lu ; fond gris au survol ; contour au focus (le :focus-visible global
 * d'index.css). Jamais de swap lecture→input, jamais d'étape crayon.
 */
export const ghostCls =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-neutral-900 transition-colors hover:bg-neutral-100 focus:border-neutral-300 focus:bg-white focus:outline-none disabled:text-neutral-500 disabled:hover:bg-transparent'

/** Enter = valider (blur déclenche la sauvegarde des champs "au blur"). */
export const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
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
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-neutral-900">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5 11 10.5H1L6 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          <path d="M6 5v2.5M6 9v.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Erreur
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
          className="border border-l-4 border-neutral-900 bg-white px-3 py-2 shadow-sm data-[ending]:opacity-0 data-[starting]:opacity-0"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Toast.Title className="text-xs font-semibold text-neutral-900" />
              <Toast.Description className="mt-0.5 text-xs text-neutral-700" />
            </div>
            <Toast.Close
              aria-label="Fermer"
              className="shrink-0 rounded p-0.5 text-neutral-400 hover:text-neutral-700"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </Toast.Close>
          </div>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  )
}

export interface SelectItem {
  value: string
  label: string
}

export function Select({
  defaultValue,
  onValueChange,
  items,
  disabled = false,
  ghost = false,
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
        className={`${ghost ? `${ghostCls} text-sm` : fieldCls} flex items-center justify-between gap-2 text-left data-[disabled]:bg-neutral-50 data-[disabled]:text-neutral-400 ${ghost ? 'data-[disabled]:bg-transparent' : ''}`}
      >
        <BaseSelect.Value />
        <BaseSelect.Icon className="shrink-0 text-neutral-400">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] border border-neutral-200 bg-white py-1 shadow-sm">
            {items.map((item) => (
              <BaseSelect.Item
                key={item.value}
                value={item.value}
                className="flex cursor-default items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-neutral-900 data-[highlighted]:bg-neutral-100"
              >
                <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="text-neutral-900">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                    <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
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
  return (
    <Combobox.Root
      key={epoch}
      items={items}
      onValueChange={(item: SelectItem | null) => {
        if (item) { onAdd(item.value); setEpoch((e) => e + 1) }
      }}
    >
      <Combobox.Input
        aria-label={ariaLabel ?? placeholder}
        placeholder={placeholder}
        className={`${ghostCls} text-sm placeholder:text-neutral-400`}
      />
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-64 min-w-[var(--anchor-width)] overflow-y-auto border border-neutral-200 bg-white py-1 shadow-sm">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-neutral-400">Aucune tâche.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="cursor-default truncate px-2.5 py-1.5 text-sm text-neutral-900 data-[highlighted]:bg-neutral-100"
                >
                  {item.label}
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
        {tags.length === 0 && <span className="text-[12px] text-neutral-400">—</span>}
        {tags.map((t) => <span key={t} className="text-[12px] text-neutral-500">#{t}</span>)}
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
      <Combobox.Chips className={`${ghostCls} flex flex-wrap items-center gap-1.5 focus-within:border-neutral-300 focus-within:bg-white`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.id}
            className="flex items-center gap-1 text-[12px] text-neutral-500"
          >
            #{item.value}
            <Combobox.ChipRemove aria-label={`Retirer ${item.value}`} className="shrink-0 rounded text-neutral-300 hover:text-neutral-700">
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          aria-label="Tags"
          placeholder={selected.length === 0 ? '+ tag' : '+'}
          className="min-w-[60px] flex-1 bg-transparent text-[12px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-56 min-w-[var(--anchor-width)] overflow-y-auto border border-neutral-200 bg-white py-1 shadow-sm">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-neutral-400">Aucun tag.</Combobox.Empty>
            <Combobox.List>
              {(item: TagItem) => (
                <Combobox.Item
                  key={item.id}
                  value={item}
                  className="flex cursor-default items-center gap-2 px-2.5 py-1.5 text-sm text-neutral-900 data-[highlighted]:bg-neutral-100"
                >
                  {item.creatable ? (
                    <>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" className="shrink-0 text-neutral-500">
                        <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      <span>Créer « {item.creatable} »</span>
                    </>
                  ) : (
                    <>
                      <Combobox.ItemIndicator className="shrink-0 text-neutral-900">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                          <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
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
      <Combobox.Chips className={`${fieldCls} flex flex-wrap items-center gap-1`}>
        {selected.map((item) => (
          <Combobox.Chip
            key={item.value}
            className="flex max-w-full items-center gap-1 bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700"
          >
            <span className="min-w-0 max-w-[200px] truncate" title={item.label}>{item.label}</span>
            <Combobox.ChipRemove className="shrink-0 text-neutral-400 hover:text-neutral-700" aria-label={`Retirer ${item.label}`}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </Combobox.ChipRemove>
          </Combobox.Chip>
        ))}
        <Combobox.Input
          aria-label={ariaLabel}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="min-w-[80px] flex-1 bg-transparent text-sm text-neutral-900 focus:outline-none"
        />
      </Combobox.Chips>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="z-50">
          <Combobox.Popup className="max-h-64 min-w-[var(--anchor-width)] overflow-y-auto border border-neutral-200 bg-white py-1 shadow-sm">
            <Combobox.Empty className="px-2.5 py-1.5 text-sm text-neutral-400">Aucune tâche.</Combobox.Empty>
            <Combobox.List>
              {(item: SelectItem) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  className="flex cursor-default items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-neutral-900 data-[highlighted]:bg-neutral-100"
                >
                  <span className="truncate">{item.label}</span>
                  <Combobox.ItemIndicator className="text-neutral-900">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
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
