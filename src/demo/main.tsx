import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import '../index.css'
import { installDemoApi } from './api'
import { DemoPiece } from './piece'

/*
 * Entrée DÉMO (#148) — le bundle embarqué sur roadmapped.dev.
 * Le shim est posé AVANT le premier render : TreeProvider fetch('/api/tree')
 * au montage et doit tomber sur la démo, jamais sur le réseau.
 * Tout le reste est l'App normale, à l'identique.
 */
installDemoApi()

// Boot déterministe pour un visiteur : la démo s'ouvre toujours sur le Backlog,
// avec l'epic « homepage » déplié (Backlog ET Graphe) — la première impression
// montre le contenu, pas des accordéons fermés. (La navigation localStorage du
// vrai app n'a pas de sens ici — chaque visite raconte l'histoire du début.)
try {
  localStorage.removeItem('nav:view')
  localStorage.removeItem('nav:doc')
  // Palette (#394) : chaque visite rouvre sur le thème Roadmapped. Sans ça, un
  // visiteur qui bascule GitHub/Cursor/Claude dans les Settings de la démo garde
  // sa palette d'une visite à l'autre (clé sur l'origine partagée roadmapped.dev),
  // divergente du chrome roadmapped autour de l'iframe. Le mode clair/sombre, lui,
  // reste piloté par le ?theme= du site.
  localStorage.removeItem('ui:theme-name')
  localStorage.setItem('backlog:epics', JSON.stringify(['homepage']))
  localStorage.setItem('graph:epics', JSON.stringify(['homepage']))
} catch { /* localStorage indisponible (iframe très restreinte) — l'app gère */ }

// ?piece=<nom> (#436) : le site embarque une VUE RÉELLE isolée (how-it-works,
// graphe) au lieu de wireframes. Même bundle, même entrée — on ne change que la
// racine rendue. Sinon, la démo complète habituelle.
const isPiece = new URLSearchParams(location.search).has('piece')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPiece ? <DemoPiece /> : <App />}
  </React.StrictMode>,
)
