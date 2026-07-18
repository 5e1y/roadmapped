import { useView, type View } from '../state/ViewContext'
import { BirdMascot } from './BirdMascot'
import {
  BacklogIcon,
  RoadmapIcon,
  DependenciesIcon,
  GraphIcon,
  DocsIcon,
  NotesIcon,
} from './glyphs'

type NavItem = { id: View; label: string; Icon: (p: { size?: number }) => JSX.Element }

// Deux groupes séparés par un filet, comme le rail Figma sépare File/Agents/Assets
// des Variables : d'abord le TRAVAIL (Backlog, Roadmap, Dépendances), puis
// l'EXPLORATION (Graphe, Docs, Notes). Labels COURTS pour tenir sous l'icône dans
// une bande de 64 px, mais toujours du texte visible (jamais d'icône seule).
const WORK: NavItem[] = [
  { id: 'backlog', label: 'Backlog', Icon: BacklogIcon },
  { id: 'roadmap', label: 'Roadmap', Icon: RoadmapIcon },
  { id: 'dependencies', label: 'Deps', Icon: DependenciesIcon },
]
const EXPLORE: NavItem[] = [
  { id: 'graph', label: 'Graph', Icon: GraphIcon },
  { id: 'docs', label: 'Docs', Icon: DocsIcon },
  { id: 'notepad', label: 'Notes', Icon: NotesIcon },
]

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
      className={`flex min-h-11 w-full flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] font-medium leading-none transition-colors ${
        active
          ? 'bg-accent-tint text-accent'
          : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
      }`}
    >
      <Icon size={20} />
      <span>{item.label}</span>
    </button>
  )
}

export function NavRail() {
  return (
    <nav
      aria-label="Vues"
      className="flex h-full w-16 shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white px-2 py-3"
    >
      {/* Mascotte = le logo en tête du rail (comme Figma). Décorative (aria-hidden
          dans le composant) — c'est le titre du header qui nomme l'app. */}
      <BirdMascot />
      <div className="mt-2 flex w-full flex-col gap-1">
        {WORK.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
      {/* Filet de groupe : travail ↕ exploration. */}
      <div className="my-1 h-px w-7 shrink-0 bg-neutral-200" aria-hidden="true" />
      <div className="flex w-full flex-col gap-1">
        {EXPLORE.map((item) => (
          <NavButton key={item.id} item={item} />
        ))}
      </div>
    </nav>
  )
}
