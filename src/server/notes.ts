// Notepad (#86) — incubateur d'idées local. Fichiers .md plats sous docs/notes/ (pas de
// front-matter : le nom de fichier + les stats FS suffisent). GITIGNORÉ (#87) : purement
// local, hors historique. Le titre = 1re ligne de la note ; le fichier est renommé au fil
// de l'eau. reveal ouvre le Finder sur un fichier (chemin absolu validé, dans le HOME).

import {
  readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync, renameSync, rmSync,
} from 'node:fs'
import { join, isAbsolute, resolve, sep, dirname, relative } from 'node:path'
import { homedir, platform } from 'node:os'
import { spawn } from 'node:child_process'

const notesDir = (docsDir: string) => join(docsDir, 'notes')
const archiveDir = (docsDir: string) => join(docsDir, 'notes', '_archive')

/** Slug sûr depuis un titre libre (ASCII, tirets) ; '' si rien d'exploitable. */
function slugify(title: string): string {
  return title
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/g, '')
}

/** Un slug de note est un nom de fichier simple, jamais un chemin. */
export const unsafeSlug = (s: unknown): boolean =>
  typeof s !== 'string' || s === '' || s.includes('/') || s.includes('\\') || s.includes('..')

const firstLine = (content: string) => (content.split('\n')[0] ?? '').trim()
const titleOf = (content: string, slug: string) => firstLine(content) || slug

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Ajoute `line` à un .gitignore si absente (idempotent). Renvoie true si écrit. */
export function ensureGitignore(gitignorePath: string, line: string): boolean {
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
  if (existing.split('\n').some((l) => l.trim() === line)) return false
  const pad = existing === '' || existing.endsWith('\n') ? '' : '\n'
  writeFileSync(gitignorePath, `${existing}${pad}${line}\n`)
  return true
}

/**
 * Setup Notepad au démarrage du serveur (#87) : crée docs/notes/ et garantit que le
 * dossier est gitignoré (ligne relative au repoRoot). Idempotent — appelé une fois au
 * boot, JAMAIS dans les tests unitaires (qui appellent runAction directement).
 */
export function ensureNotesSetup(docsDir: string, repoRoot: string): void {
  ensureDir(notesDir(docsDir))
  const rel = relative(repoRoot, notesDir(docsDir)).split(sep).join('/')
  // Sous le repo → chemin relatif ignoré ; hors repo (config exotique) → on s'abstient.
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    ensureGitignore(join(repoRoot, '.gitignore'), `${rel}/`)
  }
}

export interface NoteMeta { slug: string; title: string; modified: number }

/** Notes actives (hors _archive), triées par modification décroissante. */
export function listNotes(docsDir: string): NoteMeta[] {
  const dir = notesDir(docsDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const slug = f.replace(/\.md$/, '')
      const content = readFileSync(join(dir, f), 'utf8')
      return { slug, title: titleOf(content, slug), modified: statSync(join(dir, f)).mtimeMs }
    })
    .sort((a, b) => b.modified - a.modified)
}

export type NoteResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number; error: string }

export function readNote(docsDir: string, slug: string): NoteResult {
  if (unsafeSlug(slug)) return { ok: false, status: 400, error: 'slug invalide.' }
  const file = join(notesDir(docsDir), `${slug}.md`)
  if (!existsSync(file)) return { ok: false, status: 404, error: `Note inconnue : ${slug}.` }
  const content = readFileSync(file, 'utf8')
  return { ok: true, status: 200, payload: { slug, title: titleOf(content, slug), content } }
}

/** Crée une note (contenu initial optionnel), slug dérivé du titre, unicité garantie. */
export function createNote(docsDir: string, content = ''): NoteResult {
  const dir = notesDir(docsDir)
  ensureDir(dir)
  const base = slugify(firstLine(content)) || 'note'
  let slug = base
  for (let n = 2; existsSync(join(dir, `${slug}.md`)); n++) slug = `${base}-${n}`
  writeFileSync(join(dir, `${slug}.md`), content, 'utf8')
  return { ok: true, status: 200, payload: { slug, title: titleOf(content, slug), content } }
}

/**
 * Écrit le contenu et RENOMME au fil de l'eau si la 1re ligne donne un nouveau slug
 * libre (sinon garde le slug courant). Renvoie le slug effectif.
 */
export function writeNote(docsDir: string, slug: string, content: string): NoteResult {
  if (unsafeSlug(slug)) return { ok: false, status: 400, error: 'slug invalide.' }
  if (typeof content !== 'string') return { ok: false, status: 400, error: 'content requis (string).' }
  const dir = notesDir(docsDir)
  ensureDir(dir)
  const cur = join(dir, `${slug}.md`)
  let effective = slug
  const desired = slugify(firstLine(content))
  if (desired && desired !== slug && !existsSync(join(dir, `${desired}.md`))) {
    if (existsSync(cur)) renameSync(cur, join(dir, `${desired}.md`))
    effective = desired
  }
  writeFileSync(join(dir, `${effective}.md`), content, 'utf8')
  return { ok: true, status: 200, payload: { slug: effective, title: titleOf(content, effective), content } }
}

/** Déplace une note vers notes/_archive/ (unicité par suffixe si collision). */
export function archiveNote(docsDir: string, slug: string): NoteResult {
  if (unsafeSlug(slug)) return { ok: false, status: 400, error: 'slug invalide.' }
  const src = join(notesDir(docsDir), `${slug}.md`)
  if (!existsSync(src)) return { ok: false, status: 404, error: `Note inconnue : ${slug}.` }
  ensureDir(archiveDir(docsDir))
  let dst = join(archiveDir(docsDir), `${slug}.md`)
  for (let n = 2; existsSync(dst); n++) dst = join(archiveDir(docsDir), `${slug}-${n}.md`)
  renameSync(src, dst)
  return { ok: true, status: 200, payload: { ok: true } }
}

export function deleteNote(docsDir: string, slug: string): NoteResult {
  if (unsafeSlug(slug)) return { ok: false, status: 400, error: 'slug invalide.' }
  const file = join(notesDir(docsDir), `${slug}.md`)
  if (!existsSync(file)) return { ok: false, status: 404, error: `Note inconnue : ${slug}.` }
  rmSync(file)
  return { ok: true, status: 200, payload: { ok: true } }
}

/** Commande d'ouverture dans l'explorateur de fichiers, par plateforme. */
function revealCommand(path: string): { cmd: string; args: string[] } {
  if (platform() === 'darwin') return { cmd: 'open', args: ['-R', path] }
  if (platform() === 'win32') return { cmd: 'explorer', args: [`/select,${path}`] }
  return { cmd: 'xdg-open', args: [dirname(path)] } // Linux : dossier parent
}

/**
 * Ouvre le Finder/explorateur sur un fichier. SÉCURITÉ : chemin absolu EXIGÉ, existence
 * vérifiée, REFUS de tout chemin hors du HOME de l'utilisateur. Pas de shell (spawn en
 * argv) → aucune injection. La validation précède TOUJOURS le spawn (testable sans ouvrir).
 */
export function revealPath(path: unknown): NoteResult {
  if (typeof path !== 'string' || path === '') return { ok: false, status: 400, error: 'path requis (chemin absolu).' }
  if (!isAbsolute(path)) return { ok: false, status: 400, error: 'path doit être absolu.' }
  const home = homedir()
  const resolved = resolve(path)
  if (resolved !== home && !resolved.startsWith(home + sep)) {
    return { ok: false, status: 403, error: 'chemin hors du HOME de l\'utilisateur — refusé.' }
  }
  if (!existsSync(resolved)) return { ok: false, status: 404, error: 'fichier introuvable.' }
  const { cmd, args } = revealCommand(resolved)
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  return { ok: true, status: 200, payload: { ok: true } }
}
