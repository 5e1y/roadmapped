import { useEffect, useRef, useState, useCallback } from 'react'
import { ViewHeader } from './ViewHeader'

// Notepad (#88) — incubateur d'idées local. Liste à gauche (gabarit ligne de backlog :
// pas de bords arrondis), éditeur ghost écriture-d'abord centré à droite. À l'ouverture,
// on est projeté directement dans une note en édition. Autosave (blur + debounce 800ms),
// titre = 1re ligne (le serveur renomme au fil de l'eau, #86). Notes gitignorées (#87).

interface NoteMeta { slug: string; title: string; modified: number }

const jsonOk = async (r: Response) => {
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.ok === false) throw new Error(d?.errors?.join(' · ') ?? `HTTP ${r.status}`)
  return d
}
const fetchNotes = async (): Promise<NoteMeta[]> => {
  try { return (await jsonOk(await fetch('/api/notes'))).notes ?? [] } catch { return [] }
}
const relDate = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })

export function NotepadView() {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [slug, setSlug] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [warned, setWarned] = useState(() => {
    try { return localStorage.getItem('notepad:warned') === '1' } catch { return false }
  })
  const slugRef = useRef<string | null>(null)
  const contentRef = useRef('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
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

  const tokens = Math.ceil(content.length / 4)

  return (
    <div className="flex h-full flex-col bg-white">
      <ViewHeader meta={slug ?? undefined} />

      {!warned && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <span>Notes locales, non versionnées, non sauvegardées par git (docs/notes/).</span>
          <button type="button" onClick={dismissWarning} className="shrink-0 text-amber-600 hover:text-amber-900">OK</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[420px] shrink-0 flex-col border-r border-neutral-200 py-2">
          {/* Création EN TÊTE de liste (pas de bouton en haut à droite, pas de ⌘N). */}
          <button
            type="button" onClick={createNote}
            className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
          >
            <span className="text-base leading-none text-neutral-400">+</span>
            Nouvelle note
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
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">{relDate(n.modified)}</span>
                <button
                  type="button" onClick={() => removeNote(n.slug)} title="Supprimer la note"
                  className="shrink-0 text-neutral-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Zone d'édition : clic dans le vide → crée une note ; sinon éditeur ghost. */}
        {slug === null ? (
          <button
            type="button" onClick={createNote}
            className="min-h-0 flex-1 cursor-text text-sm text-neutral-300 hover:text-neutral-400"
          >
            Clique ici pour écrire une note
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={save}
              placeholder="Écris ton idée. La première ligne devient le titre."
              spellCheck={false}
              // Le :focus-visible global (index.css, hors @layer) bat toute classe
              // utilitaire Tailwind (layered) → outline tué en inline, qui gagne toujours.
              style={{ outline: 'none', boxShadow: 'none' }}
              className="mx-auto min-h-0 w-full max-w-3xl flex-1 resize-none border-0 bg-transparent px-6 py-10 text-[2rem] leading-relaxed text-neutral-800 placeholder:text-neutral-300"
            />
            <div className="mx-auto flex w-full max-w-3xl shrink-0 items-center justify-between px-6 py-1.5 font-mono text-[11px] text-neutral-400">
              <span>{content.length} car. · ≈{tokens} tokens</span>
              <span>{status === 'saving' ? 'enregistrement…' : status === 'saved' ? 'enregistré' : ''}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
