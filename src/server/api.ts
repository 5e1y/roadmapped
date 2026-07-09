import type { Plugin, Connect } from 'vite'
import type { ServerResponse, IncomingMessage } from 'node:http'
import { watch, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { loadPaths, packageRoot, type RoadmappedPaths } from '../lib/paths'
import { checkUpdate, UPDATE_REPO, type UpdateStatus } from '../lib/updateNotifier'
import {
  treeWithErrors, addTask, updateTask, deleteTask,
  updateSection, saveEpics, type MutationResult,
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
  | { type: 'deleteTask'; id: number }
  | { type: 'patchSection'; dir: string; body: any }
  | { type: 'putEpics'; body: any }
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

  // Epics (#133, ex-roadmaps) : réécriture complète de _epics.yaml.
  if (seg[0] === 'epics' && seg.length === 1 && method === 'PUT') {
    return { type: 'putEpics', body }
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
export function runAction(paths: RoadmappedPaths, action: ApiAction): ApiResponse {
  const { tasksDir, docsDir } = paths
  try {
    switch (action.type) {
      case 'getTree': {
        const { tree, errors } = treeWithErrors(tasksDir)
        // hostRoot/repoName : identifient le repo servi (un paquet, N hôtes).
        // Deux consommateurs : le header du dashboard et la sonde de collision
        // du bin (bin/roadmapped.mjs) qui compare avant de no-op.
        return { status: 200, payload: { ok: true, tree, errors, hostRoot: paths.root, repoName: basename(paths.root) } }
      }
      case 'createTask':
        return fromMutation(addTask(tasksDir, action.body ?? {}))
      case 'patchTask':
        return fromMutation(updateTask(tasksDir, action.id, action.body ?? {}))
      case 'deleteTask':
        return fromMutation(deleteTask(tasksDir, action.id))
      case 'patchSection':
        return fromMutation(updateSection(tasksDir, action.dir, action.body ?? {}))
      case 'putEpics':
        return fromMutation(saveEpics(tasksDir, action.body ?? {}))
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

export function roadmappedApi(): Plugin {
  const paths = loadPaths()
  // MAJ dispo (#211) : sondée UNE fois au boot (async, non bloquant — checkUpdate
  // fait le git ls-remote hors du chemin de rendu), puis injectée dans le payload
  // getTree pour une notif IN-APP designée. null = à jour / indéterminable / clone
  // de dev. Le seam : le frontend lit `update` ; l'UI est un composant à part (#211).
  let updateStatus: UpdateStatus | null = null
  void checkUpdate(packageRoot(), paths.root).then((s) => { updateStatus = s }).catch(() => {})
  // Live reactivity (#147) : les clients SSE abonnés à /api/events. Le watcher pousse
  // un signal léger « quelque chose a changé » ; le client resync via /api/tree.
  const clients = new Set<ServerResponse>()
  let debounce: ReturnType<typeof setTimeout> | null = null
  const pending = new Set<string>()
  const broadcast = () => {
    const data = JSON.stringify({ paths: [...pending] })
    pending.clear()
    for (const res of clients) res.write(`event: change\ndata: ${data}\n\n`)
  }
  const schedule = (file: string) => {
    pending.add(file)
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(broadcast, 80) // coalesce la salve d'events fs d'une écriture
  }
  return {
    name: 'roadmapped-api',
    configureServer(server) {
      // Notepad (#87) : au boot, docs/notes/ existe et est gitignoré. repoRoot = cwd du
      // serveur de dev. Best-effort — jamais bloquant si le FS refuse.
      try { ensureNotesSetup(paths.docsDir, process.cwd()) } catch { /* non bloquant */ }
      // File-watch (#147) : fs.watch natif récursif sur tasksDir/docsDir. Toute écriture
      // (agent, CLI, autre onglet) déclenche un signal SSE débouncé.
      // ponytail: recursive:true couvre macOS/Windows ; sous Linux il jette
      // (ERR_FEATURE_UNAVAILABLE) → on retombe sur un watch des sous-dossiers immédiats
      // (les 8 stages), suffisant pour tasksDir. Upgrade Linux profond = chokidar.
      for (const dir of [paths.tasksDir, paths.docsDir]) {
        try {
          watch(dir, { recursive: true }, (_e, f) => { if (f) schedule(String(f)) })
        } catch {
          try {
            watch(dir, (_e, f) => { if (f) schedule(String(f)) })
            for (const sub of readdirSync(dir, { withFileTypes: true })) {
              if (sub.isDirectory()) {
                try { watch(join(dir, sub.name), (_e, f) => { if (f) schedule(String(f)) }) } catch { /* skip */ }
              }
            }
          } catch { /* dir absent : rien à surveiller */ }
        }
      }
      server.middlewares.use(async (req: Connect.IncomingMessage, res: ServerResponse, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const method = req.method ?? 'GET'

        // SSE (#147) : connexion longue, hors du cycle runAction/JSON.
        if (url.pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(': connected\n\n')
          clients.add(res)
          const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000)
          req.on('close', () => { clearInterval(keepAlive); clients.delete(res) })
          return
        }
        const body =
          method === 'POST' || method === 'PATCH' || method === 'PUT'
            ? await readJsonBody(req)
            : null

        // req.url (pas url.pathname) : routeApi a besoin de la query string
        // brute pour /api/docs/content?path=... (elle la parse elle-même).
        const action = routeApi(method, req.url ?? '/', body)
        const { status, payload } = runAction(paths, action)
        // Injecte l'état de MAJ dans /api/tree (#211) — hors runAction (qui reste
        // pur) : le closure `updateStatus` vit ici. Le client resync sur /api/tree,
        // la notif apparaît dès que le check async a répondu.
        const out =
          action.type === 'getTree' && payload && typeof payload === 'object'
            ? { ...(payload as object), update: updateStatus, updateRepo: UPDATE_REPO }
            : payload
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(out))
      })
    },
  }
}
