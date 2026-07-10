import { useEffect, useRef } from 'react'
import { BIRD_PALETTE, BIRD_IDLE, BIRD_PECK, type BirdAnim } from '../lib/birdFrames'

/**
 * La mascotte Roadmapped (#212) dans le header, à gauche du titre. Pixel art
 * rendu au canvas (nearest-neighbor, aucun transform continu — c'est du sprite
 * animé, pas du SVG déformé). Ne suit PAS le curseur ici (ça, c'est la homepage) :
 * au repos elle joue une anim au hasard (idle ou peck) UNE fois toutes les ~6 s,
 * puis se fige sur la pose de repos. Décoratif -> aria-hidden.
 */
export function BirdMascot({ scale = 2, gap = 6000 }: { scale?: number; gap?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cols = BIRD_IDLE.cols
    const rows = BIRD_IDLE.rows
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = cols * scale * dpr
    canvas.height = rows * scale * dpr
    canvas.style.width = `${cols * scale}px`
    canvas.style.height = `${rows * scale}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Le logo regarde à DROITE (décision Rémi). Les frames canoniques sont
    // dessinées face à gauche -> on miroir horizontalement au rendu (x inversé).
    const draw = (anim: BirdAnim, fi: number) => {
      ctx.clearRect(0, 0, cols * scale, rows * scale)
      const grid = anim.frames[fi]
      for (let r = 0; r < anim.rows; r++) {
        const line = grid[r].split(' ')
        for (let c = 0; c < anim.cols; c++) {
          const col = BIRD_PALETTE[line[c]]
          if (col) {
            ctx.fillStyle = col
            ctx.fillRect((anim.cols - 1 - c) * scale, r * scale, scale, scale)
          }
        }
      }
    }

    // Repos figé si l'utilisateur refuse les animations.
    if (reduce) {
      draw(BIRD_IDLE, 0)
      return
    }

    let anim: BirdAnim = BIRD_IDLE
    let fi = 0
    let playing = false
    let restTimer = gap        // déclenche une 1re anim tout de suite
    let frameTimer = 0
    let last = 0
    let raf = 0

    const tick = (t: number) => {
      const dt = Math.min(50, t - last || 16)
      last = t
      if (!playing) {
        restTimer += dt
        if (restTimer >= gap) {
          anim = Math.random() < 0.5 ? BIRD_IDLE : BIRD_PECK
          playing = true
          fi = 0
          frameTimer = 0
          restTimer = 0
        }
      } else {
        frameTimer += dt
        if (frameTimer > 1000 / anim.fps) {
          fi++
          frameTimer = 0
          if (fi >= anim.frames.length) {
            fi = 0
            playing = false      // un cycle joué -> retour au repos figé
          }
        }
      }
      draw(playing ? anim : BIRD_IDLE, playing ? fi : 0)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [scale, gap])

  return <canvas ref={ref} aria-hidden="true" className="shrink-0" />
}
