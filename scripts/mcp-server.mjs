#!/usr/bin/env node
// Serveur MCP Roadmaped (#91-92) — l'étage final de l'économie de tokens : les
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
import { treeWithErrors, readTree, findTask, startTask } from '../src/lib/taskWrites.ts'
import { computeAvailability, activeTasks, nextQueue } from '../src/lib/roadmap.ts'
import { briefText, sitrepText, taskLine, refLine, STATUS_FR } from '../src/lib/render.ts'
import { TEAMS } from '../src/lib/tasks.ts'

// ------------------------------------------------------------------ helpers de sortie
const ok = (text, structured) => ({
  content: [{ type: 'text', text }],
  ...(structured !== undefined ? { structuredContent: structured } : {}),
})
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true })

// Schémas de params réutilisés (le schéma EST la doc injectée dans le contexte).
const S = {
  none: { type: 'object', properties: {}, additionalProperties: false },
  id: {
    type: 'object',
    properties: { id: { type: 'number', description: 'id global de la tâche (ex: 42)' } },
    required: ['id'], additionalProperties: false,
  },
  team: { type: 'string', enum: TEAMS, description: 'équipe métier (enum fixe)' },
}

/** Rendu texte détaillé d'une tâche (équivalent de `show` du CLI). */
function showText(hit, tree) {
  const t = hit.task
  const L = [taskLine(t, ''), `  section: ${hit.sectionKey}${hit.archived ? ' (archive)' : ''}`, `  fichier: ${t.file}`]
  if (t.detail) L.push(`  detail: ${t.detail.trim()}`)
  if (t.refs.length) L.push(`  refs: ${t.refs.join(' · ')}`)
  if (t.dependsOn.length) L.push(`  dépend de: ${t.dependsOn.map((d) => refLine(tree, d)).join(' · ')}`)
  if (t.links.length) L.push(`  liées: ${t.links.map((l) => refLine(tree, l)).join(' · ')}`)
  if (t.outcome) L.push(`  outcome: ${t.outcome}`)
  if (t.verification) L.push(`  vérification: ${t.verification}`)
  L.push(`  dates: créée ${t.createdAt}${t.completedAt ? ` · terminée ${t.completedAt}` : ''} · source ${t.source}`)
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
    description: "L'état du monde en ≤30 lignes : done du jour, in_progress, 3 prochaines, validate, alertes. LE 1er geste de session.",
    inputSchema: S.none,
    handler: () => {
      const { tree, errors } = treeWithErrors(ROOT)
      return ok(sitrepText(tree, errors), { validateOk: errors.length === 0, errors })
    },
  },
  {
    name: 'brief',
    description: "Le contexte d'exécution dense d'une tâche (deps/liées titrées, refs + extraits d'ancre & fraîcheur, rappel done). Remplace show en cascade.",
    inputSchema: S.id,
    handler: ({ id }) => {
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return hit ? ok(briefText(tree, hit), hit.task) : fail(`Aucune tâche #${id}.`)
    },
  },
  {
    name: 'show',
    description: 'Détail complet d\'une tâche (id global).',
    inputSchema: S.id,
    handler: ({ id }) => {
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return hit ? ok(showText(hit, tree), hit.task) : fail(`Aucune tâche #${id}.`)
    },
  },
  {
    name: 'next',
    description: 'La file de travail : les N prochaines todo DISPONIBLES (deps done), ordre stage puis ancienneté. À CONSOMMER telle quelle.',
    inputSchema: {
      type: 'object',
      properties: { count: { type: 'number', description: 'nombre de tâches (défaut 1)' }, team: S.team },
      additionalProperties: false,
    },
    handler: ({ count = 1, team } = {}) => {
      const queue = nextQueue(readTree(ROOT), { team }).slice(0, Math.max(1, count))
      if (queue.length === 0) return ok('Aucune tâche disponible (tout est fait, verrouillé ou en cours).', [])
      return ok(queue.map((t) => taskLine(t, '')).join('\n'), queue.map((t) => ({ id: t.id, title: t.title, team: t.team, size: t.size })))
    },
  },
  {
    name: 'take',
    description: 'Ouvre une session : next + start + brief EN UN APPEL. Prend la prochaine tâche dispo (optionnellement filtrée par team), la démarre, renvoie son brief.',
    inputSchema: { type: 'object', properties: { team: S.team }, additionalProperties: false },
    handler: ({ team } = {}) => {
      const queue = nextQueue(readTree(ROOT), { team })
      if (queue.length === 0) return ok(`Aucune tâche disponible${team ? ` pour la team ${team}` : ''}.`, null)
      const id = queue[0].id
      const res = startTask(ROOT, id)
      if (!res.ok) return fail(`Échec du start #${id} :\n${res.errors.join('\n')}`)
      const tree = readTree(ROOT)
      const hit = findTask(tree, id)
      return ok(`#${id} démarrée.\n${briefText(tree, hit)}`, hit.task)
    },
  },
  {
    name: 'list',
    description: 'Liste le backlog, filtrable par section/status/team/tag, archive incluse en option.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'slug de stage (01-idea … 08-mature)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        team: S.team,
        tag: { type: 'string', description: 'ne garde que les tâches portant ce tag (ex: debt)' },
        archive: { type: 'boolean', description: 'inclure les stages archivés' },
      },
      additionalProperties: false,
    },
    handler: (a = {}) => {
      const tree = readTree(ROOT)
      let sections = a.archive ? [...tree.sections, ...tree.archive] : tree.sections
      if (a.section) sections = sections.filter((s) => s.key === a.section)
      const keep = (pred) => { sections = sections.map((s) => ({ ...s, tasks: s.tasks.filter(pred) })).filter((s) => s.tasks.length) }
      if (a.status) keep((t) => t.status === a.status)
      if (a.team) keep((t) => t.team === a.team)
      if (a.tag) keep((t) => t.tags.includes(a.tag))
      const lines = []
      const light = []
      for (const s of sections) {
        const done = s.tasks.filter((t) => t.status === 'done').length
        lines.push(`${s.key} — ${s.title} (${s.status}) ${done}/${s.tasks.length}`)
        for (const t of s.tasks) {
          lines.push(taskLine(t))
          light.push({ id: t.id, title: t.title, status: t.status, team: t.team, stage: s.key, size: t.size, kind: t.kind })
        }
      }
      return ok(lines.join('\n') || '(aucune tâche)', light)
    },
  },
  {
    name: 'roadmap',
    description: 'Vue jalons/progression : chaque tâche done/disponible/verrouillée (deps manquantes).',
    inputSchema: S.none,
    handler: () => {
      const tree = readTree(ROOT)
      const avail = computeAvailability(tree)
      const active = activeTasks(tree)
      const missingOf = (t) => t.dependsOn.filter((d) => avail.get(d) === 'available' || avail.get(d) === 'locked')
      const model = active.map((t) => ({
        id: t.id, title: t.title, team: t.team, milestone: t.milestone,
        state: avail.get(t.id) ?? 'available', missing: missingOf(t),
      }))
      if (tree.roadmaps.length === 0) {
        const summary = `Aucune roadmap déclarée (_roadmaps.yaml absent). ${active.length} tâches actives.`
        return ok(summary, model)
      }
      const lines = model.map((m) => {
        const tag = m.state === 'done' ? '[x]' : m.state === 'available' ? '[~] (disponible)' : `[ ] (verrouillé: ${m.missing.map((d) => `#${d}`).join(' ')})`
        return `${tag} #${m.id} ${m.title} (${m.team})`
      })
      return ok(lines.join('\n'), model)
    },
  },
  {
    name: 'validate',
    description: 'Valide tout docs/tasks/ (schéma + unicité des ids + nextId, archive comprise).',
    inputSchema: S.none,
    handler: () => {
      const { errors } = treeWithErrors(ROOT)
      return errors.length === 0
        ? ok('OK — validation passée.', { ok: true, errors: [] })
        : fail(`${errors.length} erreur(s) :\n${errors.map((e) => `  - ${e}`).join('\n')}`)
    },
  },
  ]
}

// ------------------------------------------------------------------ serveur
/** Monte un serveur MCP branché sur `tools` (registre déjà lié à un ROOT). */
export function buildServer(tools) {
  const server = new Server({ name: 'roadmaped', version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name)
    if (!tool) return fail(`Tool inconnu : ${req.params.name}`)
    try {
      return await tool.handler(req.params.arguments ?? {})
    } catch (e) {
      // Erreur métier (verrou timeout, écriture, etc.) → isError avec le message autoportant.
      return fail(`Échec du tool ${tool.name} : ${e instanceof Error ? e.message : String(e)}`)
    }
  })
  return server
}

// Ne démarre le transport que si lancé comme binaire (pas à l'import du test).
if (import.meta.url === `file://${process.argv[1]}`) {
  const { tasksDir: ROOT } = loadPaths()
  await buildServer(makeTools(ROOT)).connect(new StdioServerTransport())
  process.stderr.write('roadmaped MCP server prêt (stdio).\n')
}
