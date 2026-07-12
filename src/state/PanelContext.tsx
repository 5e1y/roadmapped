import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

/**
 * Un cran de la pile de navigation du panneau. Naviguer d'une tâche vers une
 * tâche liée EMPILE ; ← / Esc DÉPILENT avant de fermer (voir SidePanel).
 */
export type PanelEntry =
  | { type: 'task'; id: number }
  | { type: 'create-task'; section: string }
  | { type: 'section'; key: string }
  | { type: 'kb-node'; nodeId: string }

/**
 * Cible courante « à plat » (le sommet de la pile), discriminée par `kind`.
 * Conservée pour les consommateurs existants (App, TaskRow) — dérivée de `top`.
 */
export type PanelTarget =
  | { kind: 'task'; id: number }
  | { kind: 'create-task'; section: string }
  | { kind: 'section'; dir: string }
  | { kind: 'kb-node'; nodeId: string }
  | null

export interface PanelState {
  /** Pile de navigation. Vide = panneau fermé ; le dernier cran est affiché. */
  stack: PanelEntry[]
  /** Dernier cran de la pile, ou null si le panneau est fermé. */
  top: PanelEntry | null
  /** Compat : le sommet de la pile en forme « à plat » (kind). */
  target: PanelTarget
  openTask: (id: number) => void
  openCreateTask: (section: string) => void
  openSection: (key: string) => void
  /** Ouvre l'inspecteur d'un nœud de la Knowledge base (#kb). */
  openKbNode: (nodeId: string) => void
  /** Dépile un cran ; si la pile n'en a qu'un, ferme le panneau. */
  back: () => void
  /** Vide la pile (ferme le panneau). */
  close: () => void
}

const PanelContext = createContext<PanelState | null>(null)

function sameEntry(a: PanelEntry, b: PanelEntry): boolean {
  if (a.type === 'task' && b.type === 'task') return a.id === b.id
  if (a.type === 'section' && b.type === 'section') return a.key === b.key
  if (a.type === 'create-task' && b.type === 'create-task') return a.section === b.section
  if (a.type === 'kb-node' && b.type === 'kb-node') return a.nodeId === b.nodeId
  return false
}

/**
 * Mode double (#313) : un task ouvert DEPUIS un kb-node — le cran sous le
 * sommet est un kb-node et le sommet est un task. PanelHost rend alors DEUX
 * panneaux côte à côte : l'inspecteur de nœud à gauche, le ticket à droite.
 */
export function isDualStack(stack: PanelEntry[]): boolean {
  return (
    stack.length >= 2 &&
    stack[stack.length - 1].type === 'task' &&
    stack[stack.length - 2].type === 'kb-node'
  )
}

/**
 * Transition de pile pour une ouverture (pure, testée) :
 *  - pile vide → initialise ;
 *  - cran identique au sommet → no-op (double-clic, relance) ;
 *  - task poussé en mode double → REMPLACE le task de droite (#313), le nœud
 *    reste à gauche — pas d'empilement en profondeur ;
 *  - sinon → empile.
 */
export function pushEntry(stack: PanelEntry[], entry: PanelEntry): PanelEntry[] {
  if (stack.length === 0) return [entry]
  if (sameEntry(stack[stack.length - 1], entry)) return stack
  if (entry.type === 'task' && isDualStack(stack)) return [...stack.slice(0, -1), entry]
  return [...stack, entry]
}

function toTarget(top: PanelEntry | null): PanelTarget {
  if (top === null) return null
  if (top.type === 'task') return { kind: 'task', id: top.id }
  if (top.type === 'create-task') return { kind: 'create-task', section: top.section }
  if (top.type === 'kb-node') return { kind: 'kb-node', nodeId: top.nodeId }
  return { kind: 'section', dir: top.key }
}

export function PanelProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<PanelEntry[]>([])

  // Empile le cran quand le panneau est déjà ouvert ; l'initialise sinon.
  // No-op si le cran demandé est déjà au sommet ; remplace le task de droite
  // en mode double — toute la logique vit dans pushEntry (pure, testée).
  const push = useCallback((entry: PanelEntry) => {
    setStack((prev) => pushEntry(prev, entry))
  }, [])

  const openTask = useCallback((id: number) => push({ type: 'task', id }), [push])
  const openCreateTask = useCallback((section: string) => push({ type: 'create-task', section }), [push])
  const openSection = useCallback((key: string) => push({ type: 'section', key }), [push])
  const openKbNode = useCallback((nodeId: string) => push({ type: 'kb-node', nodeId }), [push])
  const back = useCallback(() => setStack((prev) => (prev.length <= 1 ? [] : prev.slice(0, -1))), [])
  const close = useCallback(() => setStack([]), [])

  const value = useMemo<PanelState>(() => {
    const top = stack.length ? stack[stack.length - 1] : null
    return { stack, top, target: toTarget(top), openTask, openCreateTask, openSection, openKbNode, back, close }
  }, [stack, openTask, openCreateTask, openSection, openKbNode, back, close])

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>
}

export function usePanel(): PanelState {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel doit être utilisé dans <PanelProvider>')
  return ctx
}
