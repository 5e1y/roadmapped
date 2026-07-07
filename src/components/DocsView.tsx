import { useEffect, useState, type MouseEvent } from 'react'
import { marked } from 'marked'

/** Slug ASCII d'un titre (pour les id d'ancrage des headings). */
const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Headings dotés d'un id stable = les ancres `#slug` du markdown deviennent
// cliquables (scroll interne). Configuré une seule fois au chargement du module.
marked.use({
  renderer: {
    heading(token) {
      const t = token as unknown as { tokens: unknown[]; depth: number; text: string }
      const self = this as unknown as { parser: { parseInline: (tokens: unknown[]) => string } }
      return `<h${t.depth} id="${slugify(t.text)}">${self.parser.parseInline(t.tokens)}</h${t.depth}>\n`
    },
  },
})

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

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Sélectionne un document
      </div>
    )
  }

  if (loading) {
    // Même gabarit que le contenu : la zone de lecture ne se déplace pas au chargement.
    return <div className="mx-auto max-w-3xl px-8 py-10 text-sm text-neutral-400">Chargement…</div>
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-neutral-500">Impossible de charger ce document.</p>
        <p className="text-xs text-neutral-400">{error}</p>
      </div>
    )
  }

  // dangerouslySetInnerHTML : contenu markdown LOCAL de l'utilisateur (docs/ du
  // repo), rendu par un outil localhost sans multi-utilisateurs ni contenu
  // distant — pas de surface XSS pertinente pour ce lecteur en lecture seule.
  const html = marked.parse(content ?? '', { async: false })
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="doc-prose" onClick={onProseClick} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
