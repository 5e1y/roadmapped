import { useState } from 'react'
import { TreeProvider } from './state/TreeContext'
import { PanelProvider, usePanel } from './state/PanelContext'
import { Sidebar, type View } from './components/Sidebar'
import { SidePanel } from './components/SidePanel'
import { Backlog } from './components/Backlog'
import { TaskPanel } from './components/TaskPanel'
import { CreateTaskPanel, SectionPanel } from './components/SectionPanel'
import { RoadmapView } from './components/RoadmapView'
import { DocsView } from './components/DocsView'

function MainView({ view, docPath }: {
  view: View
  docPath: string | null
}) {
  if (view === 'backlog') return <Backlog />
  if (view === 'roadmap') return <RoadmapView />
  return <DocsView path={docPath} />
}

function PanelHost() {
  const { target, close } = usePanel()
  if (!target) return null
  if (target.kind === 'task') {
    return (
      <SidePanel title={`Tâche #${target.id}`} onClose={close}>
        {/* key : les champs sont non contrôlés (defaultValue) — sans remontage
            le panneau garderait les valeurs de la tâche précédente. */}
        <TaskPanel key={target.id} id={target.id} />
      </SidePanel>
    )
  }
  if (target.kind === 'create-task') {
    return (
      <SidePanel title="Nouvelle tâche" onClose={close}>
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
  const [view, setView] = useState<View>('backlog')
  const [docPath, setDocPath] = useState<string | null>(null)
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar view={view} onViewChange={setView} docPath={docPath} onSelectDoc={setDocPath} />
      {/* overflow-y-auto conservé pour le scroll du Backlog ; RoadmapView pose
          h-full et gère son propre scroll interne. */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <MainView view={view} docPath={docPath} />
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
