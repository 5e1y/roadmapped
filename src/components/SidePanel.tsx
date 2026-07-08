import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, Cross } from 'trinil-react'
import { usePanel } from '../state/PanelContext'

/**
 * Coquille du panneau latéral droit : largeur fixe 380px, fond blanc, filet à
 * gauche. Fermeture par Esc, par le ✕ de l'en-tête, ou remontée de la pile de
 * navigation par le ← / Esc.
 *
 * Esc en cascade, en phase de CAPTURE (on passe avant Base UI, donc le popup
 * éventuel est encore monté quand on décide) :
 *  1. un popup Base UI (Select/Combobox, role=listbox) est ouvert → on ne fait
 *     rien, Base UI le referme lui-même ;
 *  2. un champ du panneau a le focus → Esc = blur (ce qui déclenche la
 *     sauvegarde au blur) SANS remonter — la saisie n'est jamais perdue ;
 *  3. sinon → back() : dépile un cran, et ferme le panneau si la pile est à un.
 * Focus : mémorisé à l'ouverture, déplacé sur le conteneur (à l'ouverture ET à
 * chaque changement de sommet de pile, sauf si un champ autoFocus l'a déjà
 * pris), restauré au déclencheur à la fermeture.
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
  const { stack, top, back } = usePanel()
  const canGoBack = stack.length > 1
  // Clé stable du sommet : re-déclenche le focus du conteneur à chaque navigation.
  const topKey = top
    ? top.type === 'task'
      ? `task:${top.id}`
      : top.type === 'section'
        ? `section:${top.key}`
        : `create:${top.section}`
    : ''

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 1. Popup Base UI ouvert : lui laisser consommer l'Escape.
      if (document.querySelector('[role="listbox"]')) return
      const el = document.activeElement as HTMLElement | null
      // 2. Champ actif du panneau : blur d'abord (sauvegarde), pas de remontée.
      if (
        el &&
        asideRef.current?.contains(el) &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      ) {
        e.preventDefault()
        el.blur()
        return
      }
      // 3. Ne dépile QUE si le focus est dans le panneau (#118) : un Esc frappé
      //    depuis un champ hors panneau fermait le panneau hors du champ de vision.
      if (!asideRef.current?.contains(el)) return
      e.preventDefault()
      back()
    }
    // Capture : on s'exécute avant les listeners Base UI (popup encore monté).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [back])

  // Mémorise le déclencheur à l'ouverture, le restaure à la fermeture — sauf s'il
  // a été démonté entre-temps (tâche supprimée/archivée : isConnected, #118).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    return () => { if (trigger?.isConnected) trigger.focus?.() }
  }, [])

  // Focus sur le conteneur à l'ouverture ET à chaque changement de sommet de
  // pile — sauf si un champ autoFocus du contenu a déjà pris le focus.
  useEffect(() => {
    if (asideRef.current && !asideRef.current.contains(document.activeElement)) {
      asideRef.current.focus()
    }
  }, [topKey])

  return (
    <aside
      ref={asideRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className="flex w-[380px] shrink-0 flex-col border-l border-neutral-200 bg-white focus:outline-none"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={back}
              aria-label="Retour"
              className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <h2 className="truncate text-sm font-semibold tracking-tight text-neutral-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau"
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <Cross size={13} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  )
}
