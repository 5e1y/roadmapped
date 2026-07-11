import { useKbGraph } from '../state/useKbGraph'
import { KbGraph } from './KbGraph'
import { ErrorBanner } from './ui'
import { relativeTime, absoluteDate } from '../lib/relativeTime'

/**
 * Corps du sous-onglet « Knowledge base » (#kb) de la Vue Docs. Le dashboard LIT
 * `graphify-out/graph.json` (l'agent le génère via `/graphify`) — d'où un empty
 * state PÉDAGOGIQUE tant qu'il n'existe pas, plutôt qu'un écran muet.
 */
export function KbView() {
  const { graph, loading, error } = useKbGraph()

  if (loading && !graph) {
    return <div className="mx-auto max-w-2xl px-6 py-8 text-sm text-neutral-500">Chargement…</div>
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">graph.json illisible</h1>
        <p className="mt-1 text-sm text-neutral-500">Régénère le graphe avec <code className="font-mono">/graphify .</code>.</p>
        <div className="mt-3"><ErrorBanner errors={[error]} /></div>
      </div>
    )
  }

  // Graphe pas encore généré : mode d'emploi, pas d'écran vide.
  if (!graph) return <EmptyState />

  if (graph.nodes.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Graphe vide</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Le corpus détecté ne contenait rien d'extractible. Relance <code className="font-mono">/graphify .</code> à la racine du repo.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Stats + fraîcheur (le meta du header reste au chemin de doc, mode documents). */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-1.5 font-mono text-[11px] text-neutral-500">
        <span>{graph.stats.nodes} nodes · {graph.stats.edges} edges · {graph.stats.communities} communities</span>
        {graph.generatedAt && (
          <span className="ml-auto" title={absoluteDate(graph.generatedAt)}>générée {relativeTime(graph.generatedAt)}</span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <KbGraph graph={graph} />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Knowledge base — pas encore générée</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Le graphe se construit avec Graphify (open source, MIT), depuis Claude Code :
      </p>
      <pre className="mt-3 overflow-x-auto border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-700">
{`pip install graphifyy && graphify install   # une fois
/graphify .                                 # dans Claude Code, à la racine`}
      </pre>
      <p className="mt-3 text-sm text-neutral-500">
        Le dashboard lira <code className="font-mono">graphify-out/graph.json</code> automatiquement.
      </p>
      <a
        href="https://github.com/Graphify-Labs/graphify"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 self-start rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:bg-neutral-100"
      >
        En savoir plus sur Graphify ↗
      </a>
    </div>
  )
}
