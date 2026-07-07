import { Select as BaseSelect } from '@base-ui/react/select'
import { Input as BaseInput } from '@base-ui/react/input'
import { Combobox } from '@base-ui/react/combobox'
import type { ComponentProps, KeyboardEvent } from 'react'

/**
 * Mini-kit de primitives Base UI stylées monochrome — source unique des
 * champs de formulaire du dashboard (panneaux tâche/section/création).
 */

export const fieldCls =
  'w-full rounded border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-400'

/** Enter = valider (blur déclenche la sauvegarde des champs "au blur"). */
export const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}

export function TextInput(props: ComponentProps<typeof BaseInput>) {
  return <BaseInput {...props} className={`${fieldCls} ${props.className ?? ''}`} />
}

export function TextArea(props: ComponentProps<'textarea'>) {
  // Base UI n'a pas de textarea — même peau que les autres champs.
  return <textarea {...props} className={`${fieldCls} min-h-[100px] resize-y ${props.className ?? ''}`} />
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
  'aria-label': ariaLabel,
}: {
  /** Non contrôlé (parité avec les champs "au blur") : le choix s'affiche
      immédiatement, le reload de l'arbre suit. `key` du panneau = remontage. */
  defaultValue: string
  onValueChange: (value: string) => void
  items: SelectItem[]
  disabled?: boolean
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
        className={`${fieldCls} flex items-center justify-between gap-2 text-left data-[disabled]:bg-neutral-50 data-[disabled]:text-neutral-400`}
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
          <BaseSelect.Popup className="min-w-[var(--anchor-width)] rounded border border-neutral-200 bg-white py-1 shadow-sm">
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
            className="flex items-center gap-1 rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700"
          >
            {item.label}
            <Combobox.ChipRemove className="text-neutral-400 hover:text-neutral-700" aria-label={`Retirer ${item.label}`}>
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
          <Combobox.Popup className="max-h-64 min-w-[var(--anchor-width)] overflow-y-auto rounded border border-neutral-200 bg-white py-1 shadow-sm">
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
