import { useEffect, useState, type MouseEvent } from 'react'
import { renderMarkdown } from './Markdown'
import { ViewHeader } from './ViewHeader'
import { DocsTree } from './DocsTree'
import { ErrorBanner } from './ui'
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
        <div className="flex w-[420px] shrink-0 flex-col border-r border-neutral-200 bg-white py-2">
          <div className="shrink-0 px-4 pb-1.5 text-[11px] font-medium text-neutral-500">Fichiers</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {docs.loading && !docs.tree && <p className="px-4 text-xs text-neutral-500">Chargement…</p>}
            {/* Registre d'erreur canonique (ErrorBanner, role=alert) — plus de boîte ad hoc. */}
            {docs.loadError && (
              <div className="mx-4">
                <ErrorBanner errors={[`Chargement impossible : ${docs.loadError}`]} />
              </div>
            )}
            {docs.tree && docs.tree.length === 0 && <p className="px-4 text-xs text-neutral-500">Aucun document .md.</p>}
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
    return shell(
      <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        Sélectionne un document
      </div>,
    )
  }

  if (loading) {
    // Même gabarit que le contenu : la zone de lecture ne se déplace pas au chargement.
    return shell(<div className="mx-auto max-w-3xl px-6 py-8 text-sm text-neutral-500">Chargement…</div>)
  }

  if (error) {
    return shell(
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-neutral-500">Impossible de charger ce document.</p>
        <p className="text-xs text-neutral-500">{error}</p>
      </div>,
    )
  }

  // dangerouslySetInnerHTML : contenu markdown LOCAL de l'utilisateur (docs/ du
  // repo), rendu par un outil localhost sans multi-utilisateurs ni contenu
  // distant — pas de surface XSS pertinente pour ce lecteur en lecture seule.
  const html = renderMarkdown(content ?? '')
  return shell(
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="doc-prose" onClick={onProseClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>,
  )
}
