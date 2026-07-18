import { useEffect, useState } from 'react'
import { TreeProvider, useTree } from './state/TreeContext'
import { PanelProvider, usePanel, isDualStack, type PanelEntry } from './state/PanelContext'
import { ViewProvider, type View } from './state/ViewContext'
import { KbProvider } from './state/KbContext'
import { SidePanel } from './components/SidePanel'
import { NavRail } from './components/NavRail'
import { Backlog } from './components/Backlog'
import { TaskPanel } from './components/TaskPanel'
import { KbNodePanel } from './components/KbNodePanel'
import { CreateTaskPanel, SectionPanel } from './components/SectionPanel'
import { RoadmapView } from './components/RoadmapView'
import { DependenciesView } from './components/DependenciesView'
import { GraphView } from './components/GraphView'
import { DocsView } from './components/DocsView'
import { NotepadView } from './components/NotepadView'
import { LiveActivityProvider } from './state/LiveActivity'
import { OPEN_DOC_EVENT } from './lib/events'

function MainView({ view, docPath, onSelectDoc, epicFilter, onEpicFilter }: {
  view: View
  docPath: string | null
  onSelectDoc: (path: string) => void
  // Filtre epic PARTAGÉ Roadmap ↔ Dépendances (#343/#369) — porté par App pour
  // survivre au changement de vue (état de session, pas persisté).
  epicFilter: string | null
  onEpicFilter: (slug: string | null) => void
}) {
  if (view === 'backlog') return <Backlog />
  if (view === 'roadmap') return <RoadmapView epicFilter={epicFilter} onEpicFilter={onEpicFilter} />
  if (view === 'dependencies') return <DependenciesView epicFilter={epicFilter} onEpicFilter={onEpicFilter} />
  if (view === 'graph') return <GraphView />
  if (view === 'notepad') return <NotepadView />
  return <DocsView path={docPath} onSelectDoc={onSelectDoc} />
}

/** Titre d'en-tête d'un cran de pile. */
function entryTitle(entry: PanelEntry): string {
  if (entry.type === 'task') return `Task #${entry.id}`
  if (entry.type === 'create-task') return 'New task'
  if (entry.type === 'kb-node') return 'Knowledge node'
  return 'Section'
}

/** Clé stable d'un cran : re-déclenche le focus du SidePanel quand elle change. */
function entryKey(entry: PanelEntry): string {
  if (entry.type === 'task') return `task:${entry.id}`
  if (entry.type === 'create-task') return `create:${entry.section}`
  if (entry.type === 'kb-node') return `kb-node:${entry.nodeId}`
  return `section:${entry.key}`
}

/** Contenu d'un cran. key : les champs sont non contrôlés (defaultValue) —
    sans remontage le panneau garderait les valeurs du cran précédent. */
function entryContent(entry: PanelEntry) {
  if (entry.type === 'task') return <TaskPanel key={entry.id} id={entry.id} />
  if (entry.type === 'create-task') return <CreateTaskPanel key={entry.section} section={entry.section} />
  if (entry.type === 'kb-node') return <KbNodePanel key={entry.nodeId} nodeId={entry.nodeId} />
  return <SectionPanel key={entry.key} dir={entry.key} />
}

/**
 * Panneau(x) à droite de <main>. Mode simple : UN SidePanel rend le sommet de
 * pile, comme toujours. Mode DOUBLE (#313, pile = [.., kb-node, task]) : DEUX
 * SidePanel côte à côte — l'inspecteur de nœud à GAUCHE (rendu en premier), le
 * ticket ouvert depuis lui à DROITE. Les keys sont stables ("panel" pour le
 * panneau persistant, "panel-task" pour celui de droite) : le panneau de
 * gauche garde son instance — donc son scroll et son déclencheur de focus —
 * en entrant/sortant du mode double.
 *
 * Fermetures en mode double : ✕/←/Esc du ticket (droite, primaire) → back()
 * dépile le task, retour au nœud seul ; ✕ du nœud (gauche) → close() tout.
 */
function PanelHost() {
  const { stack, top, back, close } = usePanel()
  if (!top) return null

  const dual = isDualStack(stack)
  // Cran du panneau persistant : le sommet, ou le kb-node sous le task en mode double.
  const main = dual ? stack[stack.length - 2] : top

  return (
    <>
      <SidePanel
        key="panel"
        title={entryTitle(main)}
        focusKey={entryKey(main)}
        primary={!dual}
        onClose={close}
        onBack={!dual && stack.length > 1 ? back : undefined}
        onEscape={back}
      >
        {entryContent(main)}
      </SidePanel>
      {dual && (
        <SidePanel
          key="panel-task"
          title={entryTitle(top)}
          focusKey={entryKey(top)}
          onClose={back}
          onBack={back}
        >
          {entryContent(top)}
        </SidePanel>
      )}
    </>
  )
}

function Shell() {
  // Vue + doc ouvert persistés (localStorage) : un rechargement revient là où on
  // était, plus systématiquement au Backlog. (localStorage plutôt que le hash
  // d'URL, qui entrerait en conflit avec les ancres #heading des docs.)
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem('nav:view')
      const known: View[] = ['backlog', 'roadmap', 'dependencies', 'graph', 'docs', 'notepad']
      if (known.includes(v as View)) return v as View
    } catch { /* localStorage indisponible */ }
    return 'backlog'
  })
  // Filtre epic PARTAGÉ Roadmap ↔ Dépendances (#369) : porté ici pour survivre au
  // changement de vue (session, pas persisté — un filtre de lecture).
  const [epicFilter, setEpicFilter] = useState<string | null>(null)
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

  // Titre d'onglet = repo · vue courante (ou nom du doc ouvert). Le repo en tête
  // (#204) distingue les onglets quand plusieurs dashboards sont ouverts.
  const { repoName } = useTree()
  useEffect(() => {
    const name =
      view === 'docs' && docPath ? docPath.split('/').pop()!.replace(/\.md$/, '')
      : view === 'roadmap' ? 'Roadmap'
      : view === 'dependencies' ? 'Dependencies'
      : view === 'graph' ? 'Graph'
      : view === 'docs' ? 'Docs'
      : view === 'notepad' ? 'Notepad'
      : 'Backlog'
    document.title = repoName ? `${repoName} · ${name} · Roadmapped` : `${name} · Roadmapped`
  }, [view, docPath, repoName])

  // Compteur d'usage local (#345) : quelle vue sert vraiment. Fire-and-forget,
  // silencieux en cas d'échec — jamais bloquant pour la navigation.
  useEffect(() => {
    fetch('/api/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: view }),
    }).catch(() => { /* silencieux */ })
  }, [view])

  return (
    // ViewProvider enveloppe TOUTE la rangée : le NavRail (flanc gauche) comme la
    // zone de vue consomment useView. Le rail vertical d'icônes (#370) remplace les
    // tabs du header ; la vue occupe le reste ; le(s) panneau(x) restent à droite.
    <ViewProvider view={view} setView={setView}>
      <div className="flex h-screen w-screen overflow-hidden">
        <NavRail />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <MainView view={view} docPath={docPath} onSelectDoc={setDocPath} epicFilter={epicFilter} onEpicFilter={setEpicFilter} />
        </main>
        <PanelHost />
      </div>
    </ViewProvider>
  )
}

export default function App() {
  return (
    <TreeProvider>
      <PanelProvider>
        {/* Live updates V2 (#205) : l'état du panneau Activity (log, non-lus,
            ouverture) vit au-dessus de Shell — il survit aux remontages de
            ViewHeader (une instance par vue). Le déclencheur, lui, est rendu
            par ViewHeader (LiveActivityMenu). */}
        <KbProvider>
          <LiveActivityProvider>
            <Shell />
          </LiveActivityProvider>
        </KbProvider>
      </PanelProvider>
    </TreeProvider>
  )
}
