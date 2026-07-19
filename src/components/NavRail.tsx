import { type ComponentType } from 'react'
import { Dashboard, List, LayoutColumns, GitBranch, NodeGraph, Pulse, FileDoc, Pencil } from 'trinil-react'
import { useView, type View } from '../state/ViewContext'
import { BirdMascot } from './BirdMascot'

// Icônes du rail = trinil-react (la lib d'icônes de l'app, cf. header/Backlog/…) :
// même langage de trait que le reste. Remplace les glyphs SVG faits main du 1er
// jet de #370, qui juraient (retour Rémi).
type NavItem = { id: View; label: string; Icon: ComponentType<{ size?: number }> }

// Deux groupes séparés par un filet, comme le rail Figma sépare File/Agents/Assets
// des Variables : d'abord le TRAVAIL (Backlog, Roadmap, Dépendances), puis
// l'EXPLORATION (Graphe, Docs, Notes). Labels COURTS pour tenir sous l'icône dans
// une bande de 64 px, mais toujours du texte visible (jamais d'icône seule).
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
 *  Plus d'air AU-DESSUS (mt-3) qu'en-dessous : détache le filet de l'élément qui
 *  le précède (mascotte / dernier item du groupe) sans l'éloigner du suivant. */
function Rule() {
  return <div className="mb-1 mt-3 h-px w-7 shrink-0 bg-neutral-200" aria-hidden="true" />
}

/**
 * Le RAIL de navigation vertical (#370) — remplace les tabs horizontaux du header
 * par une bande d'icônes façon Figma. Flanc gauche du Shell, fond carte (la couche
 * du milieu de la tri-couche page/carte/filets, cf. design.md) + bord droit fin.
 *
 * En tête : la mascotte pixel (le « logo » du rail — elle a QUITTÉ le header pour
 * ne pas être dupliquée ; le header garde le titre marque × repo). Puis les 6 vues
 * empilées, icône AU-DESSUS d'un label court. Actif = accent (doctrine monochrome
 * + accent rare : l'accent ne sert QUE l'état actif), le reste en gris neutre.
 *
 * A11y : <nav aria-label="Vues"> ; l'item courant porte aria-current="page" ; focus
 * clavier visibles (règle :focus-visible globale, index.css) ; cibles ≥ 40 px ;
 * chaque item a un label TEXTE (les icônes sont aria-hidden, décoratives).
 */
function NavButton({ item }: { item: NavItem }) {
  const { view, setView } = useView()
  const active = item.id === view
  const { Icon } = item
  return (
    <button
      type="button"
      onClick={() => setView(item.id)}
      aria-current={active ? 'page' : undefined}
      className="group flex w-full flex-col items-center gap-1 py-1 text-[11px] font-medium leading-none"
    >
      {/* Highlight UNIQUEMENT derrière l'icône (façon Figma) : carré arrondi qui
          réagit au survol (group-hover) et à l'état actif — le label reste du
          texte nu. La cible cliquable reste le bouton entier (icône + label). */}
      <span
        className={`flex size-9 items-center justify-center rounded-interactive transition-colors ${
          active
            ? 'bg-active text-accent'
            : 'text-textsoft group-hover:bg-rollover group-hover:text-neutral-800'
        }`}
      >
        <Icon size={18} />
      </span>
      <span className={active ? 'text-texthard' : 'text-textsoft'}>{item.label}</span>
    </button>
  )
}

export function NavRail() {
  return (
    <nav
      aria-label="Vues"
      className="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-foreground px-2 py-3"
    >
      {/* Mascotte = le logo en tête du rail (comme Figma). Décorative (aria-hidden
          dans le composant) — c'est le titre du header qui nomme l'app. */}
      <BirdMascot />
      {/* Séparateur mascotte ↕ navigation (#372) : détache le logo des vues. */}
      <Rule />
      <div className="flex w-full flex-col gap-1">
        {WORK.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
      {/* Filet de groupe : travail ↕ exploration. */}
      <Rule />
      <div className="flex w-full flex-col gap-1">
        {EXPLORE.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
    </nav>
  )
}
