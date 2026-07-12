/**
 * Layout force-directed PUR et DÉTERMINISTE de la Knowledge base (#kb).
 * Même famille que `layoutTagGraph` (#146) — répulsion n², ressorts sur les
 * arêtes, gravité au centre, refroidissement linéaire, positions initiales sur
 * un cercle (aucun aléa). PAS de dagre (réservé au DAG de dépendances de la
 * Roadmap) : un knowledge graph est non-dirigé et dense.
 *
 * Isolé côté rendu : la sortie est en pixels + une bbox (width/height) que
 * `useZoomPan` consomme telle quelle — le composant ne connaît que des
 * coordonnées. Mémoïsé par IDENTITÉ d'input (WeakMap), comme graphLayout.
 *
 * #308 : la simulation est exposée en STEPPER (`createKbLayoutStepper`) pour
 * être découpée en tranches de temps (rAF / setTimeout) — sur le vrai graphe
 * Graphify (869 nœuds), le calcul synchrone bloquait le main thread ~550 ms.
 * `kbLayout` (API historique) = le stepper déroulé d'un trait : le résultat
 * est STRICTEMENT identique (même code, même ordre d'opérations).
 */

export interface KbLayoutNode { id: string }
export interface KbLayoutEdge { source: string; target: string; weight?: number }
export interface KbLayoutInput { nodes: KbLayoutNode[]; edges: KbLayoutEdge[] }

export interface KbPlaced {
  id: string
  x: number
  y: number
  /** Rayon de la pastille (∝ √degré). */
  r: number
  degree: number
}

export interface KbLayoutResult {
  nodes: Map<string, KbPlaced>
  width: number
  height: number
}

const R_MIN = 5
const R_MAX = 22
const NODE_PAD = 28 // marge autour du dessin (px)

const cache = new WeakMap<KbLayoutInput, KbLayoutResult>()

/** Degré (non-dirigé) de chaque nœud, boucles et arêtes orphelines ignorées. */
function degrees(input: KbLayoutInput): Map<string, number> {
  const ids = new Set(input.nodes.map((n) => n.id))
  const deg = new Map<string, number>(input.nodes.map((n) => [n.id, 0]))
  for (const e of input.edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue
    deg.set(e.source, (deg.get(e.source) ?? 0) + 1)
    deg.set(e.target, (deg.get(e.target) ?? 0) + 1)
  }
  return deg
}

const ITER = 300

const now: () => number =
  typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()

export interface KbLayoutStepper {
  /** true dès que les ITER itérations sont consommées. */
  readonly done: boolean
  /** Progression 0..1 (part des itérations effectuées). */
  readonly progress: number
  /**
   * Avance la simulation d'AU MOINS une itération, puis continue tant que le
   * budget de temps (ms) n'est pas épuisé. Renvoie `done`.
   */
  step(budgetMs: number): boolean
  /** Positions courantes, recadrées dans leur bbox (utilisable avant la fin). */
  snapshot(): KbLayoutResult
}

/**
 * Simulation incrémentale : mêmes forces, même refroidissement, même ordre
 * d'opérations que l'ancien `kbLayout` monolithique — l'égalité BIT À BIT des
 * positions est testée. Seul le découpage temporel change.
 */
export function createKbLayoutStepper(input: KbLayoutInput): KbLayoutStepper {
  const nodes = input.nodes
  const n = nodes.length
  const deg = degrees(input)
  const maxDeg = Math.max(1, ...deg.values())
  const radiusOf = (id: string) => R_MIN + (R_MAX - R_MIN) * Math.sqrt((deg.get(id) ?? 0) / maxDeg)

  // Espace de simulation ∝ √n (densité constante). Cercle initial déterministe.
  const side = Math.max(360, 90 * Math.sqrt(n))
  const cx = side / 2
  const cy = side / 2
  const xs = new Array<number>(n)
  const ys = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const r0 = n === 1 ? 0 : side * 0.32 + (i % 2) * 8 // léger jitter pair/impair, sans aléa
    xs[i] = cx + r0 * Math.cos(a)
    ys[i] = cy + r0 * Math.sin(a)
  }

  const index = new Map(nodes.map((d, i) => [d.id, i]))
  const ids = new Set(nodes.map((d) => d.id))
  const springs = input.edges
    .filter((e) => e.source !== e.target && ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ i: index.get(e.source)!, j: index.get(e.target)!, w: e.weight ?? 1 }))
  const maxWeight = Math.max(1, ...springs.map((s) => s.w))

  const REPULSION = side * 6
  const REST = side * 0.14 // longueur de ressort au repos
  let iter = n === 0 ? ITER : 0

  const iterate = () => {
    const heat = 1 - iter / ITER
    const fx = new Array<number>(n).fill(0)
    const fy = new Array<number>(n).fill(0)

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j]
        let dy = ys[i] - ys[j]
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) { dx = 0.1; dy = 0.1 * (i - j || 1); d2 = 0.02 }
        const f = REPULSION / d2
        const d = Math.sqrt(d2)
        fx[i] += (dx / d) * f; fy[i] += (dy / d) * f
        fx[j] -= (dx / d) * f; fy[j] -= (dy / d) * f
      }
    }
    for (const s of springs) {
      const dx = xs[s.j] - xs[s.i]
      const dy = ys[s.j] - ys[s.i]
      const d = Math.max(0.1, Math.hypot(dx, dy))
      const rest = REST * (1 - 0.25 * (s.w / maxWeight))
      const f = (d - rest) * 0.03 * (0.6 + 0.4 * (s.w / maxWeight))
      fx[s.i] += (dx / d) * f; fy[s.i] += (dy / d) * f
      fx[s.j] -= (dx / d) * f; fy[s.j] -= (dy / d) * f
    }
    for (let i = 0; i < n; i++) {
      fx[i] += (cx - xs[i]) * 0.015
      fy[i] += (cy - ys[i]) * 0.015
    }
    for (let i = 0; i < n; i++) {
      const cap = side * 0.05 * heat + 0.5
      const len = Math.hypot(fx[i], fy[i])
      const k = len > cap ? cap / len : 1
      xs[i] += fx[i] * k
      ys[i] += fy[i] * k
    }
  }

  let finalSnap: KbLayoutResult | null = null
  const snapshot = (): KbLayoutResult => {
    if (finalSnap) return finalSnap
    if (n === 0) {
      finalSnap = { nodes: new Map(), width: NODE_PAD * 2, height: NODE_PAD * 2 }
      return finalSnap
    }
    // Recadrage : bbox du dessin (rayon compris) translatée à NODE_PAD.
    const rs = nodes.map((d) => radiusOf(d.id))
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, xs[i] - rs[i]); maxX = Math.max(maxX, xs[i] + rs[i])
      minY = Math.min(minY, ys[i] - rs[i]); maxY = Math.max(maxY, ys[i] + rs[i])
    }
    const placed = new Map<string, KbPlaced>()
    for (let i = 0; i < n; i++) {
      placed.set(nodes[i].id, {
        id: nodes[i].id,
        x: xs[i] - minX + NODE_PAD,
        y: ys[i] - minY + NODE_PAD,
        r: rs[i],
        degree: deg.get(nodes[i].id) ?? 0,
      })
    }
    const result: KbLayoutResult = {
      nodes: placed,
      width: (maxX - minX) + NODE_PAD * 2,
      height: (maxY - minY) + NODE_PAD * 2,
    }
    if (iter >= ITER) finalSnap = result
    return result
  }

  return {
    get done() { return iter >= ITER },
    get progress() { return iter / ITER },
    step(budgetMs: number): boolean {
      const t0 = now()
      while (iter < ITER) {
        iterate()
        iter++
        if (now() - t0 >= budgetMs) break
      }
      return iter >= ITER
    },
    snapshot,
  }
}

/**
 * Positionne les nœuds. Pur, déterministe, mémoïsé par input. La taille de la
 * boîte suit le nombre de nœuds (√n) pour garder une densité lisible.
 */
export function kbLayout(input: KbLayoutInput): KbLayoutResult {
  const cached = cache.get(input)
  if (cached) return cached
  const stepper = createKbLayoutStepper(input)
  stepper.step(Infinity)
  const result = stepper.snapshot()
  cache.set(input, result)
  return result
}
