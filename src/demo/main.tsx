import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'
import '../index.css'
import { installDemoApi } from './api'

/*
 * Entrée DÉMO (#148) — le bundle embarqué sur roadmapped.work.
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
  localStorage.setItem('backlog:epics', JSON.stringify(['homepage']))
  localStorage.setItem('graph:epics', JSON.stringify(['homepage']))
} catch { /* localStorage indisponible (iframe très restreinte) — l'app gère */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
