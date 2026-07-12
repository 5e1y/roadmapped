import { createKbSim, KB_SIM, type KbSim } from '../lib/kbSim'
import { edgePaths, type KbSceneEdge } from '../lib/kbScene'
import type { KbLayoutInput } from '../lib/kbLayout'

/**
 * Pilote IMPÉRATIF de la sim KB (#316) — le pont entre la simulation
 * (lib/kbSim) et le SVG, SANS React dans la boucle : à chaque frame rAF, un
 * tick de sim puis une écriture directe des attributs DOM (transform des <g>
 * nœuds, `d` des 2 <path> d'arêtes agrégées + de la surcouche de survol).
 * React ne rend la scène qu'aux VRAIS changements (filtre, survol, recherche)
 * — jamais 869 nœuds réconciliés 60×/s (prolonge l'optim #308).
 *
 * La boucle s'ARRÊTE d'elle-même quand la sim est stabilisée (alpha decay) et
 * repart au drag (`beginDrag`/`dragTo`, alphaTarget façon d3.drag) ou au
 * changement de sous-graphe (`morphTo`, réchauffe). `onFrame` est le crochet
 * caméra du composant (auto-fit pendant la génération).
 */

const fmt = (v: number): string => String(Math.round(v * 10) / 10)

type EdgeSlot = 'solid' | 'dashed' | 'focusSolid' | 'focusDashed'

export class KbSimDriver {
  readonly sim: KbSim
  private edges: readonly KbSceneEdge[]
  private appliedView: object
  private els = new Map<string, SVGGElement>()
  private paths: Record<EdgeSlot, SVGPathElement | null> = {
    solid: null, dashed: null, focusSolid: null, focusDashed: null,
  }
  private focus: string | null = null
  private raf = 0
  private lastT = 0
  private disposed = false
  /** Crochet caméra (auto-fit) — posé par KbGraph, appelé après chaque frame. */
  onFrame: (() => void) | null = null

  constructor(viewKey: object, input: KbLayoutInput, edges: readonly KbSceneEdge[]) {
    this.appliedView = viewKey
    this.edges = edges
    this.sim = createKbSim(input)
  }

  /**
   * Changement de sous-graphe (filtre) : no-op si `viewKey` est déjà la vue
   * appliquée (idempotent — appelable depuis un useMemo, StrictMode compris).
   * Renvoie true si un morph a eu lieu (le composant réarme l'auto-fit).
   */
  morphTo(viewKey: object, input: KbLayoutInput, edges: readonly KbSceneEdge[]): boolean {
    if (viewKey === this.appliedView) return false
    this.appliedView = viewKey
    this.edges = edges
    this.sim.morph(input)
    this.start()
    return true
  }

  /** Enregistre/retire l'élément <g> d'un nœud (ref callback React). */
  registerNode(id: string, el: SVGGElement | null): void {
    if (el) this.els.set(id, el)
    else this.els.delete(id)
  }

  /** Enregistre les <path> d'arêtes (base + surcouche de survol). */
  attachPath(slot: EdgeSlot, el: SVGPathElement | null): void {
    this.paths[slot] = el
  }

  /** Survol : la surcouche accent suit ce nœud (et son voisinage d'arêtes). */
  setFocus(id: string | null): void {
    this.focus = id
    this.syncFocus()
  }

  /** Écrit l'état courant de la sim dans le DOM (une passe, sans tick). */
  sync(): void {
    const placed = this.sim.placed
    for (const [id, el] of this.els) {
      const p = placed.get(id)
      if (p) el.setAttribute('transform', `translate(${fmt(p.x)} ${fmt(p.y)})`)
    }
    const d = edgePaths(this.edges, placed)
    this.paths.solid?.setAttribute('d', d.solid)
    this.paths.dashed?.setAttribute('d', d.dashed)
    this.syncFocus()
  }

  private syncFocus(): void {
    const fs = this.paths.focusSolid
    const fd = this.paths.focusDashed
    if (!fs && !fd) return
    if (this.focus === null) {
      fs?.setAttribute('d', '')
      fd?.setAttribute('d', '')
      return
    }
    const d = edgePaths(this.edges, this.sim.placed, this.focus)
    fs?.setAttribute('d', d.solid)
    fd?.setAttribute('d', d.dashed)
  }

  /** (Re)lance la boucle rAF — no-op si déjà en cours ou sans rAF (jsdom). */
  start(): void {
    if (this.raf || this.disposed || typeof requestAnimationFrame !== 'function') return
    this.lastT = 0
    const frame = (t: number): void => {
      this.raf = 0
      // Cadence réelle : à 30 fps on avance de 2 ticks pour garder le TEMPS de
      // stabilisation (~3 s), pas le nombre de frames. Plafonné à 3 (onglet gelé).
      const steps = this.lastT > 0 ? Math.max(1, Math.min(3, Math.round((t - this.lastT) / 16.7))) : 1
      this.lastT = t
      this.sim.tick(steps)
      this.sync()
      this.onFrame?.()
      if (!this.sim.settled) this.raf = requestAnimationFrame(frame)
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop(): void {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  dispose(): void {
    this.stop()
    this.disposed = true
    this.els.clear()
    this.onFrame = null
  }

  /** Début de drag : épingle le nœud sur place, sim maintenue chaude (d3.drag). */
  beginDrag(id: string): void {
    const p = this.sim.placed.get(id)
    if (!p) return
    this.sim.pin(id, p.x, p.y)
    this.sim.setAlphaTarget(KB_SIM.DRAG_TARGET)
    this.sim.kick(KB_SIM.DRAG_TARGET)
    this.start()
  }

  /** Le nœud épinglé suit le curseur (coordonnées CONTENU, pas viewport). */
  dragTo(id: string, x: number, y: number): void {
    this.sim.pin(id, x, y)
    this.start()
  }

  /** Relâché : le nœud REJOINT la sim (désépinglé) et tout refroidit. */
  endDrag(id: string): void {
    this.sim.unpin(id)
    this.sim.setAlphaTarget(0)
  }
}
