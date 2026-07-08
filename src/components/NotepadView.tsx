import { Fragment, useEffect, useRef, useState, useCallback } from 'react'
import { ViewHeader } from './ViewHeader'
import { relativeTime, absoluteDate } from '../lib/relativeTime'
import { parseFileLine, fileLineOf, cleanForAgent, insertOnOwnLines, extractDropPaths } from '../lib/noteFiles'

// Notepad (#88) — incubateur d'idées local. Liste à gauche (gabarit ligne de backlog :
// pas de bords arrondis), éditeur ghost écriture-d'abord centré à droite. À l'ouverture,
// on est projeté directement dans une note en édition. Autosave (blur + debounce 800ms),
// titre = 1re ligne (le serveur renomme au fil de l'eau, #86). Notes gitignorées (#87).
//
// Pièces jointes en LIENS (#89) : drop d'un fichier → ligne `[fichier: /chemin/absolu]`
// (jamais de copie, jamais d'upload — du texte). Clic sur la ligne → POST /api/reveal
// (#86) ouvre le Finder. « Copier pour l'agent » (⇧⌘C) → note nettoyée, chemins nus.
// Rendu : la note reste une textarea nue (édition/autosave intacts) ; un BACKDROP aux
// métriques identiques (technique « highlighted textarea ») souligne les lignes fichier
// et porte l'affordance (souligné neutre, accent + tint au survol, curseur pointeur).

interface NoteMeta { slug: string; title: string; modified: number }

const jsonOk = async (r: Response) => {
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.ok === false) throw new Error(d?.errors?.join(' · ') ?? `HTTP ${r.status}`)
  return d
}
const fetchNotes = async (): Promise<NoteMeta[]> => {
  try { return (await jsonOk(await fetch('/api/notes'))).notes ?? [] } catch { return [] }
}

// Métriques PARTAGÉES textarea ⇄ backdrop : le moindre écart (fonte, corps, interligne,
// padding, règles de coupe) désynchronise les rectangles de survol des lignes fichier.
// Le texte est borné à 48rem et centré via un padding qui absorbe l'espace libre (#101).
const EDITOR_METRICS =
  'px-[max(1.5rem,calc((100%-48rem)/2))] py-8 text-[2rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word]'

export function NotepadView() {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [flash, setFlash] = useState<string | null>(null)
  const [hoverLine, setHoverLine] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const [warned, setWarned] = useState(() => {
    try { return localStorage.getItem('notepad:warned') === '1' } catch { return false }
  })
  const slugRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  slugRef.current = slug
  contentRef.current = content

  const refreshList = useCallback(async () => { setNotes(await fetchNotes()) }, [])

  const openNote = useCallback(async (s: string) => {
    try {
      const d = await jsonOk(await fetch(`/api/notes/${s}`))
      setSlug(d.slug); setContent(d.content ?? ''); setStatus('idle')
      requestAnimationFrame(() => textareaRef.current?.focus())
    } catch { /* note disparue → ignorer */ }
  }, [])

  // Enregistre le contenu courant ; réconcilie le slug si le serveur a renommé (#86).
  const save = useCallback(async () => {
    const s = slugRef.current
    if (!s) return
    setStatus('saving')
    try {
      const d = await jsonOk(await fetch(`/api/notes/${s}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentRef.current }),
      }))
      if (d.slug && d.slug !== s) { setSlug(d.slug); slugRef.current = d.slug }
      setStatus('saved')
      refreshList()
    } catch { setStatus('idle') }
  }, [refreshList])

  // Autosave debounce 800ms après la dernière frappe.
  useEffect(() => {
    if (slug === null) return
    const t = setTimeout(save, 800)
    return () => clearTimeout(t)
  }, [content, slug, save])

  const createNote = useCallback(async () => {
    await save() // fige la note courante avant d'en ouvrir une neuve
    try {
      const d = await jsonOk(await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: '' }),
      }))
      setSlug(d.slug); setContent(''); setStatus('idle')
      await refreshList()
      requestAnimationFrame(() => textareaRef.current?.focus())
    } catch { /* création échouée → rien */ }
  }, [save, refreshList])

  // À l'ouverture : projeté directement dans une note en édition (la plus récente,
  // ou une neuve si le carnet est vide). Une seule fois au montage.
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      const list = await fetchNotes()
      setNotes(list)
      if (list.length > 0) openNote(list[0].slug)
      else createNote()
    })()
  }, [openNote, createNote])

  const removeNote = useCallback(async (s: string) => {
    await fetch(`/api/notes/${s}`, { method: 'DELETE' }).catch(() => {})
    const rest = await fetchNotes()
    setNotes(rest)
    if (slugRef.current === s) {
      if (rest.length > 0) openNote(rest[0].slug)
      else { setSlug(null); setContent('') }
    }
  }, [openNote])

  const dismissWarning = () => {
    setWarned(true)
    try { localStorage.setItem('notepad:warned', '1') } catch { /* ignore */ }
  }

  // ————— Pièces jointes en liens (#89) —————

  /** Message éphémère dans le pied de page (droite), à la place du statut de sauvegarde. */
  const flashMsg = useCallback((text: string, ms = 3000) => {
    setFlash(text)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), ms)
  }, [])
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current) }, [])

  /** Clic sur une ligne fichier → Finder via /api/reveal (#86). Erreurs en pied de page. */
  const reveal = useCallback(async (path: string) => {
    if (!path.startsWith('/')) {
      flashMsg('unknown absolute path — fill it in by hand, or drag the file from a terminal', 5000)
      return
    }
    try {
      await jsonOk(await fetch('/api/reveal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      }))
    } catch (e) {
      flashMsg(`reveal failed: ${e instanceof Error ? e.message : String(e)}`, 5000)
    }
  }, [flashMsg])

  /** « Copier pour l'agent » (⇧⌘C) : note nettoyée, lignes fichier → chemins nus. */
  const copyForAgent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cleanForAgent(contentRef.current))
      flashMsg('copied for the agent — bare paths, ready to paste', 2500)
    } catch {
      flashMsg('clipboard unavailable', 2500)
    }
  }, [flashMsg])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⇧⌘C uniquement — le ⌘C brut (copie telle qu'écrite) reste natif, intouché.
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault()
      void copyForAgent()
    }
  }

  /** Drop d'un fichier → ligne(s) `[fichier: …]` au caret. JAMAIS de copie du fichier. */
  const onDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    setDragging(false)
    const { paths, names } = extractDropPaths(e.dataTransfer)
    if (paths.length === 0 && names.length === 0) return // drop de texte ordinaire → natif
    e.preventDefault()
    const ta = e.currentTarget
    const pos = ta.selectionStart ?? contentRef.current.length
    const { content: next, caret } = insertOnOwnLines(
      contentRef.current, pos, [...paths, ...names].map(fileLineOf),
    )
    setContent(next)
    if (names.length > 0) {
      // Navigateur pur : le Finder ne livre que le NOM (sandbox). Fallback gracieux.
      flashMsg('absolute path hidden by the browser — drag the file from a terminal, or fill in the path', 6000)
    }
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret) })
  }

  /** Ligne fichier du backdrop sous le pointeur (rectangles réels, wrapping compris). */
  const fileSpanAt = (x: number, y: number): HTMLElement | null => {
    const root = backdropRef.current
    if (!root) return null
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-filepath]'))) {
      for (const r of Array.from(el.getClientRects())) {
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
      }
    }
    return null
  }

  const onEditorMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const span = fileSpanAt(e.clientX, e.clientY)
    setHoverLine(span ? Number(span.dataset.fileline) : null)
    e.currentTarget.style.cursor = span ? 'pointer' : ''
  }

  const onEditorClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    if (ta.selectionStart !== ta.selectionEnd) return // sélection en cours, pas un clic
    const path = fileSpanAt(e.clientX, e.clientY)?.dataset.filepath
    if (path) void reveal(path)
  }

  const tokens = Math.ceil(content.length / 4)
  const lines = content.split('\n')

  return (
    // Tri-couche (design.md §3.1) : la racine hérite du #fafafa du body ;
    // le flanc gauche est une surface « carte » bg-white (modèle radar Backlog).
    <div className="flex h-full flex-col">
      <ViewHeader meta={slug ?? undefined} />

      {/* Bandeau d'avertissement en registre monochrome (modèle ErrorBanner, design.md §3.6) —
          l'ambre était la seule couleur hors palette du dashboard. */}
      {!warned && (
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-1.5 text-xs text-neutral-800">
          <span>Local notes — not versioned, not saved by git (docs/notes/).</span>
          <button type="button" onClick={dismissWarning} className="shrink-0 font-medium text-neutral-900 hover:text-neutral-700">OK</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[420px] shrink-0 flex-col border-r border-neutral-200 bg-white py-2">
          {/* Création EN TÊTE de liste (pas de bouton en haut à droite, pas de ⌘N). */}
          <button
            type="button" onClick={createNote}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <span className="text-base leading-none text-neutral-500">+</span>
            New note
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {notes.map((n) => (
              <div
                key={n.slug}
                className={`group flex items-center gap-2 px-4 py-1.5 text-sm ${
                  n.slug === slug ? 'bg-accent-tint text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                <button type="button" onClick={() => openNote(n.slug)} className="min-w-0 flex-1 truncate text-left">
                  {n.title || n.slug}
                </button>
                <span className="shrink-0 font-mono text-[10px] text-neutral-500" title={absoluteDate(n.modified)}>{relativeTime(n.modified)}</span>
                {/* Action destructive : confirmation (pattern window.confirm de
                    TaskPanel.remove) ; révélée au survol ET au focus (design.md §3.4). */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete note "${n.title || n.slug}"?`)) void removeNote(n.slug)
                  }}
                  title="Delete note"
                  aria-label={`Delete note ${n.title || n.slug}`}
                  className="shrink-0 text-neutral-500 opacity-0 hover:text-neutral-700 focus-visible:opacity-100 group-hover:opacity-100"
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Zone d'édition : clic dans le vide → crée une note ; sinon éditeur ghost. */}
        {slug === null ? (
          <button
            type="button" onClick={createNote}
            className="min-h-0 flex-1 cursor-text text-sm text-neutral-500 hover:text-neutral-700"
          >
            Click here to write a note
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Éditeur = textarea nue + backdrop d'affordance (#89). Le tint au drag
                signale la cible de drop (accent-tint, le registre « actif » du dashboard). */}
            <div className={`relative min-h-0 w-full flex-1 ${dragging ? 'bg-accent-tint' : ''}`}>
              <div
                ref={backdropRef}
                aria-hidden="true"
                // Texte transparent : seules les DÉCORATIONS des lignes fichier
                // (text-decoration-color explicite, fond) sont visibles sous la textarea.
                className={`pointer-events-none absolute inset-0 select-none overflow-hidden text-transparent ${EDITOR_METRICS}`}
              >
                {lines.map((l, i) => {
                  const p = parseFileLine(l)
                  return (
                    <Fragment key={i}>
                      {p !== null ? (
                        <span
                          data-fileline={i}
                          data-filepath={p}
                          className={`underline decoration-1 underline-offset-4 ${
                            hoverLine === i ? 'bg-accent-tint decoration-accent' : 'decoration-neutral-300'
                          }`}
                        >{l}</span>
                      ) : l}
                      {i < lines.length - 1 ? '\n' : ''}
                    </Fragment>
                  )
                })}
                {/* Force le rendu d'une éventuelle dernière ligne vide (parité de
                    hauteur avec la textarea, sinon le scroll sync se décale). */}
                {'\u200B'}
              </div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={save}
                onKeyDown={onKeyDown}
                onClick={onEditorClick}
                onMouseMove={onEditorMouseMove}
                onMouseLeave={(e) => { setHoverLine(null); e.currentTarget.style.cursor = '' }}
                onScroll={(e) => {
                  const b = backdropRef.current
                  if (b) { b.scrollTop = e.currentTarget.scrollTop; b.scrollLeft = e.currentTarget.scrollLeft }
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'link' // un LIEN, jamais une copie (#89)
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                placeholder="Write your idea. The first line becomes the title."
                spellCheck={false}
                // Le :focus-visible global (index.css, hors @layer) bat toute classe
                // utilitaire Tailwind (layered) → outline tué en inline, qui gagne toujours.
                style={{ outline: 'none', boxShadow: 'none' }}
                className={`absolute inset-0 h-full w-full resize-none border-0 bg-transparent text-neutral-800 placeholder:text-neutral-500 ${EDITOR_METRICS}`}
              />
            </div>
            <div className="flex w-full shrink-0 items-center justify-between px-[max(1.5rem,calc((100%-48rem)/2))] py-1.5 font-mono text-[11px] text-neutral-500">
              <span>{content.length} chars · ≈{tokens} tokens</span>
              <span className="flex items-center gap-4">
                <span data-notepad-flash>
                  {flash ?? (status === 'saving' ? 'saving…' : status === 'saved' ? 'saved' : '')}
                </span>
                <button
                  type="button"
                  onClick={() => void copyForAgent()}
                  title="Copy the cleaned note — [file: …] lines converted to bare paths (⇧⌘C)"
                  className="shrink-0 text-neutral-500 hover:text-neutral-800"
                >copy for the agent&nbsp;&nbsp;⇧⌘C</button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
