import { demoTree } from './tree'
import { DEMO_DOCS, DEMO_DOC_CONTENT, DEMO_NOTE } from './content'

/*
 * Shim d'API DÉMO (#148) — le dashboard embarqué sur roadmapped.dev.
 *
 * Le client ne connaît le serveur QUE par fetch('/api/…') : intercepter fetch
 * suffit donc à faire tourner l'app entière sans serveur, sans toucher une
 * ligne des composants. Le graphe, les tabs, le panneau sont ceux de l'app
 * par construction — c'est l'app.
 *
 * Contrat lecture seule :
 *  - GET tree/docs/notes → contenus statiques embarqués (tree.ts, content.ts) ;
 *  - toute mutation de tâches/sections/epics → 403 avec un message honnête ;
 *  - le Notepad, lui, écrit EN MÉMOIRE (c'est un brouillon local même dans la
 *    vraie app — une démo de brouillon qui s'évapore est dans le sujet).
 */

const READ_ONLY_MSG =
  'Read-only demo — your edit was politely declined. In the real app this would have written a YAML file in your repo.'

interface MemNote { slug: string; content: string; modified: number }

const firstLine = (content: string): string =>
  content.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''

const titleOf = (n: MemNote): string => firstLine(n.content) || n.slug

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function installDemoApi(): void {
  // Live reactivity (#147) : la démo est un build statique sans serveur SSE.
  // Ce drapeau dit à TreeContext de NE PAS ouvrir /api/events (sinon EventSource
  // retenterait en boucle sur l'hôte statique).
  ;(window as unknown as { __ROADMAPPED_STATIC__?: boolean }).__ROADMAPPED_STATIC__ = true
  const notes = new Map<string, MemNote>([
    [DEMO_NOTE.slug, { slug: DEMO_NOTE.slug, content: DEMO_NOTE.content, modified: Date.now() }],
  ])
  let noteSeq = 1

  const handle = (method: string, pathname: string, search: URLSearchParams, body: any): Response => {
    const seg = pathname.replace(/^\/+|\/+$/g, '').split('/').slice(1) // sans 'api'

    if (seg[0] === 'tree' && method === 'GET') {
      return json(200, { ok: true, tree: demoTree(), errors: [] })
    }

    if (seg[0] === 'docs' && method === 'GET') {
      if (seg.length === 1) return json(200, { ok: true, tree: DEMO_DOCS })
      if (seg[1] === 'content') {
        const path = search.get('path') ?? ''
        const content = DEMO_DOC_CONTENT[path]
        if (content === undefined) return json(404, { ok: false, errors: [`Doc inconnu : ${path}.`] })
        return json(200, { ok: true, content })
      }
    }

    if (seg[0] === 'notes') {
      if (seg.length === 1 && method === 'GET') {
        const list = [...notes.values()]
          .sort((a, b) => b.modified - a.modified)
          .map((n) => ({ slug: n.slug, title: titleOf(n), modified: n.modified }))
        return json(200, { ok: true, notes: list })
      }
      if (seg.length === 1 && method === 'POST') {
        const slug = `demo-note-${++noteSeq}`
        const note = { slug, content: String(body?.content ?? ''), modified: Date.now() }
        notes.set(slug, note)
        return json(200, { ok: true, slug, title: titleOf(note), content: note.content })
      }
      const note = notes.get(seg[1])
      if (!note) return json(404, { ok: false, errors: [`Note inconnue : ${seg[1]}.`] })
      if (seg.length === 2 && method === 'GET') {
        return json(200, { ok: true, slug: note.slug, title: titleOf(note), content: note.content })
      }
      if (seg.length === 2 && method === 'PUT') {
        note.content = String(body?.content ?? '')
        note.modified = Date.now()
        return json(200, { ok: true, slug: note.slug, title: titleOf(note), content: note.content })
      }
      if ((seg.length === 2 && method === 'DELETE') || (seg.length === 3 && seg[2] === 'archive' && method === 'POST')) {
        notes.delete(seg[1])
        return json(200, { ok: true, slug: seg[1] })
      }
    }

    if (seg[0] === 'reveal') {
      return json(403, { ok: false, errors: ['No Finder in a web demo — in the real app this opens the file on your machine.'] })
    }

    if (method === 'GET') return json(404, { ok: false, errors: ['Route inconnue.'] })
    return json(403, { ok: false, errors: [READ_ONLY_MSG] })
  }

  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
    const u = new URL(url, window.location.href)
    if (!u.pathname.startsWith('/api/')) return realFetch(input as RequestInfo, init)

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    let body: any = null
    const rawBody = init?.body ?? (input instanceof Request ? await input.clone().text().catch(() => null) : null)
    if (typeof rawBody === 'string' && rawBody !== '') {
      try { body = JSON.parse(rawBody) } catch { body = null }
    }
    return handle(method, u.pathname, u.searchParams, body)
  }
}
