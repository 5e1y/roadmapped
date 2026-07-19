import { useMemo, useState } from 'react'
import { EyeOpen, EyeClosed } from 'trinil-react'
import { useKb } from '../state/KbContext'
import { KbGraph, GraphifyMark } from './KbGraph'
import { KbDisplayMenu } from './KbDisplayMenu'
import { FilterMenu } from './ViewHeader'
import { ErrorBanner } from './ui'
import { communityOptions, fileTypeOptions, type KbFilters } from '../lib/kbFilter'
import { relativeTime, absoluteDate } from '../lib/relativeTime'

/**
 * Corps du sous-onglet « Knowledge base » (#kb). Le dashboard LIT
 * graphify-out/graph.json (l'agent le génère via `/graphify`) — d'où l'empty
 * state PÉDAGOGIQUE. Phase 2 : barre d'outils (recherche + filtres community /
 * type / arêtes inférées) + chip de fraîcheur, câblés au cache partagé (useKb).
 */
export function KbView() {
  const { graph, loading, error, stale } = useKb()

  // État de vue (session) — recherche + filtres. La communauté est un FILTRE
  // (pas une couleur : DA monochrome + accent préservée).
  const [query, setQuery] = useState('')
  const [communities, setCommunities] = useState<string[]>([])
  const [fileTypes, setFileTypes] = useState<string[]>([])
  const [hideInferred, setHideInferred] = useState(false)

  const communityOpts = useMemo(() => (graph ? communityOptions(graph.nodes, graph.edges) : []), [graph])
  const typeOpts = useMemo(() => (graph ? fileTypeOptions(graph.nodes) : []), [graph])

  if (loading && !graph) {
    return <div className="mx-auto max-w-2xl px-6 py-8 text-sm text-neutral-500">Loading…</div>
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

  const filters: KbFilters = {
    communities: communities.map(Number),
    fileTypes,
    hideInferred,
  }

  return (
    <div className="flex h-full flex-col">
      {/* Barre d'outils KB : recherche à gauche, filtres + stats à droite. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-1.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          aria-label="Search knowledge base nodes"
          className="w-48 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        />
        <FilterMenu
          allLabel="All communities"
          aria-label="Filter by community"
          options={communityOpts}
          selected={communities}
          onChange={setCommunities}
          multiple
        />
        <FilterMenu
          allLabel="All types"
          aria-label="Filter by file type"
          options={typeOpts}
          selected={fileTypes}
          onChange={setFileTypes}
          multiple
        />
        <button
          type="button"
          onClick={() => setHideInferred((v) => !v)}
          aria-pressed={hideInferred}
          title={hideInferred ? 'Show inferred edges' : 'Hide inferred edges'}
          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
            hideInferred ? 'border-accent bg-accent-tint text-neutral-900' : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          {hideInferred ? <EyeClosed size={12} /> : <EyeOpen size={12} />}
          inferred
        </button>
        {/* Réglages d'affichage (#318) : params de la sim de forces, live +
            persistés (ui:kb-graph-params) — pill accent quand customisés. */}
        <KbDisplayMenu />

        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-neutral-500">
          {stale && (
            // Badge INERTE (#380) : registre neutre, PAS le costume accent d'un toggle
            // enclenché — c'est un avertissement statique, pas un contrôle actif.
            <span className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-neutral-600" title="The corpus changed since generation — run /graphify --update">
              maybe stale
            </span>
          )}
          <span>{graph.stats.nodes} nodes · {graph.stats.edges} edges · {graph.stats.communities} communities</span>
          {graph.generatedAt && (
            <span title={absoluteDate(graph.generatedAt)}>générée {relativeTime(graph.generatedAt)}</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <KbGraph graph={graph} filters={filters} query={query} />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6 py-8">
      <div className="mb-3">
        <GraphifyMark size={28} />
      </div>
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
