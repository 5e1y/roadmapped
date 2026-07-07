import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, resolve, isAbsolute, sep } from 'node:path'

/** Nœud de l'arbre docs : dossier (children présent) ou fichier .md (feuille). */
export interface DocNode {
  name: string
  /** Chemin relatif POSIX à docsDir (jamais de `\`, même sur Windows). */
  path: string
  children?: DocNode[]
  /** Date de création du fichier (AAAA-MM-JJ) — absente pour les dossiers. */
  createdAt?: string
}

const IGNORE_DIRS = new Set(['node_modules'])

const isHidden = (name: string): boolean => name.startsWith('.')

const toPosix = (p: string): string => p.split(sep).join('/')

/**
 * Arbre récursif de docsDir : dossiers + fichiers `.md` uniquement, entrées
 * cachées et `node_modules` exclues. Un dossier sans aucun `.md` descendant
 * (ex. `docs/tasks`, du YAML pur) disparaît naturellement de l'arbre — pas de
 * filtre nommé, juste l'absence d'enfants. Tri : dossiers d'abord, puis ordre
 * naturel (numérique) — « 10-x.md » après « 2-x.md », pas avant.
 */
export function buildDocsTree(docsDir: string, root: string = docsDir): DocNode[] {
  let entries: string[]
  try {
    entries = readdirSync(docsDir)
  } catch {
    return []
  }

  const dirs: DocNode[] = []
  const files: DocNode[] = []

  for (const entry of entries) {
    if (isHidden(entry) || IGNORE_DIRS.has(entry)) continue
    const full = join(docsDir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const children = buildDocsTree(full, root)
      if (children.length > 0) {
        dirs.push({ name: entry, path: toPosix(relative(root, full)), children })
      }
    } else if (entry.endsWith('.md')) {
      // birthtime = création réelle ; certains FS ne la portent pas (epoch 0) →
      // repli sur mtime, moins juste mais jamais absurde.
      const birth = st.birthtimeMs > 0 ? st.birthtime : st.mtime
      files.push({ name: entry, path: toPosix(relative(root, full)), createdAt: birth.toISOString().slice(0, 10) })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  return [...dirs, ...files]
}

/** Même doctrine que `unsafeSegment` (api.ts) mais autorise les `/` internes (sous-dossiers). */
export function unsafeDocPath(p: unknown): boolean {
  return typeof p !== 'string' || p.trim() === '' || p.includes('..') || isAbsolute(p)
}

export type ReadDocOutcome =
  | { ok: true; content: string }
  | { ok: false; status: 400 | 404; error: string }

/**
 * Lit un `.md` sous docsDir. Double garde contre le path traversal : rejet
 * syntaxique (`..`, absolu) PUIS vérification par résolution réelle du
 * chemin (le résultat doit rester sous docsDir) — défense en profondeur.
 * NB : resolve() ne suit pas les symlinks ; un lien symbolique interne
 * pointant hors périmètre passerait (realpathSync le couvrirait) — risque
 * assumé pour un outil localhost lisant les fichiers de l'utilisateur.
 */
export function readDocContent(docsDir: string, relPath: string): ReadDocOutcome {
  if (unsafeDocPath(relPath)) {
    return { ok: false, status: 400, error: 'path invalide (traversal refusé).' }
  }
  if (!relPath.endsWith('.md')) {
    return { ok: false, status: 400, error: 'seuls les fichiers .md sont lisibles.' }
  }

  const root = resolve(docsDir)
  const target = resolve(root, relPath)
  const rootWithSep = root.endsWith(sep) ? root : root + sep
  if (target !== root && !target.startsWith(rootWithSep)) {
    return { ok: false, status: 400, error: 'path hors de docsDir refusé.' }
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    return { ok: false, status: 404, error: 'fichier introuvable.' }
  }

  return { ok: true, content: readFileSync(target, 'utf8') }
}
