import type { Plugin } from 'vite'
import type { ServerResponse, IncomingMessage } from 'node:http'
import { watch, readdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { loadPaths, packageRoot, type RoadmappedPaths } from '../lib/paths.ts'
import { checkUpdate, installedSha, restartWithUpdate, UPDATE_REPO, type UpdateStatus } from '../lib/updateNotifier.ts'
import {
  treeWithErrors, addTask, updateTask, deleteTask, moveTask,
  updateSection, saveEpics, type MutationResult,
} from '../lib/taskWrites.ts'
import { attachTemperatures } from '../lib/roadmap.ts'
import { cachedTreeWithErrors, invalidateTreeCache } from '../lib/treeCache.ts'
import { buildDocsTree, readDocContent, unsafeDocPath } from './docs.ts'
import { readKbGraph } from './kb.ts'
import {
  listNotes, readNote, createNote, writeNote, archiveNote, deleteNote, revealPath, ensureNotesSetup,
  type NoteResult,
} from './notes.ts'
import { logUsage } from '../lib/usageLog.ts'

export type ApiAction =
  | { type: 'getTree' }
  | { type: 'createTask'; body: any }
  | { type: 'patchTask'; id: number; body: any }
  | { type: 'deleteTask'; id: number }
  | { type: 'patchSection'; dir: string; body: any }
  | { type: 'putEpics'; body: any }
  | { type: 'getDocsTree' }
  | { type: 'getDocContent'; path: string }
  | { type: 'getKb' }
  | { type: 'listNotes' }
  | { type: 'createNote'; body: any }
  | { type: 'readNote'; slug: string }
  | { type: 'writeNote'; slug: string; body: any }
  | { type: 'archiveNote'; slug: string }
  | { type: 'deleteNote'; slug: string }
  | { type: 'reveal'; body: any }
  | { type: 'usage'; body: any }
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

  // Knowledge base (#kb) : lecture seule du graphe Graphify. Route sans paramètre.
  if (seg[0] === 'kb' && seg.length === 1 && method === 'GET') return { type: 'getKb' }

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

  // Compteur d'usage local (#345) : quelle vue du dashboard est réellement ouverte.
  // Fire-and-forget côté client (App.tsx) — jamais bloquant.
  if (seg[0] === 'usage' && seg.length === 1 && method === 'POST') {
    return { type: 'usage', body }
  }

  return { type: 'notFound' }
}

interface ApiResponse {
  status: number
  payload: unknown
}

/** Traduit un MutationResult en réponse HTTP (400 validation, 404 not found). */
function fromMutation(res: MutationResult): ApiResponse {
  // Température (#234) attachée aussi sur l'arbre post-mutation : le client le
  // consomme directement (resync /api/tree recalcule de toute façon). tree frais → sûr.
  if (res.ok) return { status: 200, payload: { ok: true, tree: attachTemperatures(res.tree), task: res.task } }
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
        // Perf (#366) : sert le tree mémoïsé (zéro I/O, zéro parse) tant qu'aucune
        // écriture ne l'a invalidé (commitWrites + le watcher ci-dessous).
        const { tree, errors } = cachedTreeWithErrors(tasksDir, () => treeWithErrors(tasksDir))
        // Température (#234) attachée par tâche pour l'affichage (phase 3). tree
        // fraîchement construit → mutation en place sûre (aucun partage inter-requête).
        attachTemperatures(tree)
        // hostRoot/repoName : identifient le repo servi (un paquet, N hôtes).
        // Deux consommateurs : le header du dashboard et la sonde de collision
        // du bin (bin/roadmapped.mjs) qui compare avant de no-op.
        return { status: 200, payload: { ok: true, tree, errors, hostRoot: paths.root, repoName: basename(paths.root) } }
      }
      case 'createTask':
        return fromMutation(addTask(tasksDir, action.body ?? {}))
      case 'patchTask': {
        // Changer le TYPE = déplacer le fichier (#251) : si le body porte `type`
        // (ou `section`), c'est un déplacement ; sinon un patch de champs classique.
        const body = action.body ?? {}
        const newType = typeof body.type === 'string' ? body.type
          : typeof body.section === 'string' ? body.section : null
        return fromMutation(newType ? moveTask(tasksDir, action.id, newType) : updateTask(tasksDir, action.id, body))
      }
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
      case 'getKb': {
        // `root` accompagne le graphe : le client joint source_file (repo-relatif)
        // au root pour révéler un fichier code (POST /api/reveal, chemin absolu).
        const res = readKbGraph(paths.kbGraphFile)
        if (!res.ok) return { status: res.status, payload: { ok: false, errors: [res.error] } }
        return { status: 200, payload: { ok: true, graph: res.graph, root: paths.root } }
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
      case 'usage': {
        const name = typeof action.body?.name === 'string' && action.body.name ? action.body.name : 'unknown'
        logUsage('view', name, paths.root)
        return { status: 200, payload: { ok: true } }
      }
      case 'badRequest':
        return { status: 400, payload: { ok: false, errors: action.errors } }
      case 'notFound':
        return { status: 404, payload: { ok: false, errors: ['Route inconnue.'] } }
    }
  } catch (e) {
    return { status: 500, payload: { ok: false, errors: [(e as Error).message] } }
  }
}

// Durcissement de l'API locale (#360, audit sécu #356). Modèle de menace : une
// PAGE WEB TIERCE ouverte dans le navigateur de l'utilisateur tente de parler à
// l'API localhost (CSRF / DNS-rebinding). Trois gardes, tous pensés pour NE PAS
// gêner l'app légitime (fetch same-origin) ni le CLI/curl (pas de vecteur browser).
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** hostname nu d'un en-tête Host/Origin (port et crochets IPv6 ôtés). '' si absent. */
export function hostnameOf(headerVal: string | undefined): string {
  if (!headerVal) return ''
  // Origin = scheme://host[:port] ; Host = host[:port]. On ne veut que le host.
  const noScheme = headerVal.replace(/^[a-z]+:\/\//i, '')
  const hostPort = noScheme.replace(/^\[([^\]]+)\]/, '$1') // [::1]:port → ::1:port
  return hostPort.replace(/:\d+$/, '').toLowerCase()
}

/**
 * Verdict de sécurité sur une requête /api/ — null = autorisée, sinon {status,msg}.
 * - Host non-local → 403 (défense DNS-rebinding : un domaine piégé résolvant vers
 *   127.0.0.1 envoie SON Host, pas localhost).
 * - Mutation avec Origin cross-site → 403 (défense CSRF : le fetch same-origin de
 *   l'app envoie Origin=localhost ; une page evil.com envoie le sien). Origin
 *   absent (curl, CLI, navigations same-origin GET) → pas un vecteur browser, ok.
 * - Mutation AVEC corps mais Content-Type non-JSON → 415 (bloque le POST « simple
 *   request » text/plain qui esquive le preflight ; /api/update sans corps est
 *   exempt et reste couvert par l'Origin).
 */
export function apiGuard(
  method: string,
  headers: { host?: string; origin?: string; 'content-type'?: string; 'content-length'?: string },
): { status: number; msg: string } | null {
  const host = hostnameOf(headers.host)
  if (host && !LOCAL_HOSTS.has(host)) return { status: 403, msg: `Host non autorisé: ${host}` }
  if (!MUTATING.has(method)) return null
  const origin = hostnameOf(headers.origin)
  if (origin && !LOCAL_HOSTS.has(origin)) return { status: 403, msg: `Origin cross-site refusé: ${origin}` }
  const hasBody = Number(headers['content-length'] ?? '0') > 0
  if (hasBody && method !== 'DELETE') {
    const ct = (headers['content-type'] ?? '').toLowerCase()
    if (!ct.startsWith('application/json')) return { status: 415, msg: 'Content-Type application/json requis' }
  }
  return null
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

// L'API en Node PUR (#200) : un middleware (req,res,next) monté par le serveur prod
// autonome (serve.ts) ET par le plugin Vite (roadmappedApi, en bas). Un seul code,
// deux hôtes — la logique (watcher fs, SSE, routes) ne dépend que de node:http.
/** opts.onClientCountChange (#330) : notifié à chaque connexion/déconnexion SSE
 *  avec le nombre d'onglets encore ouverts. UNIQUEMENT câblé par startDashboard
 *  (prod) pour l'auto-shutdown à la fermeture de la fenêtre — le plugin dev Vite
 *  ne le passe pas, donc `npm run dev` (l'atelier) n'est jamais tué.
 *  opts.port (#336) : le port réellement bindé (connu après listen), repassé au
 *  dashboard relancé par le bouton update — l'onglet le retrouve au même endroit. */
export function createApiMiddleware(
  paths: RoadmappedPaths,
  opts: { onClientCountChange?: (openTabs: number) => void; port?: () => number | undefined } = {},
) {
  // MAJ dispo (#211) : sondée UNE fois au boot (async, non bloquant — checkUpdate
  // fait le git ls-remote hors du chemin de rendu), puis injectée dans le payload
  // getTree pour une notif IN-APP designée. null = à jour / indéterminable / clone
  // de dev. Le seam : le frontend lit `update` ; l'UI est un composant à part (#211).
  let updateStatus: UpdateStatus | null = null
  void checkUpdate(packageRoot(), paths.root).then((s) => { updateStatus = s }).catch(() => {})
  // #336 : SHA du lock au boot. L'autoUpdate (#294) réécrit le lock en arrière-plan
  // pendant que CE process tourne encore l'ancienne version ; au clic, « lock ≠ boot »
  // signifie « déjà installé, il ne manque que le restart » — refuser serait le bug.
  const bootSha = installedSha(paths.root)
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
    // Invalide le cache de lecture (#366) dès qu'un fichier bouge — couvre les
    // écritures HORS commitWrites (CLI d'un autre process, git, édition manuelle).
    // Les mutations in-process invalident déjà de façon synchrone dans commitWrites.
    invalidateTreeCache(paths.tasksDir)
    pending.add(file)
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(broadcast, 80) // coalesce la salve d'events fs d'une écriture
  }
  // Notepad (#87) : au boot, docs/notes/ existe et est gitignoré. repoRoot = paths.root
  // (en dev, Vite forçait le cwd au repo hôte via le spawn ; le serveur prod tourne
  // in-process, cwd = là où l'utilisateur a tapé la commande → paths.root est fiable).
  // Best-effort — jamais bloquant si le FS refuse.
  try { ensureNotesSetup(paths.docsDir, paths.root) } catch { /* non bloquant */ }
      // File-watch (#147) : fs.watch natif récursif sur tasksDir/docsDir. Toute écriture
      // (agent, CLI, autre onglet) déclenche un signal SSE débouncé.
      // ponytail: recursive:true couvre macOS/Windows ; sous Linux il jette
      // (ERR_FEATURE_UNAVAILABLE) → on retombe sur un watch des sous-dossiers immédiats
      // (les 9 types), suffisant pour tasksDir. Upgrade Linux profond = chokidar.
      // #kb (phase 2) : graphify-out/ (dir du graphe) est surveillé aussi — sa
      // régénération (agent /graphify) pousse un SSE que le KbProvider capte.
      // Absent tant que le graphe n'a jamais été généré : les watch throw →
      // avalés par le try/catch (comme un dir manquant), sans casser le reste.
      for (const dir of [paths.tasksDir, paths.docsDir, dirname(paths.kbGraphFile)]) {
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
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/')) return next()

        const method = req.method ?? 'GET'

        // Durcissement (#360) : Host/Origin/Content-Type AVANT tout traitement — une
        // page tierce ne doit ni lire ni muter l'API localhost (CSRF/DNS-rebinding).
        const verdict = apiGuard(method, req.headers as Record<string, string | undefined>)
        if (verdict) {
          res.statusCode = verdict.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: false, errors: [verdict.msg] }))
          return
        }

        // SSE (#147) : connexion longue, hors du cycle runAction/JSON.
        if (url.pathname === '/api/events' && method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write(': connected\n\n')
          clients.add(res)
          opts.onClientCountChange?.(clients.size)
          const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000)
          req.on('close', () => {
            clearInterval(keepAlive)
            clients.delete(res)
            opts.onClientCountChange?.(clients.size)
          })
          return
        }

        // Force update + restart (#295) : le bouton in-app POST ici. Restart accordé si
        // une MAJ est dispo OU si le lock a bougé depuis le boot (#336 : l'autoUpdate a
        // déjà installé pendant que ce process tournait — checkUpdate dit « à jour » mais
        // le process serve l'ANCIENNE version, le restart est exactement ce qui manque).
        // Sinon 409 (à jour / clone de dev self-host / offline — protège `npm run dev`).
        // Puis répond, relance l'updater détaché sur le MÊME port, et coupe CE process.
        if (url.pathname === '/api/update' && method === 'POST') {
          const u = await checkUpdate(packageRoot(), paths.root)
          const lockMoved = installedSha(paths.root) !== bootSha
          res.setHeader('Content-Type', 'application/json')
          if (!u && !lockMoved) {
            res.statusCode = 409
            res.end(JSON.stringify({ ok: false, reason: 'up to date, dev clone, or offline' }))
            return
          }
          res.statusCode = 200
          res.end(JSON.stringify({ ok: true, restarting: true }))
          // Laisse la réponse partir avant de quitter ; l'enfant détaché survit.
          setTimeout(() => { try { restartWithUpdate(paths.root, opts.port?.()) } finally { process.exit(0) } }, 150)
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
  }
}

// Coquille plugin Vite (#200) : notre atelier de dev (`npm run dev`) monte le MÊME
// middleware. L'hôte ne lance plus jamais Vite — c'est serve.ts qui l'utilise en prod.
export function roadmappedApi(): Plugin {
  return {
    name: 'roadmapped-api',
    configureServer(server) {
      server.middlewares.use(createApiMiddleware(loadPaths()))
    },
  }
}
