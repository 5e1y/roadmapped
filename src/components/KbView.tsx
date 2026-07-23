import { useMemo, useState } from 'react'
import { EyeOpen, EyeClosed } from 'trinil-react'
import { useKb } from '../state/KbContext'
import { KbGraph, GraphifyMark } from './KbGraph'
import { KbDisplayMenu } from './KbDisplayMenu'
import { FilterMenu } from './ViewHeader'
import { EmptyState, ErrorBanner, TogglePill } from './ui'
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
    return <div className="mx-auto max-w-2xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))] text-sm text-textsoft">Loading…</div>
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
        <h1 className="text-lg font-semibold tracking-tight text-texthard">graph.json unreadable</h1>
        <p className="mt-xs text-sm text-textsoft">Regenerate the graph with <code className="font-mono">/graphify .</code>.</p>
        <div className="mt-m"><ErrorBanner errors={[error]} /></div>
      </div>
    )
  }

  if (!graph) return <KbHero />

  if (graph.nodes.length === 0) {
    return (
      <EmptyState
        className="h-full"
        title="Empty graph"
        hint={<>The detected corpus had nothing extractable. Re-run <code className="font-mono">/graphify .</code> at the repo root.</>}
      />
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
      <div className="flex shrink-0 flex-wrap items-center gap-s shadow-[inset_0_-1px_0_var(--color-border)] bg-foreground px-l py-s">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          aria-label="Search knowledge base nodes"
          className="min-w-0 flex-1 max-w-64 appearance-none rounded-interactive ring-1 ring-inset ring-border bg-foreground px-m py-xs text-xs text-texthard placeholder:text-textsoft"
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
        <TogglePill
          active={hideInferred}
          onClick={() => setHideInferred((v) => !v)}
          title={hideInferred ? 'Show inferred edges' : 'Hide inferred edges'}
        >
          {hideInferred ? <EyeClosed size={12} /> : <EyeOpen size={12} />}
          inferred
        </TogglePill>
        {/* Réglages d'affichage (#318) : params de la sim de forces, live +
            persistés (ui:kb-graph-params) — pill accent quand customisés. */}
        <KbDisplayMenu />

        <div className="ml-auto flex items-center gap-m font-mono text-[11px] text-textsoft">
          {stale && (
            // Badge INERTE (#380) : registre neutre, PAS le costume accent d'un toggle
            // enclenché — c'est un avertissement statique, pas un contrôle actif.
            <span className="rounded-interactive ring-1 ring-inset ring-border bg-background px-s py-xs text-textsoft" title="The corpus changed since generation — run /graphify --update">
              maybe stale
            </span>
          )}
          <span>{graph.stats.nodes} nodes · {graph.stats.edges} edges · {graph.stats.communities} communities</span>
          {graph.generatedAt && (
            <span title={absoluteDate(graph.generatedAt)}>built {relativeTime(graph.generatedAt)}</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <KbGraph graph={graph} filters={filters} query={query} />
      </div>
    </div>
  )
}

/**
 * Héro d'ONBOARDING (cas à part assumé, design.md §4 M1) : le graphe n'existe pas
 * encore → pédagogie (logo + commande d'installation + lien). Distinct de la
 * primitive `EmptyState` partagée — ici on guide, on ne signale pas juste un vide.
 */
function KbHero() {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
      <div className="mb-m">
        <GraphifyMark size={28} />
      </div>
      <h1 className="text-lg font-semibold tracking-tight text-texthard">Knowledge base — not generated yet</h1>
      <p className="mt-s text-sm text-textsoft">
        The graph is built with Graphify (open source, MIT), from Claude Code:
      </p>
      <pre className="mt-m overflow-x-auto ring-1 ring-inset ring-border bg-background px-m py-s font-mono text-xs text-texthard">
{`pip install graphifyy && graphify install   # once
/graphify .                                 # in Claude Code, at the root`}
      </pre>
      <p className="mt-m text-sm text-textsoft">
        The dashboard will read <code className="font-mono">graphify-out/graph.json</code> automatically.
      </p>
      <a
        href="https://github.com/Graphify-Labs/graphify"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-m self-start rounded-interactive ring-1 ring-inset ring-border bg-foreground px-m py-xs text-xs text-textsoft transition-colors hover:bg-rollover"
      >
        Learn more about Graphify ↗
      </a>
    </div>
  )
}
