import { ChevronLeft } from 'trinil-react'
import type { TaskNode } from '../lib/tasks'

/**
 * Chevron d'affordance expand/collapse (trinil-react). La classe `.chev`
 * (index.css) le fait pivoter de 90° quand l'ancêtre trigger porte
 * `data-panel-open` (état Base UI).
 */
export function Chevron() {
  // ⚠️ trinil-react 1.3.9 inverse ChevronLeft/ChevronRight (le path de
  // « Right » pointe à gauche) : on importe ChevronLeft pour pointer à DROITE
  // fermé. À simplifier quand la lib sera corrigée (signalé à Rémi).
  return <ChevronLeft size={11} className="chev shrink-0 text-neutral-500" />
}

/**
 * État d'une tâche en un glyphe :
 * todo = cercle vide, in_progress = demi-cercle ACCENT (le travail en cours
 * attire l'œil dans toutes les vues — tâche #37), done = cercle plein.
 */
/**
 * Glyphe d'un JALON (kind milestone, #133) : le diamant remplace le cercle —
 * même langage d'encre que StatusGlyph (vide = à atteindre, demi ACCENT = en
 * cours, plein = atteint), la FORME seule dit « ceci verrouille d'autres tâches ».
 */
export function MilestoneGlyph({ status }: { status: TaskNode['status'] }) {
  const label = { todo: 'milestone to reach', in_progress: 'milestone in progress', done: 'milestone reached' }[status]
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
        <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill="currentColor" />
      ) : status === 'in_progress' ? (
        <>
          <path d="M5 1.1 L8.9 5 L5 8.9 L1.1 5 Z" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M5 1.1 L1.1 5 L5 8.9 Z" fill="currentColor" />
        </>
      ) : (
        <path d="M5 1.1 L8.9 5 L5 8.9 L1.1 5 Z" fill="none" stroke="#737373" strokeWidth="1" />
      )}
    </svg>
  )
}

/**
 * Glyphe d'un EPIC (#135) : le CARRÉ complète la famille (cercle = tâche,
 * diamant = jalon) — même langage d'encre : vide = rien de fait, demi ACCENT =
 * en cours, plein = tout terminé. La forme seule dit « ceci est un groupe ».
 */
export function EpicGlyph({ status }: { status: TaskNode['status'] }) {
  const label = { todo: 'epic not started', in_progress: 'epic in progress', done: 'epic done' }[status]
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
        <rect x="1" y="1" width="8" height="8" fill="currentColor" />
      ) : status === 'in_progress' ? (
        <>
          <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
          <rect x="1.5" y="1.5" width="3.5" height="7" fill="currentColor" />
        </>
      ) : (
        <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="#737373" strokeWidth="1" />
      )}
    </svg>
  )
}

/** Glyphe d'état selon le kind : diamant pour un jalon, cercle sinon. */
export function KindGlyph({ task }: { task: Pick<TaskNode, 'kind' | 'status'> }) {
  return task.kind === 'milestone'
    ? <MilestoneGlyph status={task.status} />
    : <StatusGlyph status={task.status} />
}

export function StatusGlyph({ status }: { status: TaskNode['status'] }) {
  const label = { todo: 'todo', in_progress: 'in progress', done: 'done' }[status]
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
        <circle cx="5" cy="5" r="3.75" fill="none" stroke="#737373" strokeWidth="1" />
      )}
    </svg>
  )
}
