import { ChevronLeft } from 'trinil-react'
import type { ReactNode } from 'react'
import type { TaskNode } from '../lib/tasks'

/**
 * Chevron d'affordance expand/collapse (trinil-react). La classe `.chev`
 * (index.css) le fait pivoter de 90° quand l'ancêtre trigger porte
 * `data-panel-open` (état Base UI).
 *
 * `pointer-events-none` : le chevron est TOUJOURS décoratif — le toggle vit dans
 * un trigger (bouton qui l'enveloppe, ou calque plein-rang posé dessous). Sans
 * ça, cliquer PILE sur le SVG dans un epic (chevron nu sur calque `absolute
 * inset-0`) était intercepté et ne dépliait pas (#252) ; le rendre transparent
 * aux clics les laisse filer au trigger dans les deux modèles.
 */
export function Chevron() {
  // ⚠️ trinil-react 1.3.9 inverse ChevronLeft/ChevronRight (le path de
  // « Right » pointe à gauche) : on importe ChevronLeft pour pointer à DROITE
  // fermé. À simplifier quand la lib sera corrigée (signalé à Rémi).
  return <ChevronLeft size={11} className="chev pointer-events-none shrink-0 text-neutral-500" />
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
      className={`shrink-0 ${status === 'in_progress' ? 'text-accent pulse-live' : 'text-neutral-900'}`}
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
        <path d="M5 1.1 L8.9 5 L5 8.9 L1.1 5 Z" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1" />
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
      className={`shrink-0 ${status === 'in_progress' ? 'text-accent pulse-live' : 'text-neutral-900'}`}
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
        <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1" />
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

/**
 * Icônes de NAVIGATION du rail (#370) — une par vue de 1er niveau. Line-icons
 * monochromes qui héritent de l'encre via `currentColor` : gris au repos, accent
 * quand l'item est actif (l'état vit sur le bouton parent, cf. NavRail). Même
 * langage de trait que les glyphs de statut (fait maison, pas de lib tierce) mais
 * un gabarit plus grand (viewBox 16, trait 1.3, bouts ronds) pour lire à ~20 px.
 * Décoratives : le LABEL TEXTE de l'item porte le sens (a11y), donc aria-hidden.
 */
function NavIcon({ size = 20, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  )
}

/** Backlog = liste (marqueurs + lignes). */
export function BacklogIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <rect x="2" y="3" width="2.2" height="2.2" rx="0.4" />
      <line x1="6.2" y1="4.1" x2="13.6" y2="4.1" />
      <rect x="2" y="6.9" width="2.2" height="2.2" rx="0.4" />
      <line x1="6.2" y1="8" x2="13.6" y2="8" />
      <rect x="2" y="10.8" width="2.2" height="2.2" rx="0.4" />
      <line x1="6.2" y1="11.9" x2="13.6" y2="11.9" />
    </NavIcon>
  )
}

/** Roadmap = colonnes (kanban / stages), hauteurs inégales. */
export function RoadmapIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <rect x="2.2" y="2.5" width="3" height="11" rx="0.8" />
      <rect x="6.5" y="2.5" width="3" height="7.5" rx="0.8" />
      <rect x="10.8" y="2.5" width="3" height="9.5" rx="0.8" />
    </NavIcon>
  )
}

/** Dépendances = nœuds reliés (petit DAG : deux amonts → un aval). */
export function DependenciesIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <line x1="5.5" y1="4.6" x2="10.5" y2="7.4" />
      <line x1="5.5" y1="11.4" x2="10.5" y2="8.6" />
      <circle cx="4" cy="4" r="1.9" />
      <circle cx="4" cy="12" r="1.9" />
      <circle cx="12" cy="8" r="1.9" />
    </NavIcon>
  )
}

/** Graphe = réseau / constellation (un moyeu, quatre satellites). */
export function GraphIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <line x1="6.9" y1="7" x2="4" y2="4.5" />
      <line x1="9.1" y1="7.1" x2="12" y2="4.8" />
      <line x1="7" y1="9.1" x2="4.4" y2="11.8" />
      <line x1="9.2" y1="9.2" x2="11.6" y2="11.6" />
      <circle cx="8" cy="8" r="1.7" />
      <circle cx="3" cy="3.6" r="1.2" />
      <circle cx="13" cy="4.1" r="1.2" />
      <circle cx="3.6" cy="12.7" r="1.2" />
      <circle cx="12.4" cy="12.4" r="1.2" />
    </NavIcon>
  )
}

/** Docs = document (coin plié + lignes de texte). */
export function DocsIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <path d="M4 2.2 H9.4 L12.5 5.3 V13.8 H4 Z" />
      <path d="M9.3 2.4 V5.4 H12.4" />
      <line x1="5.8" y1="8" x2="10.6" y2="8" />
      <line x1="5.8" y1="10.1" x2="10.6" y2="10.1" />
      <line x1="5.8" y1="12" x2="9" y2="12" />
    </NavIcon>
  )
}

/** Notes = crayon (Notepad). */
export function NotesIcon({ size }: { size?: number }) {
  return (
    <NavIcon size={size}>
      <path d="M10.4 2.6 L13.4 5.6 L6 13 L3 13.5 L3.5 10.5 Z" />
      <line x1="9" y1="4" x2="12" y2="7" />
    </NavIcon>
  )
}

export function StatusGlyph({ status }: { status: TaskNode['status'] }) {
  const label = { todo: 'todo', in_progress: 'in progress', done: 'done' }[status]
  return (
    <svg
      className={`shrink-0 ${status === 'in_progress' ? 'text-accent pulse-live' : 'text-neutral-900'}`}
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
        <circle cx="5" cy="5" r="3.75" fill="none" stroke="var(--color-neutral-500)" strokeWidth="1" />
      )}
    </svg>
  )
}
