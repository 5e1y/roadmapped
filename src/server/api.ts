import type { Plugin, Connect } from 'vite'
import type { ServerResponse, IncomingMessage } from 'node:http'
import { loadPaths, type RoadmapedPaths } from '../lib/paths'
import {
  treeWithErrors, addTask, updateTask, archiveTask, deleteTask,
  updateSection, saveRoadmaps, type MutationResult,
} from '../lib/taskWrites'
import { buildDocsTree, readDocContent, unsafeDocPath } from './docs'
import {
  listNotes, readNote, createNote, writeNote, archiveNote, deleteNote, revealPath, ensureNotesSetup,
  type NoteResult,
} from './notes'

export type ApiAction =
  | { type: 'getTree' }
  | { type: 'createTask'; body: any }
  | { type: 'patchTask'; id: number; body: any }
  | { type: 'archiveTask'; id: number }
  | { type: 'deleteTask'; id: number }
  | { type: 'patchSection'; dir: string; body: any }
  | { type: 'putRoadmaps'; body: any }
  | { type: 'getDocsTree' }
  | { type: 'getDocContent'; path: string }
  | { type: 'listNotes' }
  | { type: 'createNote'; body: any }
  | { type: 'readNote'; slug: string }
  | { type: 'writeNote'; slug: string; body: any }
  | { type: 'archiveNote'; slug: string }
  | { type: 'deleteNote'; slug: string }
  | { type: 'reveal'; body: any }
  | { type: 'badRequest'; errors: string[] }
  | { type: 'notFound' }

/** Un identifiant de section est un nom de dossier simple — jamais un chemin. */
const unsafeSegment = (s: unknown): boolean =>
  typeof s !== 'string' || s.includes('/') || s.includes('\\') || s.includes('..')

export function routeApi(method: string, rawUrl: string, body: any): ApiAction {
  // rawUrl peut porter une query string (ex. /api/docs/content?path=...).
  // On sépare pathname/query nous-mêmes plutôt que via `new URL(...).pathname` :
  // le parseur WHATWG normalise les segments `%2e%2e` en `..` puis les résout
  // (dot-segment removal), ce qui casserait la détection de traversal encodé
  // sur les routes existantes (sections/:dir). searchParams reste sûr à
  // utiliser pour la query (décodage simple, pas de résolution de chemin).
  const qIndex = rawUrl.indexOf('?')
  const pathname = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex)
  const searchParams = new URLSearchParams(qIndex === -1 ? '' : rawUrl.slice(qIndex + 1))
  const parts = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (parts[0] !== 'api') return { type: 'notFound' }
  const seg = parts.slice(1)

  if (seg[0] === 'tree' && seg.length === 1 && method === 'GET') return { type: 'getTree' }

  if (seg[0] === 'docs') {
    if (seg.length === 1 && method === 'GET') return { type: 'getDocsTree' }
    if (seg.length === 2 && seg[1] === 'content' && method === 'GET') {
      const path = searchParams.get('path')
      if (unsafeDocPath(path) || !(path as string).endsWith('.md')) {
        return { type: 'badRequest', errors: ['path invalide (nom de fichier .md relatif attendu).'] }
      }
      return { type: 'getDocContent', path: path as string }
    }
  }

  if (seg[0] === 'tasks') {
    if (seg.length === 1 && method === 'POST') {
      if (body?.section !== undefined && unsafeSegment(body.section)) {
        return { type: 'badRequest', errors: ['section invalide (nom de dossier simple attendu).'] }
      }
      return { type: 'createTask', body }
    }
    if (seg.length === 2 && method === 'PATCH') return { type: 'patchTask', id: Number(seg[1]), body }
    if (seg.length === 2 && method === 'DELETE') return { type: 'deleteTask', id: Number(seg[1]) }
    if (seg.length === 3 && seg[2] === 'archive' && method === 'POST') {
      return { type: 'archiveTask', id: Number(seg[1]) }
    }
  }

  if (seg[0] === 'sections') {
    // La création de section a disparu (stages fixes) : plus de POST /api/sections.
    if (seg.length === 2 && method === 'PATCH') {
      let dir: string | null = null
      try {
        dir = decodeURIComponent(seg[1])
      } catch {
        // percent-encoding malformé (%ZZ) — 400, pas une exception middleware.
      }
      if (dir === null || unsafeSegment(dir)) {
        return { type: 'badRequest', errors: ['dir invalide (nom de dossier simple attendu).'] }
      }
      return { type: 'patchSection', dir, body }
    }
  }

  if (seg[0] === 'roadmaps' && seg.length === 1 && method === 'PUT') {
    return { type: 'putRoadmaps', body }
  }

  // Notepad (#86) : notes plates sous docs/notes/. Le slug (:slug) est validé côté
  // notes.ts (unsafeSlug) ; ici on route seulement sur la forme.
  if (seg[0] === 'notes') {
    if (seg.length === 1 && method === 'GET') return { type: 'listNotes' }
    if (seg.length === 1 && method === 'POST') return { type: 'createNote', body }
    if (seg.length === 2 && method === 'GET') return { type: 'readNote', slug: seg[1] }
    if (seg.length === 2 && method === 'PUT') return { type: 'writeNote', slug: seg[1], body }
    if (seg.length === 2 && method === 'DELETE') return { type: 'deleteNote', slug: seg[1] }
    if (seg.length === 3 && seg[2] === 'archive' && method === 'POST') {
      return { type: 'archiveNote', slug: seg[1] }
    }
  }

  if (seg[0] === 'reveal' && seg.length === 1 && method === 'POST') {
    return { type: 'reveal', body }
  }

  return { type: 'notFound' }
}

interface ApiResponse {
  status: number
  payload: unknown
}

/** Traduit un MutationResult en réponse HTTP (400 validation, 404 not found). */
function fromMutation(res: MutationResult): ApiResponse {
  if (res.ok) return { status: 200, payload: { ok: true, tree: res.tree, task: res.task } }
  return { status: res.notFound ? 404 : 400, payload: { ok: false, errors: res.errors } }
}

/** Traduit un NoteResult (Notepad) en réponse HTTP. */
function fromNote(res: NoteResult): ApiResponse {
  return res.ok
    ? { status: res.status, payload: { ok: true, ...(res.payload as object) } }
    : { status: res.status, payload: { ok: false, errors: [res.error] } }
}

/** Exécute une action contre tasksDir/docsDir. Isole les exceptions en 500. */
export function runAction(paths: RoadmapedPaths, action: ApiAction): ApiResponse {
  const { tasksDir, docsDir } = paths
  try {
    switch (action.type) {
      case 'getTree': {
        const { tree, errors } = treeWithErrors(tasksDir)
        return { status: 200, payload: { ok: true, tree, errors } }
      }
      case 'createTask':
        return fromMutation(addTask(tasksDir, action.body ?? {}))
      case 'patchTask':
        return fromMutation(updateTask(tasksDir, action.id, action.body ?? {}))
      case 'archiveTask':
        return fromMutation(archiveTask(tasksDir, action.id))
      case 'deleteTask':
        return fromMutation(deleteTask(tasksDir, action.id))
      case 'patchSection':
        return fromMutation(updateSection(tasksDir, action.dir, action.body ?? {}))
      case 'putRoadmaps':
        return fromMutation(saveRoadmaps(tasksDir, action.body ?? {}))
      case 'getDocsTree':
        return { status: 200, payload: { ok: true, tree: buildDocsTree(docsDir) } }
      case 'getDocContent': {
        const res = readDocContent(docsDir, action.path)
        if (!res.ok) return { status: res.status, payload: { ok: false, errors: [res.error] } }
        return { status: 200, payload: { ok: true, content: res.content } }
      }
      case 'listNotes':
        return { status: 200, payload: { ok: true, notes: listNotes(docsDir) } }
      case 'createNote':
        return fromNote(createNote(docsDir, action.body?.content ?? ''))
      case 'readNote':
        return fromNote(readNote(docsDir, action.slug))
      case 'writeNote':
        return fromNote(writeNote(docsDir, action.slug, action.body?.content))
      case 'archiveNote':
        return fromNote(archiveNote(docsDir, action.slug))
      case 'deleteNote':
        return fromNote(deleteNote(docsDir, action.slug))
      case 'reveal':
        return fromNote(revealPath(action.body?.path))
      case 'badRequest':
        return { status: 400, payload: { ok: false, errors: action.errors } }
      case 'notFound':
        return { status: 404, payload: { ok: false, errors: ['Route inconnue.'] } }
    }
  } catch (e) {
    return { status: 500, payload: { ok: false, errors: [(e as Error).message] } }
  }
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

export function roadmapedApi(): Plugin {
  const paths = loadPaths()
  return {
    name: 'roadmaped-api',
    configureServer(server) {
      // Notepad (#87) : au boot, docs/notes/ existe et est gitignoré. repoRoot = cwd du
      // serveur de dev. Best-effort — jamais bloquant si le FS refuse.
      try { ensureNotesSetup(paths.docsDir, process.cwd()) } catch { /* non bloquant */ }
      server.middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const method = req.method ?? 'GET'
        const body =
          method === 'POST' || method === 'PATCH' || method === 'PUT'
            ? await readJsonBody(req)
            : null

        // req.url (pas url.pathname) : routeApi a besoin de la query string
        // brute pour /api/docs/content?path=... (elle la parse elle-même).
        const { status, payload } = runAction(paths, routeApi(method, req.url ?? '/', body))
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
      })
    },
  }
}
