import type { KbLayoutInput, KbPlaced } from './kbLayout'

/**
 * Simulation de forces LIVE de la Knowledge base (#316) — le graphe façon
 * Obsidian. Remplace le layout figé (kbLayout) + reveal CSS pour le rendu
 * animé : les nœuds PARTENT groupés au centre (phyllotaxie déterministe) et on
 * VOIT le réseau s'écarter, se stabiliser, réagir au drag.
 *
 * Modèle d3-force (velocity Verlet + alpha decay), 100 % maison, déterministe
 * (aucun Math.random — le jiggle anti-superposition est haché sur l'index) :
 * - RÉPULSION (charge) en BARNES-HUT : quadtree reconstruit à chaque tick,
 *   O(n log n) — la version naïve O(n²) = ~750k paires/frame sur 869 nœuds ;
 * - RESSORTS sur les arêtes (distance au repos, raideur 1/min(deg), biais par
 *   degré comme d3-link) ;
 * - CENTRAGE doux vers le milieu de la boîte (le graphe ne dérive pas) ;
 * - ALPHA DECAY : la sim se refroidit et S'ARRÊTE (settled) en ~180 ticks
 *   (~3 s à 60 fps) pour ne pas brûler le CPU ; `kick` la réchauffe (filtre),
 *   `setAlphaTarget` la maintient chaude (drag, cf. d3.drag).
 *
 * La boîte de contenu est FIXE (côté ∝ √n, calculé à la création) : pas de
 * recadrage par frame — la caméra (useZoomPan/fitBox) suit la bbox des nœuds.
 * Les KbPlaced du Map `placed` sont MUTÉS en place à chaque tick : le rendu
 * (kbSimDriver) lit toujours les positions courantes sans réallocation, et les
 * mémos React qui tiennent le Map restent stables.
 */

/** Parité DA avec kbLayout : tailles de pastille ∝ √degré. */
const R_MIN = 5
const R_MAX = 22
/** Marge dure : les positions sont bornées dans [PAD, side−PAD]. */
const PAD = 28

export const KB_SIM = {
  /** Sous ce seuil (et sans alphaTarget), la sim est considérée stabilisée. */
  ALPHA_MIN: 0.001,
  /** Refroidissement ~180 ticks (≈3 s à 60 fps) : 1 − ALPHA_MIN^(1/180). */
  ALPHA_DECAY: 1 - Math.pow(0.001, 1 / 180),
  /** Frottement : part de vélocité conservée par tick (d3 velocityDecay 0.4). */
  VELOCITY_KEEP: 0.6,
  /** Longueur de ressort au repos (px) — resserrée par le poids de l'arête. */
  LINK_DIST: 55,
  /** Charge répulsive par nœud : base + part ∝ rayon (les hubs poussent plus). */
  CHARGE_BASE: -40,
  CHARGE_PER_R: -5,
  /** Force de centrage (× alpha) vers le milieu de la boîte. */
  CENTER_K: 0.05,
  /** Barnes-Hut : θ² (θ = 0.9) — au-delà, une région = une charge agrégée. */
  THETA2: 0.81,
  /** Distances de coupure de la répulsion (²) : anti-singularité / portée max. */
  DIST_MIN2: 1,
  DIST_MAX2: 640_000, // 800 px
  /** Rayon de la phyllotaxie de départ (le « petit nuage » de la génération). */
  CLUSTER_R: 4,
  /** Réchauffe au morph (changement de filtre) : les nœuds se REPLACENT. */
  MORPH_ALPHA: 0.45,
  /** alphaTarget pendant un drag (d3.drag) : la sim reste vivante sous le doigt. */
  DRAG_TARGET: 0.3,
} as const

export interface KbSim {
  /** Positions courantes — objets MUTÉS en place à chaque tick (identités stables). */
  readonly placed: Map<string, KbPlaced>
  readonly width: number
  readonly height: number
  readonly alpha: number
  /** true quand alpha < ALPHA_MIN : la boucle rAF peut s'arrêter. */
  readonly settled: boolean
  /** Avance la sim de `steps` ticks (défaut 1). */
  tick(steps?: number): void
  /** Réchauffe : alpha = max(alpha, a) — redémarre une sim refroidie. */
  kick(a: number): void
  /** Plancher d'alpha maintenu (drag) ; 0 = laisse refroidir. */
  setAlphaTarget(t: number): void
  /** Épingle un nœud à (x, y) — il ne bouge plus, les voisins réagissent. */
  pin(id: string, x: number, y: number): void
  unpin(id: string): void
  /**
   * Change le sous-graphe (filtre) : les survivants GARDENT position et
   * vélocité, les entrants apparaissent près du barycentre de leurs voisins
   * déjà placés (sinon au centre), et la sim est réchauffée (MORPH_ALPHA).
   */
  morph(input: KbLayoutInput): void
}

/* ------------------------------------------------------------------ */
/* Quadtree Barnes-Hut                                                  */
/* ------------------------------------------------------------------ */

interface Quad {
  x0: number
  y0: number
  size: number
  /** Feuille : indices des points (plusieurs si profondeur max atteinte). */
  pts: number[] | null
  kids: Array<Quad | null> | null
  charge: number
  cx: number
  cy: number
}

const MAX_DEPTH = 18

/** Jiggle DÉTERMINISTE (anti-superposition) : hash de l'index, jamais Math.random. */
const jiggle = (seed: number): number => {
  const h = Math.abs((seed * 2654435761) % 1024)
  return ((h / 1024) - 0.5) * 1e-3 || 1e-4
}

const makeQuad = (x0: number, y0: number, size: number): Quad =>
  ({ x0, y0, size, pts: null, kids: null, charge: 0, cx: 0, cy: 0 })

function insert(q: Quad, i: number, x: Float64Array, y: Float64Array, depth: number): void {
  if (q.kids) { insertChild(q, i, x, y, depth); return }
  if (!q.pts) { q.pts = [i]; return }
  if (depth >= MAX_DEPTH) { q.pts.push(i); return }
  const moved = q.pts
  q.pts = null
  q.kids = [null, null, null, null]
  for (const p of moved) insertChild(q, p, x, y, depth)
  insertChild(q, i, x, y, depth)
}

function insertChild(q: Quad, i: number, x: Float64Array, y: Float64Array, depth: number): void {
  const half = q.size / 2
  const r = x[i] >= q.x0 + half ? 1 : 0
  const b = y[i] >= q.y0 + half ? 1 : 0
  const k = (b << 1) | r
  let c = q.kids![k]
  if (!c) c = q.kids![k] = makeQuad(q.x0 + r * half, q.y0 + b * half, half)
  insert(c, i, x, y, depth + 1)
}

/** Post-ordre : charge totale + centre de charge (pondéré par |charge|, comme d3). */
function accumulate(q: Quad, x: Float64Array, y: Float64Array, strength: Float64Array): void {
  let c = 0, w = 0, sx = 0, sy = 0
  if (q.pts) {
    for (const i of q.pts) {
      const s = strength[i]
      const a = Math.abs(s)
      c += s; w += a; sx += a * x[i]; sy += a * y[i]
    }
  } else {
    for (const kid of q.kids!) {
      if (!kid) continue
      accumulate(kid, x, y, strength)
      const a = Math.abs(kid.charge)
      c += kid.charge; w += a; sx += a * kid.cx; sy += a * kid.cy
    }
  }
  q.charge = c
  if (w > 0) { q.cx = sx / w; q.cy = sy / w } else { q.cx = q.x0; q.cy = q.y0 }
}

function applyQuad(
  q: Quad, i: number,
  x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array,
  strength: Float64Array, alpha: number,
): void {
  let dx = q.cx - x[i]
  let dy = q.cy - y[i]
  let d2 = dx * dx + dy * dy
  // Critère de Barnes-Hut : région assez lointaine ⇒ une seule charge agrégée.
  if (q.size * q.size < KB_SIM.THETA2 * d2) {
    if (d2 < KB_SIM.DIST_MAX2 && q.charge !== 0) {
      if (d2 === 0) { dx = jiggle(i); dy = jiggle(i + 1); d2 = dx * dx + dy * dy }
      if (d2 < KB_SIM.DIST_MIN2) d2 = Math.sqrt(KB_SIM.DIST_MIN2 * d2)
      const w = (q.charge * alpha) / d2
      vx[i] += dx * w
      vy[i] += dy * w
    }
    return
  }
  if (q.pts) {
    // Feuille proche : paires EXACTES (en excluant soi-même).
    for (const j of q.pts) {
      if (j === i) continue
      let ddx = x[j] - x[i]
      let ddy = y[j] - y[i]
      let l = ddx * ddx + ddy * ddy
      if (l >= KB_SIM.DIST_MAX2) continue
      if (l === 0) { ddx = jiggle(i + j); ddy = jiggle(i - j); l = ddx * ddx + ddy * ddy }
      if (l < KB_SIM.DIST_MIN2) l = Math.sqrt(KB_SIM.DIST_MIN2 * l)
      const w = (strength[j] * alpha) / l
      vx[i] += ddx * w
      vy[i] += ddy * w
    }
    return
  }
  for (const kid of q.kids!) if (kid) applyQuad(kid, i, x, y, vx, vy, strength, alpha)
}

/**
 * Répulsion (charge) Barnes-Hut sur `n` points — exportée SEULE pour être
 * testée contre la version naïve O(n²) (tolérance θ).
 */
export function applyRepulsion(
  n: number,
  x: Float64Array, y: Float64Array,
  strength: Float64Array,
  vx: Float64Array, vy: Float64Array,
  alpha: number,
): void {
  if (n < 2) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i]
    if (x[i] > maxX) maxX = x[i]
    if (y[i] < minY) minY = y[i]
    if (y[i] > maxY) maxY = y[i]
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1
  const root = makeQuad(minX, minY, size)
  for (let i = 0; i < n; i++) insert(root, i, x, y, 0)
  accumulate(root, x, y, strength)
  for (let i = 0; i < n; i++) applyQuad(root, i, x, y, vx, vy, strength, alpha)
}

/* ------------------------------------------------------------------ */
/* Simulation                                                           */
/* ------------------------------------------------------------------ */

interface Link { s: number; t: number; dist: number; strength: number; bias: number }

/** Degré (non-dirigé), boucles et arêtes orphelines ignorées — parité kbLayout. */
function degreesOf(input: KbLayoutInput): Map<string, number> {
  const ids = new Set(input.nodes.map((n) => n.id))
  const deg = new Map<string, number>(input.nodes.map((n) => [n.id, 0]))
  for (const e of input.edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }
  return deg
}

/** Ressorts (indices, distance au repos, raideur 1/min(deg), biais par degré — d3-link). */
function buildLinks(input: KbLayoutInput, index: Map<string, number>, deg: Map<string, number>): Link[] {
  const valid = input.edges.filter(
    (e) => e.source !== e.target && index.has(e.source) && index.has(e.target),
  )
  const maxW = Math.max(1, ...valid.map((e) => e.weight ?? 1))
  return valid.map((e) => {
    const s = index.get(e.source)!
    const t = index.get(e.target)!
    const ds = Math.max(1, deg.get(e.source) ?? 1)
    const dt = Math.max(1, deg.get(e.target) ?? 1)
    const w = e.weight ?? 1
    return {
      s, t,
      dist: KB_SIM.LINK_DIST * (1 - 0.25 * (w / maxW)),
      strength: 1 / Math.min(ds, dt),
      bias: ds / (ds + dt),
    }
  })
}

export function createKbSim(input: KbLayoutInput): KbSim {
  // Boîte FIXE ∝ √n (calée sur la vue de création — les morphs restent dedans).
  const side = Math.max(600, 110 * Math.sqrt(Math.max(1, input.nodes.length)))
  const cx = side / 2
  const cy = side / 2

  let n = 0
  let ids: string[] = []
  let index = new Map<string, number>()
  let x = new Float64Array(0)
  let y = new Float64Array(0)
  let vx = new Float64Array(0)
  let vy = new Float64Array(0)
  let fx = new Float64Array(0) // NaN = libre
  let fy = new Float64Array(0)
  let strength = new Float64Array(0)
  let links: Link[] = []
  const placed = new Map<string, KbPlaced>()

  let alpha = 1
  let alphaTarget = 0

  /** (Re)construit l'état pour `input` ; `keep` = positions/vélocités héritées. */
  const build = (
    inp: KbLayoutInput,
    keep: Map<string, { x: number; y: number; vx: number; vy: number }> | null,
  ): void => {
    const deg = degreesOf(inp)
    const maxDeg = Math.max(1, ...deg.values())
    n = inp.nodes.length
    ids = inp.nodes.map((d) => d.id)
    index = new Map(ids.map((id, i) => [id, i]))
    x = new Float64Array(n); y = new Float64Array(n)
    vx = new Float64Array(n); vy = new Float64Array(n)
    fx = new Float64Array(n).fill(NaN); fy = new Float64Array(n).fill(NaN)
    strength = new Float64Array(n)
    links = buildLinks(inp, index, deg)

    const radii = new Array<number>(n)
    const survivors = new Array<boolean>(n).fill(false)
    const entrants: number[] = []
    for (let i = 0; i < n; i++) {
      const d = deg.get(ids[i]) ?? 0
      radii[i] = R_MIN + (R_MAX - R_MIN) * Math.sqrt(d / maxDeg)
      strength[i] = KB_SIM.CHARGE_BASE + KB_SIM.CHARGE_PER_R * radii[i]
      const prev = keep?.get(ids[i])
      if (prev) {
        x[i] = prev.x; y[i] = prev.y; vx[i] = prev.vx; vy[i] = prev.vy
        survivors[i] = true
      } else if (keep) {
        entrants.push(i)
      } else {
        // Génération : petit nuage phyllotaxique au centre (déterministe).
        const r0 = KB_SIM.CLUSTER_R * Math.sqrt(i + 0.5)
        const a0 = i * 2.399963229728653 // angle d'or
        x[i] = cx + r0 * Math.cos(a0)
        y[i] = cy + r0 * Math.sin(a0)
      }
    }

    if (entrants.length > 0) {
      // Adjacence (indices) pour placer chaque entrant près de ses voisins survivants.
      const adj = new Map<number, number[]>()
      for (const l of links) {
        let a = adj.get(l.s); if (!a) adj.set(l.s, (a = [])); a.push(l.t)
        let b = adj.get(l.t); if (!b) adj.set(l.t, (b = [])); b.push(l.s)
      }
      let e = 0
      for (const i of entrants) {
        let sx = 0, sy = 0, c = 0
        for (const j of adj.get(i) ?? []) {
          if (survivors[j]) { sx += x[j]; sy += y[j]; c++ }
        }
        const a0 = e * 2.399963229728653
        const off = 16 + 8 * (e % 3)
        const bx = c > 0 ? sx / c : cx
        const by = c > 0 ? sy / c : cy
        x[i] = bx + off * Math.cos(a0)
        y[i] = by + off * Math.sin(a0)
        e++
      }
    }

    // Map placed : survivants MUTÉS (identité stable), disparus retirés, entrants créés.
    const alive = new Set(ids)
    for (const id of [...placed.keys()]) if (!alive.has(id)) placed.delete(id)
    for (let i = 0; i < n; i++) {
      const id = ids[i]
      const p = placed.get(id)
      if (p) {
        p.x = x[i]; p.y = y[i]; p.r = radii[i]; p.degree = deg.get(id) ?? 0
      } else {
        placed.set(id, { id, x: x[i], y: y[i], r: radii[i], degree: deg.get(id) ?? 0 })
      }
    }
  }

  build(input, null)
  if (n === 0) alpha = 0

  const syncPlaced = (): void => {
    for (let i = 0; i < n; i++) {
      const p = placed.get(ids[i])!
      p.x = x[i]
      p.y = y[i]
    }
  }

  const iterate = (): void => {
    alpha += (alphaTarget - alpha) * KB_SIM.ALPHA_DECAY

    // Ressorts (d3-link : cible et source se partagent la correction par biais).
    for (const l of links) {
      let dx = x[l.t] + vx[l.t] - x[l.s] - vx[l.s]
      let dy = y[l.t] + vy[l.t] - y[l.s] - vy[l.s]
      if (dx === 0 && dy === 0) { dx = jiggle(l.s + l.t); dy = jiggle(l.s - l.t) }
      const d = Math.sqrt(dx * dx + dy * dy)
      const k = ((d - l.dist) / d) * alpha * l.strength
      vx[l.t] -= dx * k * l.bias
      vy[l.t] -= dy * k * l.bias
      vx[l.s] += dx * k * (1 - l.bias)
      vy[l.s] += dy * k * (1 - l.bias)
    }

    applyRepulsion(n, x, y, strength, vx, vy, alpha)

    // Centrage doux + intégration (velocity Verlet à la d3).
    const keep = KB_SIM.VELOCITY_KEEP
    const ck = KB_SIM.CENTER_K * alpha
    const lo = PAD
    const hi = side - PAD
    for (let i = 0; i < n; i++) {
      if (!Number.isNaN(fx[i])) {
        x[i] = fx[i]; y[i] = fy[i]; vx[i] = 0; vy[i] = 0
        continue
      }
      vx[i] += (cx - x[i]) * ck
      vy[i] += (cy - y[i]) * ck
      vx[i] *= keep
      vy[i] *= keep
      x[i] += vx[i]
      y[i] += vy[i]
      if (x[i] < lo) { x[i] = lo; vx[i] = 0 } else if (x[i] > hi) { x[i] = hi; vx[i] = 0 }
      if (y[i] < lo) { y[i] = lo; vy[i] = 0 } else if (y[i] > hi) { y[i] = hi; vy[i] = 0 }
    }
  }

  return {
    placed,
    width: side,
    height: side,
    get alpha() { return alpha },
    get settled() { return alpha < KB_SIM.ALPHA_MIN },
    tick(steps = 1) {
      if (n === 0) { alpha = 0; return }
      for (let s = 0; s < steps; s++) {
        if (alpha < KB_SIM.ALPHA_MIN && alphaTarget === 0) break
        iterate()
      }
      syncPlaced()
    },
    kick(a: number) { alpha = Math.max(alpha, a) },
    setAlphaTarget(t: number) { alphaTarget = t },
    pin(id: string, px: number, py: number) {
      const i = index.get(id)
      if (i === undefined) return
      fx[i] = px; fy[i] = py
      x[i] = px; y[i] = py
      vx[i] = 0; vy[i] = 0
      const p = placed.get(id)
      if (p) { p.x = px; p.y = py }
    },
    unpin(id: string) {
      const i = index.get(id)
      if (i === undefined) return
      fx[i] = NaN
      fy[i] = NaN
    },
    morph(inp: KbLayoutInput) {
      const keep = new Map<string, { x: number; y: number; vx: number; vy: number }>()
      for (let i = 0; i < n; i++) keep.set(ids[i], { x: x[i], y: y[i], vx: vx[i], vy: vy[i] })
      build(inp, keep)
      if (n === 0) { alpha = 0; return }
      alpha = Math.max(alpha, KB_SIM.MORPH_ALPHA)
    },
  }
}
