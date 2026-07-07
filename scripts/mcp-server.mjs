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
import {
  treeWithErrors, readTree, findTask,
  addTask, startTask, doneTask, updateTask, archiveTask,
} from '../src/lib/taskWrites.ts'
import { computeAvailability, activeTasks, nextQueue } from '../src/lib/roadmap.ts'
import { briefText, sitrepText, taskLine, refLine, git } from '../src/lib/render.ts'
import { TEAMS } from '../src/lib/tasks.ts'

// ------------------------------------------------------------------ helpers de sortie
const ok = (text, structured) => ({
  content: [{ type: 'text', text }],
  ...(structured !== undefined ? { structuredContent: structured } : {}),
})
const fail = (text) => ({ content: [{ type: 'text', text }], isError: true })
/** MutationResult → sortie MCP : succès (texte + tâche structurée) ou isError (erreurs autoportantes). */
const fromRes = (res, okText, structured) =>
  res.ok ? ok(okText, structured) : fail(`Échec :\n${res.errors.map((e) => `  - ${e}`).join('\n')}`)
const splitList = (v) => (Array.isArray(v) ? v : typeof v === 'string' && v !== '' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

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

  // ---------------------------------------------------------------- écriture (#92)
  // Via taskWrites : validation + rollback + verrou (#83) HÉRITÉS. Une erreur métier
  // (team hors enum, cycle, section absente) revient en isError avec le message du noyau.
  {
    name: 'add',
    description: 'Crée une tâche. team REQUISE (enum fixe). Pour un mini-ticket, préférer quick.',
    inputSchema: {
      type: 'object',
      properties: {
        section: { type: 'string', description: 'slug de stage (01-idea … 08-mature)' },
        title: { type: 'string' },
        team: S.team,
        detail: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        size: { type: 'string', enum: ['S', 'M', 'L'] },
        refs: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'number' } },
        dependsOn: { type: 'array', items: { type: 'number' } },
        milestone: { type: 'string' },
        source: { type: 'string', enum: ['ai', 'user'] },
      },
      required: ['section', 'title', 'team'], additionalProperties: false,
    },
    handler: (a) => {
      const res = addTask(ROOT, {
        section: a.section, title: a.title, team: a.team,
        detail: a.detail ?? null, tags: splitList(a.tags), size: a.size ?? null,
        refs: splitList(a.refs), links: splitList(a.links).map(Number),
        dependsOn: splitList(a.dependsOn).map(Number), milestone: a.milestone ?? null,
        source: a.source ?? 'ai',
      })
      return fromRes(res, res.ok ? `#${res.task.id} créée → ${res.task.file}` : '', res.ok ? res.task : undefined)
    },
  },
  {
    name: 'quick',
    description: 'Crée un mini-ticket (kind:quick) : titre + team suffisent (stage défaut = 1er open). --start enchaîne le start. Au done, outcome requis mais verification facultative.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        team: S.team,
        stage: { type: 'string', description: 'slug de stage (défaut : 1er stage open)' },
        tags: { type: 'array', items: { type: 'string' } },
        start: { type: 'boolean', description: 'démarrer aussitôt (todo → in_progress)' },
      },
      required: ['title', 'team'], additionalProperties: false,
    },
    handler: (a) => {
      const stage = a.stage ?? readTree(ROOT).sections.find((s) => s.status === 'open')?.key
      if (!stage) return fail('Aucun stage "open" pour accueillir le quick — préciser stage.')
      const res = addTask(ROOT, { section: stage, title: a.title, team: a.team, tags: splitList(a.tags), kind: 'quick' })
      if (!res.ok) return fromRes(res)
      if (a.start) {
        const s = startTask(ROOT, res.task.id)
        if (!s.ok) return fromRes(s)
      }
      const tree = readTree(ROOT)
      const hit = findTask(tree, res.task.id)
      return ok(`#${res.task.id} créée (quick)${a.start ? ' et démarrée' : ''}.`, hit.task)
    },
  },
  {
    name: 'start',
    description: 'Démarre une tâche (todo → in_progress).',
    inputSchema: S.id,
    handler: ({ id }) => fromRes(startTask(ROOT, id), `#${id} démarrée (in_progress).`),
  },
  {
    name: 'done',
    description: 'Consigne une livraison (→ done). Sans commit, l\'app remplit le HEAD. outcome = ce qui a été livré ; verification = ce qui a été OBSERVÉ (facultative pour un quick).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        commit: { type: 'string', description: 'sha de livraison (défaut : HEAD courant)' },
        outcome: { type: 'string' },
        verification: { type: 'string' },
        release: { type: 'string' },
      },
      required: ['id'], additionalProperties: false,
    },
    handler: (a) => {
      // Autofill HEAD (#71) : l'agent ne lit plus git.
      let commit = typeof a.commit === 'string' ? a.commit : undefined
      if (commit === undefined) { const head = git('rev-parse --short HEAD'); if (head) commit = head }
      const res = doneTask(ROOT, a.id, { commit, outcome: a.outcome, verification: a.verification, release: a.release })
      if (!res.ok) return fromRes(res)
      const tree = readTree(ROOT)
      const hit = findTask(tree, a.id)
      const suffix = res.warnings?.length ? `\n⚠ ${res.warnings.join('\n⚠ ')}` : ''
      return ok(`#${a.id} terminée (done).${commit ? ` commit=${commit}.` : ''}${suffix}`, hit.task)
    },
  },
  {
    name: 'update',
    description: 'Patch générique d\'une tâche (champs string, listes, dependsOn, milestone). Envoyer [] pour vider une liste.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' }, detail: { type: 'string' }, status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        size: { type: 'string' }, team: S.team, code: { type: 'string' }, source: { type: 'string', enum: ['ai', 'user'] },
        commit: { type: 'string' }, outcome: { type: 'string' }, verification: { type: 'string' }, release: { type: 'string' },
        milestone: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }, refs: { type: 'array', items: { type: 'string' } },
        links: { type: 'array', items: { type: 'number' } }, dependsOn: { type: 'array', items: { type: 'number' } },
      },
      required: ['id'], additionalProperties: false,
    },
    handler: (a) => {
      const patch = {}
      for (const f of ['title', 'detail', 'status', 'size', 'team', 'code', 'source', 'commit', 'outcome', 'verification', 'release', 'milestone']) {
        if (a[f] !== undefined) patch[f] = a[f]
      }
      if (a.tags !== undefined) patch.tags = splitList(a.tags)
      if (a.refs !== undefined) patch.refs = splitList(a.refs)
      if (a.links !== undefined) patch.links = splitList(a.links).map(Number)
      if (a.dependsOn !== undefined) patch.dependsOn = splitList(a.dependsOn).map(Number)
      return fromRes(updateTask(ROOT, a.id, patch), `#${a.id} mise à jour.`)
    },
  },
  {
    name: 'archive',
    description: 'Déplace une tâche done vers _archive/<stage>/ (avec son dossier jumeau de sous-tâches).',
    inputSchema: S.id,
    handler: ({ id }) => fromRes(archiveTask(ROOT, id), `#${id} archivée → _archive/.`),
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
