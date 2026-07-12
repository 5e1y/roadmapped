import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Zoom/pan maison de la Vue Graphe (graph-v2) — pas de dépendance. Remplace le
 * `scale`+scroll natif : molette = zoom VERS LE CURSEUR, drag = pan, `fit` =
 * ajuster le contenu au viewport, `reset` = 100 %. La géométrie (zoomAt,
 * fitTransform, clampPan) est en fonctions PURES exportées, testées à part.
 *
 * Transform appliqué sur la boîte de layout :
 *   `translate(${tx}px, ${ty}px) scale(${scale})`, `transform-origin: 0 0`.
 */
export interface ZoomPanTransform {
  scale: number
  tx: number
  ty: number
}

export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 2.5
/** Bande de contenu qui doit toujours rester visible dans le viewport (px). */
const KEEP_VISIBLE = 48
/** Pas de pan clavier (px viewport). */
const KEY_PAN = 48
/** Seuil (px, |dx|+|dy|) au-delà duquel un pointerdown devient un PAN (#312) :
 *  en-deçà, c'est un clic → le `click` doit atteindre le nœud (pas de capture). */
const DRAG_THRESHOLD = 4
export const ZOOM_STEP = 1.2

export const clampScale = (s: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s))

const clampBetween = (v: number, lo: number, hi: number): number =>
  lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v))

/**
 * Zoom autour d'une ANCRE en coordonnées viewport : le point du contenu situé
 * sous l'ancre reste fixe à l'écran (formule d'ancrage classique).
 */
export function zoomAt(t: ZoomPanTransform, anchor: { x: number; y: number }, factor: number): ZoomPanTransform {
  const scale = clampScale(t.scale * factor)
  const k = scale / t.scale
  return { scale, tx: anchor.x - (anchor.x - t.tx) * k, ty: anchor.y - (anchor.y - t.ty) * k }
}

/**
 * « Ajuster » : scale = min des deux axes (jamais > 100 % — ajuster ne doit pas
 * grossir un petit graphe), contenu centré dans le viewport.
 */
export function fitTransform(contentW: number, contentH: number, vpW: number, vpH: number): ZoomPanTransform {
  if (contentW <= 0 || contentH <= 0 || vpW <= 0 || vpH <= 0) return { scale: 1, tx: 0, ty: 0 }
  const scale = clampScale(Math.min(vpW / contentW, vpH / contentH, 1))
  return {
    scale,
    tx: Math.max(0, (vpW - contentW * scale) / 2),
    ty: Math.max(0, (vpH - contentH * scale) / 2),
  }
}

/**
 * Recentre + zoome sur une BOÎTE du contenu (coordonnées contenu). Sert au
 * « fit sur les résultats » de la recherche KB : la bbox des nœuds matchés est
 * centrée dans le viewport, avec ~20 % de marge. Contrairement à fitTransform,
 * ça PEUT grossir (jusqu'à ZOOM_MAX) — on veut zoomer sur un petit sous-ensemble.
 */
export function boxTransform(
  box: { x: number; y: number; w: number; h: number }, vpW: number, vpH: number,
): ZoomPanTransform {
  if (box.w <= 0 || box.h <= 0 || vpW <= 0 || vpH <= 0) return { scale: 1, tx: 0, ty: 0 }
  const scale = clampScale(Math.min(vpW / (box.w * 1.2), vpH / (box.h * 1.2)))
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return { scale, tx: vpW / 2 - cx * scale, ty: vpH / 2 - cy * scale }
}

/**
 * Centre un POINT du contenu (coordonnées contenu) au milieu du viewport, à un
 * `scale` donné (borné [ZOOM_MIN, ZOOM_MAX]). Sert au zoom-sur-nœud du KB
 * (#311) : clic → on cadre le nœud au centre. Pur (le clamp de pan reste à
 * l'appelant, comme boxTransform).
 */
export function centerTransform(
  center: { x: number; y: number }, scale: number, vpW: number, vpH: number,
): ZoomPanTransform {
  const s = clampScale(scale)
  return { scale: s, tx: vpW / 2 - center.x * s, ty: vpH / 2 - center.y * s }
}

/** Borne la translation : le contenu garde au moins KEEP_VISIBLE px à l'écran. */
export function clampPan(t: ZoomPanTransform, contentW: number, contentH: number, vpW: number, vpH: number): ZoomPanTransform {
  if (vpW <= 0 || vpH <= 0) return t
  return {
    scale: t.scale,
    tx: clampBetween(t.tx, KEEP_VISIBLE - contentW * t.scale, vpW - KEEP_VISIBLE),
    ty: clampBetween(t.ty, KEEP_VISIBLE - contentH * t.scale, vpH - KEEP_VISIBLE),
  }
}

export interface ZoomPan {
  /** À poser sur le viewport (overflow-hidden). Le hook y attache la molette. */
  viewportRef: React.RefObject<HTMLDivElement>
  transform: ZoomPanTransform
  /** Drag en cours (curseur grabbing). */
  panning: boolean
  /** Handlers à étaler sur le viewport (le composant filtre le pointerdown). */
  handlers: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  }
  /** Zoom par facteur, ancré au centre du viewport (boutons + / −). */
  zoomBy: (factor: number) => void
  fit: () => void
  /** Recentre/zoome sur une boîte du contenu ; null = fit du contenu entier. */
  fitBox: (box: { x: number; y: number; w: number; h: number } | null) => void
  /**
   * Centre un point du contenu au milieu du viewport à `scale` (au moins ce que
   * l'appelant passe), en TRANSITION DOUCE — instantané sous prefers-reduced-
   * motion. Zoom-sur-nœud du KB (#311).
   */
  centerOn: (x: number, y: number, scale: number) => void
  reset: () => void
}

const TWEEN_MS = 260
const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function useZoomPan(contentW: number, contentH: number): ZoomPan {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState<ZoomPanTransform>({ scale: 1, tx: 0, ty: 0 })
  const [panning, setPanning] = useState(false)
  // Dimensions du contenu lues à l'exécution (pas de re-création des handlers).
  const content = useRef({ w: contentW, h: contentH })
  content.current = { w: contentW, h: contentH }
  // `active` : le drag n'arme la capture/le pan qu'au 1er mouvement au-delà du
  // seuil — sinon setPointerCapture au pointerdown détournerait le `click` et
  // les nœuds ne seraient JAMAIS cliquables (#312). sx/sy = origine, pour le seuil.
  const drag = useRef<{ pointerId: number; x: number; y: number; sx: number; sy: number; active: boolean } | null>(null)

  // Coalescence rAF (#308) : molette et pointermove peuvent tirer plusieurs
  // événements PAR FRAME — chaque setTransform re-rendait le graphe hôte. Les
  // deltas s'accumulent dans un ref (base = dernier pending, pas le state), un
  // seul setState par frame. Sans rAF (jsdom) : application synchrone.
  const transformRef = useRef(transform)
  transformRef.current = transform
  const pending = useRef<ZoomPanTransform | null>(null)
  const rafId = useRef(0)
  // Tween du centerOn (#311) : un rAF séparé de la coalescence, annulé dès
  // qu'un geste utilisateur (pan/molette/zoom) reprend la main.
  const tweenRaf = useRef(0)

  const cancelTween = useCallback(() => {
    if (tweenRaf.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tweenRaf.current)
    tweenRaf.current = 0
  }, [])

  const flush = useCallback(() => {
    rafId.current = 0
    if (pending.current) {
      setTransform(pending.current)
      pending.current = null
    }
  }, [])

  useEffect(() => () => {
    if (rafId.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId.current)
    if (tweenRaf.current && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(tweenRaf.current)
  }, [])

  const apply = useCallback((fn: (prev: ZoomPanTransform) => ZoomPanTransform) => {
    cancelTween() // un geste utilisateur interrompt le tween en cours
    const el = viewportRef.current
    const next = fn(pending.current ?? transformRef.current)
    pending.current = el
      ? clampPan(next, content.current.w, content.current.h, el.clientWidth, el.clientHeight)
      : next
    if (typeof requestAnimationFrame !== 'function') { flush(); return }
    if (!rafId.current) rafId.current = requestAnimationFrame(flush)
  }, [flush, cancelTween])

  /** Pose une transform ABSOLUE : annule tout delta en attente (fit/reset). */
  const commit = useCallback((t: ZoomPanTransform) => {
    pending.current = null
    setTransform(t)
  }, [])

  /**
   * Anime la transform vers une cible (ease-out cubique, ~260 ms). Sous
   * prefers-reduced-motion (ou sans rAF, jsdom) : saut immédiat. Le tween
   * n'utilise QUE `commit` (jamais `apply`, sinon il s'auto-annulerait).
   */
  const animateTo = useCallback((target: ZoomPanTransform) => {
    cancelTween()
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') { commit(target); return }
    const from = pending.current ?? transformRef.current
    pending.current = null
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const ease = (p: number) => 1 - Math.pow(1 - p, 3)
    const frame = () => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const p = Math.min(1, (now - t0) / TWEEN_MS)
      const k = ease(p)
      setTransform({
        scale: from.scale + (target.scale - from.scale) * k,
        tx: from.tx + (target.tx - from.tx) * k,
        ty: from.ty + (target.ty - from.ty) * k,
      })
      tweenRaf.current = p < 1 ? requestAnimationFrame(frame) : 0
    }
    tweenRaf.current = requestAnimationFrame(frame)
  }, [commit, cancelTween])

  // Molette = zoom vers le curseur. Listener NATIF non-passif : React attache
  // `onWheel` en passif à la racine, preventDefault y serait ignoré (et la page
  // scrollerait sous le graphe).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      apply((prev) => zoomAt(prev, anchor, Math.exp(-e.deltaY * 0.0015)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [apply])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    cancelTween() // saisir le graphe interrompt tout tween en cours
    // PAS de setPointerCapture ici (#312) : un simple clic (down+up sans bouger)
    // doit laisser le `click` atteindre le nœud. On n'arme le pan qu'au 1er
    // mouvement au-delà du seuil (onPointerMove).
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, active: false }
  }, [cancelTween])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    if (!d.active) {
      // En-deçà du seuil, c'est (encore) un clic : on ne capture pas, on ne pan pas.
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) < DRAG_THRESHOLD) return
      d.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
      setPanning(true)
    }
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    d.x = e.clientX
    d.y = e.clientY
    apply((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
  }, [apply])

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return
    drag.current = null
    setPanning(false)
  }, [])

  const zoomBy = useCallback((factor: number) => {
    const el = viewportRef.current
    const anchor = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : { x: 0, y: 0 }
    apply((prev) => zoomAt(prev, anchor, factor))
  }, [apply])

  const fit = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    cancelTween()
    commit(fitTransform(content.current.w, content.current.h, el.clientWidth, el.clientHeight))
  }, [commit, cancelTween])

  const fitBox = useCallback((box: { x: number; y: number; w: number; h: number } | null) => {
    const el = viewportRef.current
    if (!el) return
    cancelTween()
    const t = box
      ? boxTransform(box, el.clientWidth, el.clientHeight)
      : fitTransform(content.current.w, content.current.h, el.clientWidth, el.clientHeight)
    commit(clampPan(t, content.current.w, content.current.h, el.clientWidth, el.clientHeight))
  }, [commit, cancelTween])

  const centerOn = useCallback((x: number, y: number, scale: number) => {
    const el = viewportRef.current
    if (!el) return
    const target = clampPan(
      centerTransform({ x, y }, scale, el.clientWidth, el.clientHeight),
      content.current.w, content.current.h, el.clientWidth, el.clientHeight,
    )
    animateTo(target)
  }, [animateTo])

  const reset = useCallback(() => { cancelTween(); commit({ scale: 1, tx: 0, ty: 0 }) }, [commit, cancelTween])

  // A11y : le viewport est focusable (tabIndex=0 côté composant) — flèches =
  // pan, + / − = zoom, 0 = réinitialiser (politique a11y du repo).
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const pan: Record<string, [number, number]> = {
      ArrowLeft: [KEY_PAN, 0], ArrowRight: [-KEY_PAN, 0], ArrowUp: [0, KEY_PAN], ArrowDown: [0, -KEY_PAN],
    }
    if (e.key in pan) {
      const [dx, dy] = pan[e.key]
      apply((prev) => ({ ...prev, tx: prev.tx + dx, ty: prev.ty + dy }))
    } else if (e.key === '+' || e.key === '=') {
      zoomBy(ZOOM_STEP)
    } else if (e.key === '-') {
      zoomBy(1 / ZOOM_STEP)
    } else if (e.key === '0') {
      reset()
    } else {
      return
    }
    e.preventDefault()
  }, [apply, zoomBy, reset])

  return {
    viewportRef, transform, panning,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onKeyDown },
    zoomBy, fit, fitBox, centerOn, reset,
  }
}
