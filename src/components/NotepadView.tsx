import { useEffect, useRef, useState, useCallback } from 'react'
import { ViewHeader } from './ViewHeader'

// Notepad (#88) — incubateur d'idées local. Liste à gauche (420px, gabarit Docs),
// éditeur ghost écriture-d'abord à droite. Autosave (blur + debounce 800ms), titre =
// 1re ligne (le serveur renomme au fil de l'eau, #86). Notes gitignorées (#87) : rien
// n'entre dans l'historique. Pièces jointes & « Copier pour l'agent » → #89.

interface NoteMeta { slug: string; title: string; modified: number }

const jsonOk = async (r: Response) => {
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.ok === false) throw new Error(d?.errors?.join(' · ') ?? `HTTP ${r.status}`)
  return d
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

  const refreshList = useCallback(async () => {
    try { setNotes((await jsonOk(await fetch('/api/notes'))).notes ?? []) } catch { /* liste best-effort */ }
  }, [])

  useEffect(() => { refreshList() }, [refreshList])

  const openNote = useCallback(async (s: string) => {
    try {
      const d = await jsonOk(await fetch(`/api/notes/${s}`))
      setSlug(d.slug); setContent(d.content ?? ''); setStatus('idle')
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

  const newNote = useCallback(async () => {
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

  const archive = useCallback(async (s: string) => {
    await fetch(`/api/notes/${s}/archive`, { method: 'POST' }).catch(() => {})
    if (slugRef.current === s) { setSlug(null); setContent('') }
    refreshList()
  }, [refreshList])

  const removeNote = useCallback(async (s: string) => {
    await fetch(`/api/notes/${s}`, { method: 'DELETE' }).catch(() => {})
    if (slugRef.current === s) { setSlug(null); setContent('') }
    refreshList()
  }, [refreshList])

  // Raccourcis globaux : Cmd+N (nouvelle), Cmd+S (save forcé).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'n') { e.preventDefault(); newNote() }
      else if (e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [newNote, save])

  const dismissWarning = () => {
    setWarned(true)
    try { localStorage.setItem('notepad:warned', '1') } catch { /* ignore */ }
  }

  const tokens = Math.ceil(content.length / 4)

  return (
    <div className="flex h-full flex-col">
      <ViewHeader meta={slug ?? undefined}>
        <button
          type="button" onClick={newNote}
          className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          + note <span className="text-neutral-400">⌘N</span>
        </button>
      </ViewHeader>

      {!warned && (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
          <span>Notes locales, non versionnées, non sauvegardées par git (docs/notes/).</span>
          <button type="button" onClick={dismissWarning} className="shrink-0 text-amber-600 hover:text-amber-900">OK</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[420px] shrink-0 flex-col border-r border-neutral-200 px-3 py-4">
          <div className="shrink-0 px-2 pb-1.5 text-[10px] font-medium text-neutral-400">Notes</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {notes.length === 0 && <p className="px-2 text-xs text-neutral-400">Aucune note. ⌘N pour commencer.</p>}
            {notes.map((n) => (
              <div
                key={n.slug}
                className={`group flex items-center justify-between gap-2 rounded px-2 py-1.5 text-xs ${
                  n.slug === slug ? 'bg-accent-tint text-neutral-900 shadow-[inset_2px_0_0_var(--color-accent)]' : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                <button type="button" onClick={() => openNote(n.slug)} className="min-w-0 flex-1 truncate text-left">
                  {n.title || n.slug}
                </button>
                <span className="shrink-0 font-mono text-[10px] text-neutral-400">{relDate(n.modified)}</span>
                <button
                  type="button" onClick={() => archive(n.slug)} title="Archiver"
                  className="shrink-0 text-neutral-300 opacity-0 hover:text-neutral-700 group-hover:opacity-100"
                >⌫</button>
                <button
                  type="button" onClick={() => removeNote(n.slug)} title="Supprimer"
                  className="shrink-0 text-neutral-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
                >✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {slug === null ? (
            <div className="flex h-full items-center justify-center text-sm text-neutral-400">
              Sélectionne une note, ou ⌘N pour en créer une
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onBlur={save}
                placeholder="Écris ton idée. La première ligne devient le titre."
                spellCheck={false}
                className="min-h-0 flex-1 resize-none bg-transparent px-8 py-8 font-mono text-sm leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-300"
              />
              <div className="flex shrink-0 items-center justify-between border-t border-neutral-100 px-8 py-1.5 font-mono text-[11px] text-neutral-400">
                <span>{content.length} car. · ≈{tokens} tokens</span>
                <span>{status === 'saving' ? 'enregistrement…' : status === 'saved' ? 'enregistré' : ''}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
