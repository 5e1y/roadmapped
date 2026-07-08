// Notepad (#89) — pièces jointes en LIENS, jamais en copie. Une pièce jointe est une
// ligne texte `[fichier: /chemin/absolu]` dans la note : parsing de ces lignes, nettoyage
// « Copier pour l'agent » (chemins nus, prêts pour un terminal), insertion sur ligne
// dédiée au drop, extraction des chemins depuis un DataTransfer. Tout est pur (sans DOM).

/** Ligne pièce jointe : `[fichier: <chemin ou nom>]` (espaces tolérés autour). */
const FILE_LINE_RE = /^\s*\[fichier:\s*(\S(?:.*\S)?)\s*\]\s*$/

export const fileLineOf = (path: string): string => `[fichier: ${path}]`

/** Chemin (ou simple nom, cas fallback navigateur) porté par une ligne `[fichier: …]`, sinon null. */
export function parseFileLine(line: string): string | null {
  const m = FILE_LINE_RE.exec(line)
  return m ? m[1] : null
}

/**
 * Note nettoyée pour un terminal d'agent : chaque ligne `[fichier: /chemin]` devient le
 * chemin NU (`/chemin`), tout le reste (titre en 1re ligne compris) est conservé tel quel.
 * Le Cmd+C brut, lui, copie la note telle qu'écrite — ce nettoyage est un geste explicite.
 */
export function cleanForAgent(content: string): string {
  return content.split('\n').map((l) => parseFileLine(l) ?? l).join('\n')
}

/**
 * Insère `lines` sur des lignes DÉDIÉES à la position `pos` (caret au moment du drop) :
 * coupe la ligne en cours si besoin (newline avant/après), garantit une ligne vierge en
 * fin de note pour continuer à écrire. Renvoie le contenu et la position du caret.
 */
export function insertOnOwnLines(
  content: string, pos: number, lines: string[],
): { content: string; caret: number } {
  const p = Math.max(0, Math.min(pos, content.length))
  const before = content.slice(0, p)
  const after = content.slice(p)
  const block = lines.join('\n')
  const prefix = before === '' || before.endsWith('\n') ? '' : '\n'
  const suffix = after === '' ? '\n' : after.startsWith('\n') ? '' : '\n'
  const caret = p + prefix.length + block.length + suffix.length
  return { content: before + prefix + block + suffix + after, caret }
}

/** Vue minimale d'un DataTransfer — testable sans DOM. */
export interface DropData {
  files: ArrayLike<{ name: string; path?: unknown }>
  getData: (type: string) => string
}

const isAbsolute = (p: string): boolean => p.startsWith('/')

/**
 * Chemins extraits d'un drop, par canaux de plus en plus dégradés :
 * 1. `file.path` (Electron/webview local — absent des navigateurs purs) ;
 * 2. `text/uri-list` en `file://` (certains gestionnaires de fichiers) ;
 * 3. `text/plain` qui ressemble à des chemins absolus (drag depuis un TERMINAL —
 *    le canal fiable en navigateur pur sur macOS).
 * `names` = fichiers dont seul le NOM est connu (drop Finder→navigateur : la sandbox
 * masque le chemin absolu) — le fallback gracieux, jamais un plantage.
 */
export function extractDropPaths(dt: DropData): { paths: string[]; names: string[] } {
  const uris = (dt.getData('text/uri-list') || '')
    .split(/\r?\n/)
    .filter((l) => l.startsWith('file://'))
    .map((u) => { try { return decodeURIComponent(new URL(u).pathname) } catch { return '' } })
    .filter(Boolean)
  const paths: string[] = []
  const names: string[] = []
  const files = Array.from(dt.files ?? [])
  files.forEach((f, i) => {
    if (typeof f.path === 'string' && isAbsolute(f.path)) paths.push(f.path)
    else if (uris[i]) paths.push(uris[i])
    else names.push(f.name)
  })
  if (files.length === 0) {
    if (uris.length > 0) paths.push(...uris)
    else {
      const text = dt.getData('text/plain') || ''
      for (const l of text.split('\n')) {
        const t = l.trim()
        if (isAbsolute(t)) paths.push(t)
      }
    }
  }
  return { paths, names }
}
