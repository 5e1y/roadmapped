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
 * #317 — ENTRÉE PROGRESSIVE : la sim peut démarrer avec seulement un PRÉFIXE
 * actif des nœuds (`initialReveal`), le reste entrant par `reveal(count)`.
 * Les nœuds pas encore entrés n'existent NI dans `placed` (donc pas dans le
 * DOM) NI dans les forces (répulsion, ressorts, intégration bornés au
 * préfixe) : la charge du montage monte en douceur au lieu de saturer la
 * 1re frame. Un entrant spawne près du barycentre de ses voisins déjà entrés
 * (cohérent avec la « génération qui s'écarte »), et chaque lot réchauffe.
 *
 * #318 — PARAMS INJECTÉS : `KB_SIM` = les DÉFAUTS centralisés ;
 * `createKbSim(input, params?)` fusionne défauts + override partiel
 * (resolveKbSimParams) et `setParams` ré-applique un override À CHAUD
 * (re-dérive rayons/charges/ressorts, positions et vélocités intactes) —
 * c'est le moteur du panneau « Display » de KbView.
 *
 * La boîte de contenu est FIXE (côté ∝ √n, calculé à la création) : pas de
 * recadrage par frame — la caméra (useZoomPan/fitBox) suit la bbox des nœuds.
 * Les KbPlaced du Map `placed` sont MUTÉS en place à chaque tick : le rendu
 * (kbSimDriver) lit toujours les positions courantes sans réallocation, et les
 * mémos React qui tiennent le Map restent stables.
 */

/** Marge dure : les positions sont bornées dans [PAD, side−PAD]. */
const PAD = 28
/** Angle d'or — placements phyllotaxiques déterministes (génération, spawns). */
const GOLDEN = 2.399963229728653

/** Paramètres de la sim — tous numériques, tous overridables (#318). */
export interface KbSimParams {
  /** Sous ce seuil (et sans alphaTarget), la sim est considérée stabilisée. */
  ALPHA_MIN: number
  /** Refroidissement par tick : 1 − ALPHA_MIN^(1/ticks) (défaut ~180 ticks ≈ 3 s). */
  ALPHA_DECAY: number
  /** Frottement : part de vélocité conservée par tick (d3 velocityDecay 0.4). */
  VELOCITY_KEEP: number
  /** Longueur de ressort au repos (px) — resserrée par le poids de l'arête. */
  LINK_DIST: number
  /** Charge répulsive par nœud : base + part ∝ rayon (les hubs poussent plus). */
  CHARGE_BASE: number
  CHARGE_PER_R: number
  /** Force de centrage (× alpha) vers le milieu de la boîte. */
  CENTER_K: number
  /** Tolérance Barnes-Hut θ — au-delà, une région = une charge agrégée. */
  THETA: number
  /** Distances de coupure de la répulsion (²) : anti-singularité / portée max. */
  DIST_MIN2: number
  DIST_MAX2: number
  /** Rayon de la phyllotaxie de départ (le « petit nuage » de la génération). */
  CLUSTER_R: number
  /** Réchauffe au morph (filtre) et à l'entrée d'un lot de reveal (#317). */
  MORPH_ALPHA: number
  /** alphaTarget pendant un drag (d3.drag) : la sim reste vivante sous le doigt. */
  DRAG_TARGET: number
  /** Parité DA avec kbLayout : tailles de pastille ∝ √degré, bornées [R_MIN, R_MAX]. */
  R_MIN: number
  R_MAX: number
}

/** Les DÉFAUTS centralisés (#318) — la source de vérité des réglages. */
export const KB_SIM: Readonly<KbSimParams> = {
  ALPHA_MIN: 0.001,
  ALPHA_DECAY: 1 - Math.pow(0.001, 1 / 180),
  VELOCITY_KEEP: 0.6,
  LINK_DIST: 55,
  CHARGE_BASE: -40,
  CHARGE_PER_R: -5,
  CENTER_K: 0.05,
  THETA: 0.9,
  DIST_MIN2: 1,
  DIST_MAX2: 640_000, // 800 px
  CLUSTER_R: 4,
  MORPH_ALPHA: 0.45,
  DRAG_TARGET: 0.3,
  R_MIN: 5,
  R_MAX: 22,
}

/**
 * Bornes dures des params CUSTOMISABLES (panneau Display + persistance #318) :
 * tout ce qui vient de localStorage passe par sanitizeKbSimOverrides — un JSON
 * trafiqué ou corrompu ne peut pas produire une sim dégénérée.
 */
export const KB_SIM_LIMITS = {
  LINK_DIST: [10, 200],
  CHARGE_BASE: [-300, 0],
  CENTER_K: [0, 0.5],
  VELOCITY_KEEP: [0.05, 0.98],
  ALPHA_DECAY: [0.002, 0.3],
  THETA: [0.3, 1.6],
  R_MIN: [1, 16],
  R_MAX: [8, 48],
} as const

/** Fusion défauts + override partiel — les valeurs non numériques/finies sont ignorées. */
export function resolveKbSimParams(overrides?: Partial<KbSimParams>): KbSimParams {
  const p: KbSimParams = { ...KB_SIM }
  if (overrides) {
    for (const k of Object.keys(KB_SIM) as Array<keyof KbSimParams>) {
      const v = overrides[k]
      if (typeof v === 'number' && Number.isFinite(v)) p[k] = v
    }
  }
  return p
}

/**
 * Désinfecte un override venu de l'EXTÉRIEUR (localStorage) : objet requis,
 * seules les clés customisables (KB_SIM_LIMITS) passent, valeurs numériques
 * finies uniquement, clampées aux bornes.
 */
export function sanitizeKbSimOverrides(raw: unknown): Partial<KbSimParams> {
  const out: Partial<KbSimParams> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const key of Object.keys(KB_SIM_LIMITS) as Array<keyof typeof KB_SIM_LIMITS>) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const [lo, hi] = KB_SIM_LIMITS[key]
    out[key] = Math.min(hi, Math.max(lo, v))
  }
  return out
}

export interface KbSimOptions {
  /**
   * #317 — démarre avec SEULEMENT les `initialReveal` premiers nœuds actifs
   * (préfixe de l'ordre d'input — passer par orderByDegree pour hubs d'abord),
   * le reste entre par `reveal(count)`. Omis = tout d'emblée.
   */
  initialReveal?: number
}

export interface KbSim {
  /** Positions courantes — objets MUTÉS en place à chaque tick (identités stables).
   *  #317 : ne contient QUE les nœuds déjà entrés (revealed). */
  readonly placed: Map<string, KbPlaced>
  readonly width: number
  readonly height: number
  readonly alpha: number
  /** true quand alpha < ALPHA_MIN : la boucle rAF peut s'arrêter. */
  readonly settled: boolean
  /** #317 — nœuds déjà ENTRÉS (préfixe actif) / total du sous-graphe. */
  readonly revealed: number
  readonly total: number
  /** Avance la sim de `steps` ticks (défaut 1). */
  tick(steps?: number): void
  /** Réchauffe : alpha = max(alpha, a) — redémarre une sim refroidie. */
  kick(a: number): void
  /** Plancher d'alpha maintenu (drag) ; 0 = laisse refroidir. */
  setAlphaTarget(t: number): void
  /**
   * #317 — fait ENTRER les nœuds jusqu'à l'indice `count` (monotone, clampé au
   * total). Un entrant spawne près du barycentre de ses voisins déjà entrés
   * (sinon garde sa place de phyllotaxie) ; chaque lot réchauffe (MORPH_ALPHA).
   */
  reveal(count: number): void
  /**
   * #318 — remplace l'override de params À CHAUD (fusionné aux défauts) :
   * re-dérive rayons, charges et ressorts — positions et vélocités intactes.
   */
  setParams(overrides?: Partial<KbSimParams>): void
  /** Épingle un nœud à (x, y) — il ne bouge plus, les voisins réagissent. */
  pin(id: string, x: number, y: number): void
  unpin(id: string): void
  /**
   * Change le sous-graphe (filtre) : les survivants GARDENT position et
   * vélocité, les entrants apparaissent près du barycentre de leurs voisins
   * déjà placés (sinon au centre), et la sim est réchauffée (MORPH_ALPHA).
   * Après un morph, la vue est ENTIÈREMENT révélée (reveal sans objet).
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

/** Coupures de répulsion pré-dérivées des params (une fois par passe). */
interface RepelCut { theta2: number; min2: number; max2: number }

function applyQuad(
  q: Quad, i: number,
  x: Float64Array, y: Float64Array, vx: Float64Array, vy: Float64Array,
  strength: Float64Array, alpha: number, cut: RepelCut,
): void {
  let dx = q.cx - x[i]
  let dy = q.cy - y[i]
  let d2 = dx * dx + dy * dy
  // Critère de Barnes-Hut : région assez lointaine ⇒ une seule charge agrégée.
  if (q.size * q.size < cut.theta2 * d2) {
    if (d2 < cut.max2 && q.charge !== 0) {
      if (d2 === 0) { dx = jiggle(i); dy = jiggle(i + 1); d2 = dx * dx + dy * dy }
      if (d2 < cut.min2) d2 = Math.sqrt(cut.min2 * d2)
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
      if (l >= cut.max2) continue
      if (l === 0) { ddx = jiggle(i + j); ddy = jiggle(i - j); l = ddx * ddx + ddy * ddy }
      if (l < cut.min2) l = Math.sqrt(cut.min2 * l)
      const w = (strength[j] * alpha) / l
      vx[i] += ddx * w
      vy[i] += ddy * w
    }
    return
  }
  for (const kid of q.kids!) if (kid) applyQuad(kid, i, x, y, vx, vy, strength, alpha, cut)
}

/**
 * Répulsion (charge) Barnes-Hut sur `n` points — exportée SEULE pour être
 * testée contre la version naïve O(n²) (tolérance θ). `p` : params (#318),
 * défauts KB_SIM si omis.
 */
export function applyRepulsion(
  n: number,
  x: Float64Array, y: Float64Array,
  strength: Float64Array,
  vx: Float64Array, vy: Float64Array,
  alpha: number,
  p: Pick<KbSimParams, 'THETA' | 'DIST_MIN2' | 'DIST_MAX2'> = KB_SIM,
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
  const cut: RepelCut = { theta2: p.THETA * p.THETA, min2: p.DIST_MIN2, max2: p.DIST_MAX2 }
  for (let i = 0; i < n; i++) applyQuad(root, i, x, y, vx, vy, strength, alpha, cut)
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

/**
 * Ordre d'ENTRÉE de la génération (#317) : hubs d'abord (degré décroissant,
 * départage par id — déterministe, jamais Math.random). Le reveal progressif
 * active un PRÉFIXE de cet ordre : la structure (hubs) se pose d'abord, les
 * feuilles rejoignent le réseau au fil des lots.
 */
export function orderByDegree(input: KbLayoutInput): KbLayoutInput {
  const deg = degreesOf(input)
  const nodes = [...input.nodes].sort((a, b) =>
    (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return { nodes, edges: input.edges }
}

/** Ressorts (indices, distance au repos, raideur 1/min(deg), biais par degré — d3-link). */
function buildLinks(
  input: KbLayoutInput,
  index: Map<string, number>,
  deg: Map<string, number>,
  p: KbSimParams,
): Link[] {
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
      dist: p.LINK_DIST * (1 - 0.25 * (w / maxW)),
      strength: 1 / Math.min(ds, dt),
      bias: ds / (ds + dt),
    }
  })
}

export function createKbSim(
  input: KbLayoutInput,
  params?: Partial<KbSimParams>,
  opts?: KbSimOptions,
): KbSim {
  let P = resolveKbSimParams(params)
  // Boîte FIXE ∝ √n (calée sur la vue de création — les morphs restent dedans).
  const side = Math.max(600, 110 * Math.sqrt(Math.max(1, input.nodes.length)))
  const cx = side / 2
  const cy = side / 2

  let n = 0
  let curInput = input
  let ids: string[] = []
  let index = new Map<string, number>()
  let x = new Float64Array(0)
  let y = new Float64Array(0)
  let vx = new Float64Array(0)
  let vy = new Float64Array(0)
  let fx = new Float64Array(0) // NaN = libre
  let fy = new Float64Array(0)
  let strength = new Float64Array(0)
  let radii: number[] = []
  let degArr: number[] = []
  let maxDeg = 1
  let links: Link[] = []
  const placed = new Map<string, KbPlaced>()

  // #317 — préfixe ACTIF : seuls les indices < active existent (forces,
  // intégration, placed). Les links sont TRIÉS par extrémité max : les liens
  // actifs (deux bouts entrés) forment toujours le préfixe [0, activeLinks).
  let active = 0
  let activeLinks = 0
  let adjIdx: number[][] | null = null

  let alpha = 1
  let alphaTarget = 0

  const sortLinks = (): void => {
    links.sort((a, b) => Math.max(a.s, a.t) - Math.max(b.s, b.t))
  }
  const advanceLinks = (from: number): number => {
    let i = from
    while (i < links.length && Math.max(links[i].s, links[i].t) < active) i++
    return i
  }
  /** Adjacence par indices, construite à la demande (spawns du reveal). */
  const ensureAdj = (): number[][] => {
    if (!adjIdx) {
      adjIdx = Array.from({ length: n }, () => [] as number[])
      for (const l of links) { adjIdx[l.s].push(l.t); adjIdx[l.t].push(l.s) }
    }
    return adjIdx
  }

  /** (Re)construit l'état pour `input` ; `keep` = positions/vélocités héritées. */
  const build = (
    inp: KbLayoutInput,
    keep: Map<string, { x: number; y: number; vx: number; vy: number }> | null,
  ): void => {
    curInput = inp
    const deg = degreesOf(inp)
    maxDeg = Math.max(1, ...deg.values())
    n = inp.nodes.length
    ids = inp.nodes.map((d) => d.id)
    index = new Map(ids.map((id, i) => [id, i]))
    x = new Float64Array(n); y = new Float64Array(n)
    vx = new Float64Array(n); vy = new Float64Array(n)
    fx = new Float64Array(n).fill(NaN); fy = new Float64Array(n).fill(NaN)
    strength = new Float64Array(n)
    links = buildLinks(inp, index, deg, P)
    sortLinks()
    adjIdx = null
    active = n
    activeLinks = links.length

    radii = new Array<number>(n)
    degArr = new Array<number>(n)
    const survivors = new Array<boolean>(n).fill(false)
    const entrants: number[] = []
    for (let i = 0; i < n; i++) {
      const d = deg.get(ids[i]) ?? 0
      degArr[i] = d
      radii[i] = P.R_MIN + (P.R_MAX - P.R_MIN) * Math.sqrt(d / maxDeg)
      strength[i] = P.CHARGE_BASE + P.CHARGE_PER_R * radii[i]
      const prev = keep?.get(ids[i])
      if (prev) {
        x[i] = prev.x; y[i] = prev.y; vx[i] = prev.vx; vy[i] = prev.vy
        survivors[i] = true
      } else if (keep) {
        entrants.push(i)
      } else {
        // Génération : petit nuage phyllotaxique au centre (déterministe).
        const r0 = P.CLUSTER_R * Math.sqrt(i + 0.5)
        const a0 = i * GOLDEN
        x[i] = cx + r0 * Math.cos(a0)
        y[i] = cy + r0 * Math.sin(a0)
      }
    }

    if (entrants.length > 0) {
      // Adjacence (indices) pour placer chaque entrant près de ses voisins survivants.
      const adj = ensureAdj()
      let e = 0
      for (const i of entrants) {
        let sx = 0, sy = 0, c = 0
        for (const j of adj[i]) {
          if (survivors[j]) { sx += x[j]; sy += y[j]; c++ }
        }
        const a0 = e * GOLDEN
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
        p.x = x[i]; p.y = y[i]; p.r = radii[i]; p.degree = degArr[i]
      } else {
        placed.set(id, { id, x: x[i], y: y[i], r: radii[i], degree: degArr[i] })
      }
    }
  }

  build(input, null)
  if (n === 0) alpha = 0

  // #317 — génération staggered : on RÉDUIT au préfixe initial demandé, le
  // reste (retiré de placed → pas de DOM, pas de forces) entrera par reveal().
  if (opts?.initialReveal !== undefined && opts.initialReveal < n) {
    active = Math.max(0, Math.floor(opts.initialReveal))
    for (let i = active; i < n; i++) placed.delete(ids[i])
    activeLinks = advanceLinks(0)
  }

  const syncPlaced = (): void => {
    for (let i = 0; i < active; i++) {
      const p = placed.get(ids[i])!
      p.x = x[i]
      p.y = y[i]
    }
  }

  const iterate = (): void => {
    alpha += (alphaTarget - alpha) * P.ALPHA_DECAY

    // Ressorts (d3-link : cible et source se partagent la correction par biais).
    for (let li = 0; li < activeLinks; li++) {
      const l = links[li]
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

    applyRepulsion(active, x, y, strength, vx, vy, alpha, P)

    // Centrage doux + intégration (velocity Verlet à la d3).
    const keep = P.VELOCITY_KEEP
    const ck = P.CENTER_K * alpha
    const lo = PAD
    const hi = side - PAD
    for (let i = 0; i < active; i++) {
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
    get settled() { return alpha < P.ALPHA_MIN },
    get revealed() { return active },
    get total() { return n },
    tick(steps = 1) {
      if (n === 0) { alpha = 0; return }
      for (let s = 0; s < steps; s++) {
        if (alpha < P.ALPHA_MIN && alphaTarget === 0) break
        iterate()
      }
      syncPlaced()
    },
    kick(a: number) { alpha = Math.max(alpha, a) },
    setAlphaTarget(t: number) { alphaTarget = t },
    reveal(count: number) {
      const target = Math.min(n, Math.floor(count))
      if (target <= active) return
      const adj = ensureAdj()
      for (let i = active; i < target; i++) {
        // Spawn près du barycentre de ses voisins DÉJÀ entrés (j < i : entrés à
        // un lot précédent, ou plus tôt dans CE lot) — sinon la place de
        // phyllotaxie posée à la génération fait foi (déterministe).
        let sx = 0, sy = 0, c = 0
        for (const j of adj[i]) if (j < i) { sx += x[j]; sy += y[j]; c++ }
        if (c > 0) {
          const a0 = i * GOLDEN
          const off = 16 + 8 * (i % 3)
          x[i] = sx / c + off * Math.cos(a0)
          y[i] = sy / c + off * Math.sin(a0)
        }
        vx[i] = 0; vy[i] = 0
        placed.set(ids[i], { id: ids[i], x: x[i], y: y[i], r: radii[i], degree: degArr[i] })
      }
      active = target
      activeLinks = advanceLinks(activeLinks)
      // Un lot qui entre réchauffe : les entrants doivent encore se placer.
      alpha = Math.max(alpha, P.MORPH_ALPHA)
    },
    setParams(overrides?: Partial<KbSimParams>) {
      P = resolveKbSimParams(overrides)
      // Re-dérive TOUT ce qui dépend des params — positions/vélocités intactes.
      for (let i = 0; i < n; i++) {
        radii[i] = P.R_MIN + (P.R_MAX - P.R_MIN) * Math.sqrt(degArr[i] / maxDeg)
        strength[i] = P.CHARGE_BASE + P.CHARGE_PER_R * radii[i]
        const p = placed.get(ids[i])
        if (p) p.r = radii[i]
      }
      links = buildLinks(curInput, index, new Map(ids.map((id, i) => [id, degArr[i]])), P)
      sortLinks()
      adjIdx = null
      activeLinks = advanceLinks(0)
    },
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
      // Seuls les nœuds RÉVÉLÉS survivent avec leur position — un morph pendant
      // le reveal traite les non-entrés comme des entrants (près des voisins).
      const keep = new Map<string, { x: number; y: number; vx: number; vy: number }>()
      for (let i = 0; i < active; i++) keep.set(ids[i], { x: x[i], y: y[i], vx: vx[i], vy: vy[i] })
      build(inp, keep)
      if (n === 0) { alpha = 0; return }
      alpha = Math.max(alpha, P.MORPH_ALPHA)
    },
  }
}
