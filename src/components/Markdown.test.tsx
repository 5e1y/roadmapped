import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './Markdown'

/**
 * #359 — XSS stocké : la sortie de `marked` est sanitisée par DOMPurify avant
 * injection via dangerouslySetInnerHTML (Markdown / DocsView passent tous deux
 * par `renderMarkdown`). Ces tests prouvent que les vecteurs hostiles sont
 * neutralisés SANS casser le markdown légitime — notamment les ancres `#slug`.
 */
describe('renderMarkdown — sanitisation (#359)', () => {
  describe('neutralise les vecteurs XSS', () => {
    it('retire l’attribut onerror d’une <img>', () => {
      const html = renderMarkdown('<img src=x onerror="alert(1)">')
      expect(html).not.toMatch(/onerror/i)
      expect(html).not.toMatch(/alert\(1\)/)
    })

    it('neutralise une balise <script>', () => {
      const html = renderMarkdown('avant<script>alert(document.cookie)</script>après')
      expect(html).not.toMatch(/<script/i)
      expect(html).not.toMatch(/alert\(document\.cookie\)/)
    })

    it('retire un href javascript: sur un lien markdown', () => {
      const html = renderMarkdown('[clique](javascript:alert(1))')
      expect(html).not.toMatch(/javascript:/i)
      expect(html).not.toMatch(/href="javascript/i)
    })

    it('retire les iframes', () => {
      const html = renderMarkdown('<iframe src="https://evil.example"></iframe>')
      expect(html).not.toMatch(/<iframe/i)
    })

    it('retire un gestionnaire onclick inline', () => {
      const html = renderMarkdown('<a href="https://ok.example" onclick="steal()">x</a>')
      expect(html).not.toMatch(/onclick/i)
      expect(html).not.toMatch(/steal\(\)/)
    })
  })

  describe('préserve le markdown légitime', () => {
    it('garde un lien https cliquable', () => {
      const html = renderMarkdown('[docs](https://roadmapped.work/docs)')
      expect(html).toMatch(/<a[^>]+href="https:\/\/roadmapped\.work\/docs"/i)
    })

    it('garde un bloc de code', () => {
      const html = renderMarkdown('```\nconst x = 1\n```')
      expect(html).toMatch(/<pre>/i)
      expect(html).toMatch(/<code[\s\S]*const x = 1/i)
    })

    it('garde l’id d’ancrage d’un heading (#slug pour le scroll interne)', () => {
      const html = renderMarkdown('## Ma Section Importante')
      expect(html).toMatch(/<h2[^>]*id="ma-section-importante"/i)
    })

    it('garde une liste et une table', () => {
      const html = renderMarkdown('- un\n- deux\n\n| a | b |\n|---|---|\n| 1 | 2 |')
      expect(html).toMatch(/<ul>/i)
      expect(html).toMatch(/<table>/i)
    })

    it('garde une image http(s) avec son alt', () => {
      const html = renderMarkdown('![logo](https://roadmapped.work/logo.png)')
      expect(html).toMatch(/<img[^>]+src="https:\/\/roadmapped\.work\/logo\.png"/i)
      expect(html).toMatch(/alt="logo"/i)
    })
  })
})
