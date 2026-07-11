#!/usr/bin/env node
// Serveur MCP Roadmapped (#91-92) — l'étage final de l'économie de tokens : les
// commandes deviennent des tools aux schémas AUTO-DOCUMENTÉS (le schéma remplace la
// doc du CLI dans le contexte), zéro bash à formater, sortie structurée sans bruit.
//
// Coexiste avec le CLI (task.mjs) : les DEUX appellent src/lib/taskWrites/roadmap/render
// (source unique, même validation + rollback + verrou #83). MCP = surface de l'agent ;
// CLI = humain/CI/tests. Transport stdio → stdout est le canal JSON-RPC : AUCUN log sur
// stdout (render.ts renvoie des strings, ne loggue jamais ; diagnostics → stderr).
//
// Node ≥ 22.18 (strip-types natif pour les imports .ts). Distribution : .mcp.json à la
// racine le lance (node scripts/mcp-server.mjs). Ce fichier N'enregistre QUE les tools
// de lecture en #91 ; #92 ajoute les tools d'écriture au même registre.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { loadPaths } from '../src/lib/paths.ts'
import {
  treeWithErrors, readTree, findTask,
  addTask, startTask, doneTask, updateTask, addFeedback,
} from '../src/lib/taskWrites.ts'
import { computeAvailability, activeTasks, nextQueue, globalProgress, epicProgress, allEpics } from '../src/lib/roadmap.ts'
import { briefText, sitrepText, taskLine, refLine, git, unloggedCommits } from '../src/lib/render.ts'
import { TYPES } from '../src/lib/tasks.ts'

// ------------------------------------------------------------------ helpers de sortie
// Règle (#95) : structuredContent SEULEMENT quand l'objet est la charge utile (écriture →
// tâche résultante, validate). Les clients (Claude Code) n'affichent QUE structuredContent
// quand il est présent — un tool texte-first (sitrep, brief, next…) qui en émet perd son
// texte dense. Et la spec MCP exige un OBJET : jamais d'array ni de null ici.
const ok = (text, structured) => ({
  content: [{ type: 'text', text }],
  ...(structured !== undefined ? { structuredContent: structured } : {}),
})
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true })
/** MutationResult → MCP output: success (text + structured task) or isError (self-contained errors). */
const fromRes = (res, okText, structured) =>
  res.ok ? ok(okText, structured) : fail(`Failed:\n${res.errors.map((e) => `  - ${e}`).join('\n')}`)
const splitList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v !== '' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

// Schémas de params réutilisés (le schéma EST la doc injectée dans le contexte).
const S = {
  none: { type: 'object', properties: {}, additionalProperties: false },
  id: {
    type: 'object',
    properties: { id: { type: 'number', description: 'global task id (e.g. 42)' } },
    required: ['id'], additionalProperties: false,
  },
  // Le type = la NATURE d'une tâche = son dossier de section (#230). Le slug entier
  // ("02-feature") ou nu ("feature") est accepté par les filtres.
  type: { type: 'string', enum: [...TYPES.map((t) => t.slug), ...TYPES.map((t) => t.slug.replace(/^\d+-/, ''))], description: 'task type = nature/section (e.g. 02-feature or feature)' },
  section: { type: 'string', description: `type/section slug (${TYPES.map((t) => t.slug).join(' … ')})` },
  heat: { type: 'number', description: 'priority seed 0-100 (optional, absent = cold; 0 cools)' },
}

/** Detailed text rendering of a task (equivalent of the CLI's `show`). */
function showText(hit, tree) {
  const t = hit.task
  const L = [taskLine(t, ''), `  section: ${hit.sectionKey}`, `  file: ${t.file}`]
  if (t.detail) L.push(`  detail: ${t.detail.trim()}`)
  if (t.refs.length) L.push(`  refs: ${t.refs.join(' · ')}`)
  if (t.dependsOn.length) L.push(`  depends on: ${t.dependsOn.map((d) => refLine(tree, d)).join(' · ')}`)
  if (t.links.length) L.push(`  linked: ${t.links.map((l) => refLine(tree, l)).join(' · ')}`)
  if (t.outcome) L.push(`  outcome: ${t.outcome}`)
  if (t.verification) L.push(`  verification: ${t.verification}`)
  L.push(`  dates: created ${t.createdAt}${t.completedAt ? ` · completed ${t.completedAt}` : ''} · source ${t.source}`)
  for (const sub of t.subtasks) L.push(taskLine(sub, '    '))
  return L.join('\n')
}

// ------------------------------------------------------------------ registre de tools
// Chaque tool : name, description (courte), inputSchema (la doc), handler (renvoie ok/fail).
// ROOT injecté (factory) → testable sur un sandbox sans le vrai backlog.
// #91 = lecture ; #92 poussera les tools d'écriture dans ce même tableau.
export function makeTools(ROOT) {
  return [
  {
    name: 'sitrep',
    description: 'The state of the world in ≤30 lines: done today, in_progress, next 3, validate, alerts. THE first move of a session.',
    inputSchema: S.none,
    handler: () => {
      const { tree, errors } = treeWithErrors(ROOT)
      return ok(sitrepText(tree, errors, unloggedCommits(tree)))
    },
  },
  {
    name: 'brief',
    description: "The dense execution context for a task (titled deps/linked, refs + anchor excerpts & freshness, done reminder). Supersedes show in cascade.",
    inputSchema: S.id,
    handler: ({ id }) => {
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return hit ? ok(briefText(tree, hit)) : fail(`No task #${id}.`)
    },
  },
  {
    name: 'show',
    description: 'Full detail of a task (global id).',
    inputSchema: S.id,
    handler: ({ id }) => {
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return hit ? ok(showText(hit, tree), hit.task) : fail(`No task #${id}.`)
    },
  },
  {
    name: 'next',
    description: 'The work queue: the next N AVAILABLE todo tasks (deps done), ordered by type-column then age. To be CONSUMED as-is.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number', description: 'number of tasks (default 1)' }, type: S.type },
      additionalProperties: false,
    },
    handler: ({ count = 1, type } = {}) => {
      const queue = nextQueue(readTree(ROOT), { type }).slice(0, Math.max(1, count))
      if (queue.length === 0) return ok('No task available (everything is done, locked, or in progress).')
      return ok(queue.map((t) => taskLine(t, '')).join('\n'))
    },
  },
  {
    name: 'take',
    description: 'Opens a session: next + start + brief IN ONE CALL. Takes the next available task (optionally filtered by type), starts it, returns its brief.',
    inputSchema: { type: 'object', properties: { type: S.type }, additionalProperties: false },
    handler: ({ type } = {}) => {
      const queue = nextQueue(readTree(ROOT), { type })
      if (queue.length === 0) return ok(`No task available${type ? ` for type ${type}` : ''}.`)
      const id = queue[0].id
      const res = startTask(ROOT, id)
      if (!res.ok) return fail(`Start failed for #${id}:\n${res.errors.join('\n')}`)
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return ok(`#${id} started.\n${briefText(tree, hit)}`)
    },
  },
  {
    name: 'list',
    description: 'Lists the backlog, filterable by section/type/status/tag.',
    inputSchema: {
      type: 'object',
      properties: {
        section: S.section,
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        type: S.type,
        tag: { type: 'string', description: 'only keep tasks carrying this tag (e.g. debt)' },
      },
      additionalProperties: false,
    },
    handler: (a = {}) => {
      const tree = readTree(ROOT)
      let sections = tree.sections
      const bare = (key) => key.replace(/^\d+-/, '')
      if (a.section) sections = sections.filter((s) => s.key === a.section)
      // --type = filtre par nature : la section EST le type. Accepte "bug" ou "01-bug".
      if (a.type) sections = sections.filter((s) => s.key === a.type || bare(s.key) === a.type)
      const keep = (pred) => { sections = sections.map((s) => ({ ...s, tasks: s.tasks.filter(pred) })).filter((s) => s.tasks.length) }
      if (a.status) keep((t) => t.status === a.status)
      if (a.tag) keep((t) => t.tags.includes(a.tag))
      const lines = []
      for (const s of sections) {
        const done = s.tasks.filter((t) => t.status === 'done').length
        lines.push(`${s.key} — ${s.title} (${s.status}) ${done}/${s.tasks.length}`)
        for (const t of s.tasks) lines.push(taskLine(t))
      }
      return ok(lines.join('\n') || '(no task)')
    },
  },
  {
    name: 'roadmap',
    description: 'Overall progress + epic view: progress and state of each task (done/available/locked, missing deps).',
    inputSchema: S.none,
    handler: () => {
      const tree = readTree(ROOT)
      const avail = computeAvailability(tree)
      const active = activeTasks(tree)
      const missingOf = (t) => t.dependsOn.filter((d) => avail.get(d) === 'available' || avail.get(d) === 'locked')
      const progress = globalProgress(tree)
      const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
      const lines = [`overall progress: ${progress.done}/${progress.total} (${pct}%)`]
      const epics = allEpics(tree)
      if (epics.length === 0) {
        lines.push(`No epics (no task carries the epic field). ${active.length} active tasks.`)
        return ok(lines.join('\n'))
      }
      const taskTag = (state, missing) =>
        state === 'done' ? '[x]' : state === 'available' ? '[~] (available)' : `[ ] (locked: ${missing.map((d) => `#${d}`).join(' ')})`
      for (const e of epics) {
        const p = epicProgress(tree, e.slug)
        lines.push(`\n${e.slug}${e.title !== e.slug ? ` — ${e.title}` : ''}  ${p.done}/${p.total}`)
        for (const t of active.filter((x) => x.epic === e.slug)) {
          const chips = [t.kind !== 'task' ? t.kind : null].filter(Boolean).join(' ')
          lines.push(`  ${taskTag(avail.get(t.id) ?? 'available', missingOf(t))} #${t.id} ${t.title}${chips ? ` (${chips})` : ''}`)
        }
      }
      const unassigned = active.filter((t) => t.epic === null).length
      if (unassigned > 0) lines.push(`\n(no epic) ${unassigned} active task(s) unassigned`)
      return ok(lines.join('\n'))
    },
  },
  {
    name: 'validate',
    description: 'Validates all of docs/tasks/ (schema + id uniqueness + nextId).',
    inputSchema: S.none,
    handler: () => {
      const { errors } = treeWithErrors(ROOT)
      return errors.length === 0
        ? ok('OK — validation passed.', { ok: true, errors: [] })
        : fail(`${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    },
  },

  // ---------------------------------------------------------------- écriture (#92)
  // Via taskWrites : validation + rollback + verrou (#83) HÉRITÉS. Une erreur métier
  // (heat hors bornes, cycle, section absente) revient en isError avec le message du noyau.
  {
    name: 'add',
    description: 'Creates a task. type (nature/section) REQUIRED. For a rapid title-only task use quick; kind milestone = MILESTONE (lock via dependsOn).',
    inputSchema: {
      type: 'object',
      properties: {
        section: S.section,
        title: { type: 'string' },
        heat: S.heat,
        kind: { type: 'string', enum: ['task', 'milestone'], description: 'default task; milestone = milestone (rendered as diamond, target of dependsOn)' },
        detail: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        size: { type: 'string', enum: ['S', 'M', 'L'] },
        refs: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'number' } },
        dependsOn: { type: 'array', items: { type: 'number' } },
        epic: { type: 'string', description: 'slug of the cross-cutting grouping (epic)' },
        milestone: { type: 'string', description: 'DEPRECATED — alias of epic (#133)' },
        blocks: { type: 'array', items: { type: 'number' }, description: 'ids that the new task LOCKS: it is added to their dependsOn (milestone sugar, inverse of dependsOn)' },
        source: { type: 'string', enum: ['ai', 'user'] },
      },
      required: ['section', 'title'], additionalProperties: false,
    },
    handler: (a) => {
      // --blocks: ids verified BEFORE any write (no milestone created then half-applied
      // chaining), mirroring the CLI (#137).
      const blocks = splitList(a.blocks).map(Number)
      if (blocks.length > 0) {
        const tree = readTree(ROOT)
        for (const id of blocks) {
          const hit = findTask(tree, id)
          if (!hit) return fromRes({ ok: false, errors: [`blocks: no task #${id}.`] }, '')
        }
      }
      const res = addTask(ROOT, {
        section: a.section, title: a.title, heat: a.heat, kind: a.kind ?? 'task',
        detail: a.detail ?? null, tags: splitList(a.tags), size: a.size ?? null,
        refs: splitList(a.refs), links: splitList(a.links).map(Number),
        dependsOn: splitList(a.dependsOn).map(Number),
        // --milestone deprecated: alias read as long as it exists (backwards compat #133).
        epic: a.epic ?? a.milestone ?? null,
        source: a.source ?? 'ai',
      })
      // Chaining AFTER creation (the milestone's id now exists), mirroring the CLI.
      if (res.ok && blocks.length > 0) {
        const newId = res.task.id
        for (const id of blocks) {
          const t = findTask(readTree(ROOT), id).task
          if (!t.dependsOn.includes(newId)) updateTask(ROOT, id, { dependsOn: [...t.dependsOn, newId] })
        }
      }
      return fromRes(res, res.ok ? `#${res.task.id} created → ${res.task.file}` : '', res.ok ? res.task : undefined)
    },
  },
  {
    name: 'quick',
    description: 'Rapid-create alias for a task (#250 — kind:quick removed): title + type suffice. type is REQUIRED (#293 — no silent default). --start chains the start.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        type: S.type,
        heat: S.heat,
        tags: { type: 'array', items: { type: 'string' } },
        start: { type: 'boolean', description: 'start immediately (todo → in_progress)' },
      },
      required: ['title', 'type'], additionalProperties: false,
    },
    handler: (a) => {
      // #293 : type OBLIGATOIRE (plus de défaut silencieux). type nu ("feature") → section canonique.
      const section = TYPES.find((t) => t.slug === a.type || t.slug.replace(/^\d+-/, '') === a.type)?.slug
      if (!section) return fail(`quick: unknown type "${a.type}" — expected one of the 9 canonical types (e.g. 01-bug).`)
      const res = addTask(ROOT, { section, title: a.title, heat: a.heat, tags: splitList(a.tags) })
      if (!res.ok) return fromRes(res)
      if (a.start) {
        const s = startTask(ROOT, res.task.id)
        if (!s.ok) return fromRes(s)
      }
      const tree = readTree(ROOT)
      const hit = findTask(tree, res.task.id)
      return ok(`#${res.task.id} created${a.start ? ' and started' : ''}.`, hit.task)
    },
  },
  {
    name: 'start',
    description: 'Starts a task (todo → in_progress).',
    inputSchema: S.id,
    handler: ({ id }) => fromRes(startTask(ROOT, id), `#${id} started (in_progress).`),
  },
  {
    name: 'done',
    description: 'Logs a delivery (→ done). Without commit, the app fills in HEAD. outcome = what was delivered; verification = what was OBSERVED (encouraged, non-blocking).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        commit: { type: 'string', description: 'delivery sha (default: current HEAD)' },
        outcome: { type: 'string' },
        verification: { type: 'string' },
        release: { type: 'string' },
        resolveFeedback: { description: "Resolve feedback at close (#149): 'all' or 1-based positions [1,3]." },
      },
      required: ['id'], additionalProperties: false,
    },
    handler: (a) => {
      // Autofill HEAD (#71): the agent no longer reads git.
      let commit = typeof a.commit === 'string' ? a.commit : undefined
      if (commit === undefined) { const head = git('rev-parse --short HEAD'); if (head) commit = head }
      const res = doneTask(ROOT, a.id, { commit, outcome: a.outcome, verification: a.verification, release: a.release, resolveFeedback: a.resolveFeedback })
      if (!res.ok) return fromRes(res)
      const tree = readTree(ROOT)
      const hit = findTask(tree, a.id)
      const suffix = res.warnings?.length ? `\n⚠ ${res.warnings.join('\n⚠ ')}` : ''
      // warnings ALSO in structured: the client may hide the text (#95).
      return ok(`#${a.id} done.${commit ? ` commit=${commit}.` : ''}${suffix}`, { task: hit.task, warnings: res.warnings ?? [] })
    },
  },
  {
    name: 'feedback',
    description: 'Capture a note on a task WITHOUT a new ticket (#149). Same scope → reopen (take/start) + re-done; new scope → a quick.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        text: { type: 'string' },
        author: { type: 'string', description: 'default: user' },
      },
      required: ['id', 'text'], additionalProperties: false,
    },
    handler: (a) => {
      const res = addFeedback(ROOT, a.id, { text: a.text, author: a.author })
      if (!res.ok) return fromRes(res)
      return ok(`feedback added to #${a.id}. Same scope → reopen (take/start ${a.id}) then re-done; new scope → a quick.`, { task: res.task })
    },
  },
  {
    name: 'update',
    description: 'Generic patch of a task (string fields, lists, dependsOn, epic). Send [] to clear a list.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' }, detail: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        size: { type: 'string' }, heat: S.heat, code: { type: 'string' }, source: { type: 'string', enum: ['ai', 'user'] },
        commit: { type: 'string' }, outcome: { type: 'string' }, verification: { type: 'string' }, release: { type: 'string' },
        epic: { type: 'string', description: 'slug of the cross-cutting grouping (epic)' },
        milestone: { type: 'string', description: 'DEPRECATED — alias of epic (#133)' },
        tags: { type: 'array', items: { type: 'string' } }, refs: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'number' } }, dependsOn: { type: 'array', items: { type: 'number' } },
      },
      required: ['id'], additionalProperties: false,
    },
    handler: (a) => {
      const patch = {}
      for (const f of ['title', 'detail', 'status', 'size', 'heat', 'code', 'source', 'commit', 'outcome', 'verification', 'release', 'epic']) {
        if (a[f] !== undefined) patch[f] = a[f]
      }
      // --milestone deprecated: alias of epic as long as it exists (backwards compat #133).
      if (a.milestone !== undefined && a.epic === undefined) patch.epic = a.milestone
      if (a.tags !== undefined) patch.tags = splitList(a.tags)
      if (a.refs !== undefined) patch.refs = splitList(a.refs)
      if (a.links !== undefined) patch.links = splitList(a.links).map(Number)
      if (a.dependsOn !== undefined) patch.dependsOn = splitList(a.dependsOn).map(Number)
      return fromRes(updateTask(ROOT, a.id, patch), `#${a.id} updated.`)
    },
  },
  ]
}

// ------------------------------------------------------------------ server
/** Mounts an MCP server wired to `tools` (registry already bound to a ROOT). */
export function buildServer(tools) {
  const server = new Server({ name: 'roadmapped', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name)
    if (!tool) return fail(`Unknown tool: ${req.params.name}`)
    try {
      return await tool.handler(req.params.arguments ?? {})
    } catch (e) {
      // Business error (lock timeout, write failure, etc.) → isError with the self-contained message.
      return fail(`Tool ${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  return server
}

// Only starts the transport when run as a binary (not on test import).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { tasksDir: ROOT } = loadPaths()
  await buildServer(makeTools(ROOT)).connect(new StdioServerTransport())
  process.stderr.write('roadmapped MCP server ready (stdio).\n')
}
