import { marked } from 'marked'
import DOMPurify from 'dompurify'

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

/**
 * Config DOMPurify du rendu markdown (point unique — cf. #359, XSS stocké HAUTE-1).
 *
 * `marked` 18 rend le HTML BRUT présent dans le markdown : un `detail`/`outcome`
 * de tâche ou un `docs/*.md` — écrit par un agent depuis une entrée non fiable, ou
 * cloné depuis un repo tiers piégé — peut donc injecter `<script>` ou
 * `<img onerror=…>`. Ce HTML s'exécuterait dans l'origine du dashboard, qui a un
 * accès API local non authentifié. On sanitise donc la sortie AVANT injection.
 *
 * - `USE_PROFILES: { html: true }` : on ne garde que le HTML (pas de SVG/MathML,
 *   vecteurs XSS inutiles ici). Couvre le markdown légitime : titres, listes,
 *   tables, blocs de code, liens, images.
 * - `ALLOWED_URI_REGEXP` : liens `http(s):`, `mailto:` et ancres internes `#slug`
 *   uniquement — `javascript:` et `data:` (URLs dangereuses) sont rejetés.
 * - `ADD_ATTR: ['id']` : conserve l'`id` des headings (h1-h6) que pose le renderer
 *   custom ci-dessus — les ancres `#slug` du scroll interne (Vue Docs / TaskPanel)
 *   doivent survivre à la sanitisation.
 *
 * Neutralisé par défaut : `<script>`, `<iframe>`/`<object>`/`<embed>`, tous les
 * gestionnaires d'événements (`onerror`/`onclick`/…), et les protocoles hors liste.
 */
const SANITIZE_CONFIG = {
  USE_PROFILES: { html: true } as const,
  ADD_ATTR: ['id'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
}

export function renderMarkdown(source: string): string {
  const rawHtml = marked.parse(source, { async: false }) as string
  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG)
}

/**
 * Rendu markdown lecture seule avec la typographie `.doc-prose` (index.css).
 * dangerouslySetInnerHTML : la sortie passe par `renderMarkdown`, qui sanitise
 * via DOMPurify (cf. SANITIZE_CONFIG) — pas d'HTML brut injecté.
 */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  return (
    <div
      className={`doc-prose ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  )
}
