import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowLeft, Cross } from 'trinil-react'

/**
 * Coquille d'un panneau latéral droit : largeur fixe 380px, fond blanc, filet
 * à gauche. Entièrement pilotée par PROPS (découplée de PanelContext, #313) :
 * PanelHost peut en rendre DEUX côte à côte (mode double kb-node + task) sans
 * qu'elles se marchent dessus.
 *
 * - `onClose` : le ✕ de l'en-tête.
 * - `onBack` : le ← de l'en-tête (absent = pas de flèche).
 * - Esc en cascade, en phase de CAPTURE (on passe avant Base UI, donc le popup
 *   éventuel est encore monté quand on décide) :
 *    1. un popup Base UI (Select/Combobox, role=listbox) est ouvert → on ne
 *       fait rien, Base UI le referme lui-même ;
 *    2. un champ DE CE panneau a le focus → Esc = blur (ce qui déclenche la
 *       sauvegarde au blur) SANS remonter — la saisie n'est jamais perdue ;
 *    3. le focus est dans CE panneau (#118) → `onEscape` (défaut :
 *       onBack ?? onClose). En mode double, PanelHost passe `back` aux DEUX
 *       panneaux : Esc vise toujours le panneau primaire (le ticket de droite).
 * - `primary` (défaut true) : seul le panneau primaire capte le focus sur son
 *   conteneur (à l'ouverture ET à chaque changement de `focusKey`, sauf si un
 *   champ autoFocus l'a déjà pris). Le déclencheur d'ouverture est mémorisé au
 *   montage et restauré au démontage (sauf s'il a disparu : isConnected, #118).
 */
export function SidePanel({
  title,
  focusKey,
  onClose,
  onBack,
  onEscape,
  primary = true,
  children,
}: {
  title: string
  /** Clé stable du cran rendu : re-déclenche le focus du conteneur quand elle change. */
  focusKey: string
  onClose: () => void
  onBack?: () => void
  /** Cible de l'étape 3 d'Esc. Défaut : onBack ?? onClose. */
  onEscape?: () => void
  primary?: boolean
  children: ReactNode
}) {
  const asideRef = useRef<HTMLElement>(null)
  const escape = onEscape ?? onBack ?? onClose

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
      // 3. Ne remonte QUE si le focus est dans le panneau (#118) : un Esc frappé
      //    depuis un champ hors panneau fermait le panneau hors du champ de vision.
      if (!asideRef.current?.contains(el)) return
      e.preventDefault()
      escape()
    }
    // Capture : on s'exécute avant les listeners Base UI (popup encore monté).
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [escape])

  // Mémorise le déclencheur à l'ouverture, le restaure à la fermeture — sauf s'il
  // a été démonté entre-temps (tâche supprimée : isConnected, #118).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    return () => { if (trigger?.isConnected) trigger.focus?.() }
  }, [])

  // Focus sur le conteneur à l'ouverture ET à chaque changement de cran rendu
  // (focusKey) — sauf si un champ autoFocus du contenu a déjà pris le focus.
  // Seul le panneau PRIMAIRE capte le focus (en mode double : le ticket de
  // droite ; puis le nœud quand il redevient seul).
  useEffect(() => {
    if (!primary) return
    if (asideRef.current && !asideRef.current.contains(document.activeElement)) {
      asideRef.current.focus()
    }
  }, [focusKey, primary])

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
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
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
          aria-label="Close panel"
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
          <Cross size={13} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </aside>
  )
}
