import { marked } from 'marked'

/** Slug ASCII d'un titre (pour les id d'ancrage des headings). */
const slugify = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Headings dotés d'un id stable = les ancres `#slug` du markdown deviennent
// cliquables (scroll interne). Configuré une seule fois au chargement du module
// — partagé entre la Vue Docs et le rendu du détail de tâche (TaskPanel).
marked.use({
  renderer: {
    heading(token) {
      const t = token as unknown as { tokens: unknown[]; depth: number; text: string }
      const self = this as unknown as { parser: { parseInline: (tokens: unknown[]) => string } }
      return `<h${t.depth} id="${slugify(t.text)}">${self.parser.parseInline(t.tokens)}</h${t.depth}>\n`
    },
  },
})

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false }) as string
}

/**
 * Rendu markdown lecture seule avec la typographie `.doc-prose` (index.css).
 * dangerouslySetInnerHTML : contenu markdown LOCAL de l'utilisateur (repo),
 * rendu par un outil localhost mono-utilisateur — pas de surface XSS pertinente.
 */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  return (
    <div
      className={`doc-prose ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  )
}
