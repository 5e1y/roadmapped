import { useEffect, useState } from 'react'
import { TreeProvider } from './state/TreeContext'
import { PanelProvider, usePanel } from './state/PanelContext'
import { ViewProvider, type View } from './state/ViewContext'
import { SidePanel } from './components/SidePanel'
import { Backlog } from './components/Backlog'
import { TaskPanel } from './components/TaskPanel'
import { CreateTaskPanel, SectionPanel } from './components/SectionPanel'
import { RoadmapView } from './components/RoadmapView'
import { DocsView } from './components/DocsView'
import { NotepadView } from './components/NotepadView'
import { OPEN_DOC_EVENT } from './lib/events'

function MainView({ view, docPath, onSelectDoc }: {
  view: View
  docPath: string | null
  onSelectDoc: (path: string) => void
}) {
  if (view === 'backlog') return <Backlog />
  if (view === 'roadmap') return <RoadmapView />
  if (view === 'notepad') return <NotepadView />
  return <DocsView path={docPath} onSelectDoc={onSelectDoc} />
}

function PanelHost() {
  const { target, close } = usePanel()
  if (!target) return null
  if (target.kind === 'task') {
    return (
      <SidePanel title={`Task #${target.id}`} onClose={close}>
        {/* key : les champs sont non contrôlés (defaultValue) — sans remontage
            le panneau garderait les valeurs de la tâche précédente. */}
        <TaskPanel key={target.id} id={target.id} />
      </SidePanel>
    )
  }
  if (target.kind === 'create-task') {
    return (
      <SidePanel title="New task" onClose={close}>
        <CreateTaskPanel key={target.section} section={target.section} />
      </SidePanel>
    )
  }
  return (
    <SidePanel title="Section" onClose={close}>
      <SectionPanel key={target.dir} dir={target.dir} />
    </SidePanel>
  )
}

function Shell() {
  // Vue + doc ouvert persistés (localStorage) : un rechargement revient là où on
  // était, plus systématiquement au Backlog. (localStorage plutôt que le hash
  // d'URL, qui entrerait en conflit avec les ancres #heading des docs.)
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem('nav:view')
      if (v === 'backlog' || v === 'roadmap' || v === 'docs' || v === 'notepad') return v
    } catch { /* localStorage indisponible */ }
    return 'backlog'
  })
  const [docPath, setDocPath] = useState<string | null>(() => {
    try { return localStorage.getItem('nav:doc') } catch { return null }
  })

  useEffect(() => { try { localStorage.setItem('nav:view', view) } catch { /* ignore */ } }, [view])
  // #138 — hygiène one-shot : la clé du toggle « grouper par epic » (retiré en
  // #135) n'est plus ni lue ni écrite, mais traîne dans les localStorage existants.
  useEffect(() => { try { localStorage.removeItem('backlog:groupByEpic') } catch { /* ignore */ } }, [])
  useEffect(() => {
    try {
      if (docPath) localStorage.setItem('nav:doc', docPath)
      else localStorage.removeItem('nav:doc')
    } catch { /* ignore */ }
  }, [docPath])

  // Navigation refs → Vue Docs depuis le panneau de tâche (spec task-panel §5).
  // Événement plutôt que du prop-drilling : l'état vue/doc vit ici, le panneau
  // est monté ailleurs dans l'arbre.
  useEffect(() => {
    const onOpenDoc = (e: Event) => {
      const path = (e as CustomEvent<string>).detail
      if (typeof path !== 'string' || !path) return
      setDocPath(path)
      setView('docs')
    }
    window.addEventListener(OPEN_DOC_EVENT, onOpenDoc)
    return () => window.removeEventListener(OPEN_DOC_EVENT, onOpenDoc)
  }, [])

  // Titre d'onglet = vue courante (ou nom du doc ouvert).
  useEffect(() => {
    const name =
      view === 'docs' && docPath ? docPath.split('/').pop()!.replace(/\.md$/, '')
      : view === 'roadmap' ? 'Roadmap'
      : view === 'docs' ? 'Docs'
      : view === 'notepad' ? 'Notepad'
      : 'Backlog'
    document.title = `${name} · Roadmapped`
  }, [view, docPath])

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Plus de sidebar : les tabs vivent dans le header commun (ViewHeader). */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <ViewProvider view={view} setView={setView}>
          <MainView view={view} docPath={docPath} onSelectDoc={setDocPath} />
        </ViewProvider>
      </main>
      <PanelHost />
    </div>
  )
}

export default function App() {
  return (
    <TreeProvider>
      <PanelProvider>
        <Shell />
      </PanelProvider>
    </TreeProvider>
  )
}
