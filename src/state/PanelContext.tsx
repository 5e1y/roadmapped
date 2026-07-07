import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type PanelTarget =
  | { kind: 'task'; id: number }
  | { kind: 'create-task'; section: string }
  | { kind: 'section'; dir: string }
  | null

export interface PanelState {
  target: PanelTarget
  openTask: (id: number) => void
  openCreateTask: (section: string) => void
  openSection: (dir: string) => void
  close: () => void
}

const PanelContext = createContext<PanelState | null>(null)

export function PanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PanelTarget>(null)
  const openTask = useCallback((id: number) => setTarget({ kind: 'task', id }), [])
  const openCreateTask = useCallback((section: string) => setTarget({ kind: 'create-task', section }), [])
  const openSection = useCallback((dir: string) => setTarget({ kind: 'section', dir }), [])
  const close = useCallback(() => setTarget(null), [])
  return (
    <PanelContext.Provider value={{ target, openTask, openCreateTask, openSection, close }}>
      {children}
    </PanelContext.Provider>
  )
}

export function usePanel(): PanelState {
  const ctx = useContext(PanelContext)
  if (!ctx) throw new Error('usePanel doit être utilisé dans <PanelProvider>')
  return ctx
}
