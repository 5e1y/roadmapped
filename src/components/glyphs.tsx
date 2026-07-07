import type { TaskNode } from '../lib/tasks'

/**
 * Chevron d'affordance expand/collapse. La classe `.chev` (index.css) le fait
 * pivoter de 90° quand l'ancêtre trigger porte `data-panel-open` (état Base UI).
 */
export function Chevron() {
  return (
    <svg
      className="chev shrink-0 text-neutral-400"
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 1.5 6.5 5 3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * État d'une tâche en un glyphe :
 * todo = cercle vide, in_progress = demi-cercle ACCENT (le travail en cours
 * attire l'œil dans toutes les vues — tâche #37), done = cercle plein.
 */
export function StatusGlyph({ status }: { status: TaskNode['status'] }) {
  const label = { todo: 'à faire', in_progress: 'en cours', done: 'faite' }[status]
  return (
    <svg
      className={`shrink-0 ${status === 'in_progress' ? 'text-accent' : 'text-neutral-900'}`}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {status === 'done' ? (
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      ) : status === 'in_progress' ? (
        <>
          <circle cx="5" cy="5" r="3.75" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M5 1.25 A3.75 3.75 0 0 0 5 8.75 Z" fill="currentColor" />
        </>
      ) : (
        <circle cx="5" cy="5" r="3.75" fill="none" stroke="#a3a3a3" strokeWidth="1" />
      )}
    </svg>
  )
}
