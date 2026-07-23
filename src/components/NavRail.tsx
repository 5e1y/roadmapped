import { type ComponentType } from 'react'
import { Dashboard, List, LayoutColumns, GitBranch, NodeGraph, Pulse, FileDoc, Pencil, Gear } from 'trinil-react'
import { useView, type View } from '../state/ViewContext'
import { useLiveActivity } from '../state/LiveActivity'
import { useOptionalTreeState } from '../state/TreeContext'
import { BirdMascot } from './BirdMascot'

// Icônes du rail = trinil-react (la lib d'icônes de l'app, cf. header/Backlog/…) :
// même langage de trait que le reste. Remplace les glyphs SVG faits main du 1er
// jet de #370, qui juraient (retour Rémi).
type NavItem = { id: View; label: string; Icon: ComponentType<{ size?: number }> }

// Deux groupes séparés par un filet, comme le rail Figma sépare File/Agents/Assets
// des Variables : d'abord le TRAVAIL (Backlog, Roadmap, Dépendances), puis
// l'EXPLORATION (Graphe, Docs, Notes). Labels COURTS pour tenir sous l'icône —
// c'est le label le plus large qui dimensionne le rail (plus de w-16 figé) —
// mais toujours du texte visible (jamais d'icône seule).
const WORK: NavItem[] = [
  { id: 'overview', label: 'Overview', Icon: Dashboard },
  { id: 'backlog', label: 'Backlog', Icon: List },
  { id: 'roadmap', label: 'Roadmap', Icon: LayoutColumns },
  { id: 'dependencies', label: 'Deps', Icon: GitBranch },
]
const EXPLORE: NavItem[] = [
  { id: 'graph', label: 'Graph', Icon: NodeGraph },
  { id: 'activity', label: 'Activity', Icon: Pulse },
  { id: 'docs', label: 'Docs', Icon: FileDoc },
  { id: 'notepad', label: 'Notes', Icon: Pencil },
]

/** Filet de séparation du rail (mascotte↔items, groupe travail↔exploration).
 *  Plus d'air AU-DESSUS (mt-m) qu'en-dessous : détache le filet de l'élément qui
 *  le précède (mascotte / dernier item du groupe) sans l'éloigner du suivant.
 *  self-stretch + mx-xs : la largeur suit celle du rail (plus de w-7 figé). */
function Rule() {
  return <div className="mx-xs mb-xs mt-m h-px shrink-0 self-stretch bg-border" aria-hidden="true" />
}

/**
 * Le RAIL de navigation vertical (#370) — remplace les tabs horizontaux du header
 * par une bande d'icônes façon Figma. Flanc gauche du Shell, fond carte (la couche
 * du milieu de la tri-couche page/carte/filets, cf. design.md) + bord droit fin.
 *
 * En tête : la mascotte pixel (le « logo » du rail — elle a QUITTÉ le header pour
 * ne pas être dupliquée ; le header garde le titre marque × repo). Puis les 6 vues
 * empilées, icône AU-DESSUS d'un label court. Actif = `text-highlight` (#396 :
 * alias sur accent partout sauf où un thème le redéfinit, ex. GitHub → corail —
 * doctrine monochrome + marque rare inchangée), le reste en gris neutre.
 *
 * A11y : <nav aria-label="Vues"> ; l'item courant porte aria-current="page" ; focus
 * clavier visibles (règle :focus-visible globale, index.css) ; cibles ≥ 40 px ;
 * chaque item a un label TEXTE (les icônes sont aria-hidden, décoratives).
 */
function NavButton({ item }: { item: NavItem }) {
  const { view, setView } = useView()
  const active = item.id === view
  const { Icon } = item
  // Point de notif accent sur Activity quand des changements live ne sont pas lus
  // (#395). L'onglet Activity remet à zéro à l'ouverture (setOpen). Hors provider
  // (tests / build démo) : useLiveActivity() = null → pas de point.
  const unread = useLiveActivity()?.unread ?? 0
  const showDot = item.id === 'activity' && unread > 0 && !active
  // Point accent sur Settings quand une MAJ est disponible (#432) — même source
  // de vérité que UpdateNotice : useTree().update, non-null = MAJ dispo. Hors
  // provider (tests / build démo) : useOptionalTreeState() = null → pas de point.
  const update = useOptionalTreeState()?.update ?? null
  const showUpdateDot = item.id === 'settings' && update !== null && !active
  return (
    <button
      type="button"
      onClick={() => setView(item.id)}
      aria-current={active ? 'page' : undefined}
      className="group flex w-full flex-col items-center gap-xs py-xs text-[11px] font-medium leading-none"
    >
      {/* Highlight UNIQUEMENT derrière l'icône (façon Figma) : carré arrondi qui
          réagit au survol (group-hover) et à l'état actif — le label reste du
          texte nu. La cible cliquable reste le bouton entier (icône + label). */}
      <span
        className={`relative flex items-center justify-center rounded-interactive p-s transition-colors ${
          active
            ? 'bg-active text-highlight'
            : 'text-textsoft group-hover:bg-rollover group-hover:text-texthard'
        }`}
      >
        <Icon size={18} />
        {(showDot || showUpdateDot) && (
          <span
            className="absolute right-1 top-1 size-[calc(var(--spacing-xs)*1.5)] rounded-round bg-accent"
            aria-label={showDot ? `${unread} unread` : 'Update available'}
          />
        )}
      </span>
      <span className={active ? 'text-texthard' : 'text-textsoft'}>{item.label}</span>
    </button>
  )
}

export function NavRail() {
  return (
    <nav
      aria-label="Vues"
      className="flex h-full shrink-0 flex-col items-center gap-xs shadow-[inset_-1px_0_0_var(--color-border)] bg-foreground px-xs py-m"
    >
      {/* Mascotte = le logo en tête du rail (comme Figma). Décorative (aria-hidden
          dans le composant) — c'est le titre du header qui nomme l'app. */}
      <BirdMascot />
      {/* Séparateur mascotte ↕ navigation (#372) : détache le logo des vues. */}
      <Rule />
      <div className="flex w-full flex-col gap-xs">
        {WORK.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
      {/* Filet de groupe : travail ↕ exploration. */}
      <Rule />
      <div className="flex w-full flex-col gap-xs">
        {EXPLORE.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
      {/* Settings ancré EN BAS du rail (#395) : thème + signalement de bug + MAJ.
          mt-auto pousse le groupe tout en bas. */}
      <div className="mt-auto flex w-full flex-col gap-xs">
        <NavButton item={{ id: 'settings', label: 'Settings', Icon: Gear }} />
      </div>
    </nav>
  )
}
