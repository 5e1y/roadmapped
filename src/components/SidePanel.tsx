import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Coquille du panneau latéral droit : largeur fixe 380px, fond blanc, filet à
 * gauche. Fermeture par Esc ou par le ✕ de l'en-tête.
 *
 * Esc en trois temps, en phase de CAPTURE (on passe avant Base UI, donc le
 * popup éventuel est encore monté quand on décide) :
 *  1. un popup Base UI (Select/Combobox, role=listbox) est ouvert → on ne fait
 *     rien, Base UI le referme lui-même ;
 *  2. un champ du panneau a le focus → premier Esc = blur (ce qui déclenche la
 *     sauvegarde au blur) SANS fermer — la saisie n'est jamais perdue ;
 *  3. sinon → fermeture.
 * Focus : mémorisé à l'ouverture, déplacé dans le panneau (sauf si un champ
 * autoFocus l'a déjà pris), restauré à la fermeture.
 */
export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 1. Popup Base UI ouvert : lui laisser consommer l'Escape.
      if (document.querySelector('[role="listbox"]')) return
      const el = document.activeElement as HTMLElement | null
      // 2. Champ actif du panneau : blur d'abord (sauvegarde), pas de fermeture.
      if (
        el &&
        asideRef.current?.contains(el) &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ) {
        e.preventDefault()
        el.blur()
        return
      }
      // 3. Fermeture.
      onClose()
    }
    // Capture : on s'exécute avant les listeners Base UI (popup encore monté).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    // Ne pas voler le focus si un champ autoFocus l'a déjà pris dans le panneau.
    if (asideRef.current && !asideRef.current.contains(document.activeElement)) {
      asideRef.current.focus()
    }
    return () => prev?.focus?.()
  }, [])

  return (
    <aside
      ref={asideRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className="flex w-[380px] shrink-0 flex-col border-l border-neutral-200 bg-white focus:outline-none"
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight text-neutral-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  )
}
