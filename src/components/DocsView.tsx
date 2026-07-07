import { useEffect, useState } from 'react'
import { marked } from 'marked'

/** Vue principale de la Vue Docs : rendu markdown en lecture seule d'un fichier sélectionné dans l'arbre. */
export function DocsView({ path }: { path: string | null }) {
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

  if (!path) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Sélectionne un document
      </div>
    )
  }

  if (loading) {
    return <div className="px-6 py-14 text-sm text-neutral-500">Chargement…</div>
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
      <div className="doc-prose" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
