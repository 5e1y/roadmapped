import { useEffect, useState, type MouseEvent } from 'react'
import { renderMarkdown } from './Markdown'
import { ViewHeader } from './ViewHeader'
import { DocsTree, FLANK_PANE_CLASS } from './DocsTree'
import { EmptyState, ErrorBanner } from './ui'
import { useDocsTree } from '../state/useDocsTree'

/**
 * Résout un lien relatif `.md` (ex. « ../autre.md ») par rapport au document
 * courant, en chemin repo-relatif normalisé pour onSelectDoc. `null` si le lien
 * ne cible pas un `.md`.
 */
function resolveDocLink(base: string, href: string): string | null {
  const clean = href.split('#')[0].split('?')[0]
  if (!clean || !clean.endsWith('.md')) return null
  const parts = base.includes('/') ? base.slice(0, base.lastIndexOf('/')).split('/') : []
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/** Vue principale de la Vue Docs : rendu markdown en lecture seule d'un fichier sélectionné dans l'arbre. */
export function DocsView({ path, onSelectDoc }: { path: string | null; onSelectDoc: (path: string) => void }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Docs = les documents SEULEMENT depuis #369 : le graphe nodal (ex-mode KB) est
  // devenu la vue « Graphe » de 1er niveau (GraphView). Plus de toggle de sous-mode.

  useEffect(() => {
    if (!path) {
      setContent(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    fetch(`/api/docs/content?path=${encodeURIComponent(path)}`)
      .then(async (r) => {
        const data = (await r.json()) as { ok: boolean; content?: string; errors?: string[] }
        if (cancelled) return
        if (!r.ok || data.ok === false) {
          setError(data.errors?.length ? data.errors.join(' · ') : `HTTP ${r.status}`)
          return
        }
        setContent(data.content ?? '')
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  // Délégation des clics sur les liens du markdown rendu :
  //  - `#ancre`      → scroll interne (pas de navigation hors SPA) ;
  //  - `…/x.md`      → ouverture du doc dans la Vue Docs ;
  //  - `http(s)://…` → laissé passer, mais forcé en nouvel onglet sécurisé.
  const onProseClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (href.startsWith('#')) {
      e.preventDefault()
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
      return
    }
    if (path) {
      const resolved = resolveDocLink(path, href)
      if (resolved) {
        e.preventDefault()
        onSelectDoc(resolved)
      } else if (!href.includes(':')) {
        // Lien relatif non-.md : ne pas naviguer hors SPA (ancre morte évitée).
        e.preventDefault()
      }
    }
  }

  const docs = useDocsTree()

  // Arbre des fichiers en FLANC GAUCHE (même gabarit que le radar du Backlog) —
  // la sidebar n'existe plus (décision Rémi).
  const shell = (body: React.ReactNode) => (
    // Tri-couche (design.md §3.1) : la racine hérite du #fafafa du body ;
    // le flanc gauche est une surface « carte » bg-white (modèle radar Backlog).
    <div className="flex h-full flex-col">
      <ViewHeader meta={path ?? undefined} />
      <div className="flex min-h-0 flex-1">
        <div className={FLANK_PANE_CLASS}>
          {/* Retrait du header = celui du CONTENU des lignes en dessous (#432, mesuré
              au rendu) : les rangées vivent dans `.rm-list.rm-nest` qui ajoute un
              padding --spacing-listgap (0 en thème de base — inchangé ; 6-8px en
              thèmes « cartes » où le px-l seul laissait le header désaligné de
              tout). l + listgap = le bord gauche exact de la gouttière des lignes. */}
          <div className="shrink-0 px-[calc(var(--spacing-l)+var(--spacing-listgap))] pb-s text-[11px] font-medium text-textsoft">Files</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.loading && !docs.tree && <p className="px-l text-xs text-textsoft">Loading…</p>}
            {/* Registre d'erreur canonique (ErrorBanner, role=alert) — plus de boîte ad hoc. */}
            {docs.loadError && (
              <div className="mx-l">
                <ErrorBanner errors={[`Couldn’t load: ${docs.loadError}`]} />
              </div>
            )}
            {docs.tree && docs.tree.length === 0 && <EmptyState className="py-xl" title="No .md document" />}
            {docs.tree && docs.tree.length > 0 && (
              <DocsTree nodes={docs.tree} docPath={path} onSelectDoc={onSelectDoc} />
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
    </div>
  )

  if (!path) {
    return shell(<EmptyState className="h-full" title="Select a document" />)
  }

  if (loading) {
    // Même gabarit que le contenu : la zone de lecture ne se déplace pas au chargement.
    return shell(<div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))] text-sm text-textsoft">Loading…</div>)
  }

  if (error) {
    return shell(
      <div className="flex h-full flex-col items-center justify-center gap-s px-xl text-center">
        <p className="text-sm text-textsoft">Couldn’t load this document.</p>
        <p className="text-xs text-textsoft">{error}</p>
      </div>,
    )
  }

  // dangerouslySetInnerHTML : un `docs/*.md` peut venir d'un repo tiers cloné ou
  // être écrit par un agent depuis une entrée non fiable → surface XSS réelle
  // (#359). `renderMarkdown` sanitise la sortie de marked via DOMPurify avant
  // injection (point unique partagé avec le rendu du détail de tâche).
  const html = renderMarkdown(content ?? '')
  return shell(
    <div className="mx-auto max-w-3xl px-xl py-[calc(var(--spacing-xl)+var(--spacing-s))]">
      <div className="doc-prose" onClick={onProseClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
  )
}
