import { describe, it, expect } from 'vitest'
import { zoomAt, fitTransform, clampPan, clampScale, ZOOM_MIN, ZOOM_MAX } from './useZoomPan'

describe('zoomAt (zoom vers le curseur)', () => {
  it('le point du contenu sous l’ancre reste fixe à l’écran', () => {
    const t = { scale: 1, tx: 40, ty: -20 }
    const anchor = { x: 300, y: 150 }
    const next = zoomAt(t, anchor, 1.5)
    // Point contenu sous l'ancre avant : (anchor - t) / scale — doit être inchangé après.
    const before = { x: (anchor.x - t.tx) / t.scale, y: (anchor.y - t.ty) / t.scale }
    const after = { x: (anchor.x - next.tx) / next.scale, y: (anchor.y - next.ty) / next.scale }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(next.scale).toBeCloseTo(1.5)
  })

  it('borne le scale à [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(zoomAt({ scale: 2, tx: 0, ty: 0 }, { x: 0, y: 0 }, 100).scale).toBe(ZOOM_MAX)
    expect(zoomAt({ scale: 0.3, tx: 0, ty: 0 }, { x: 0, y: 0 }, 0.001).scale).toBe(ZOOM_MIN)
    expect(clampScale(1)).toBe(1)
  })

  it('facteur 1 = identité', () => {
    const t = { scale: 0.8, tx: 12, ty: 34 }
    expect(zoomAt(t, { x: 100, y: 100 }, 1)).toEqual(t)
  })
})

describe('fitTransform (« Ajuster »)', () => {
  it('contenu plus grand que le viewport : scale = min des deux axes, contenu calé', () => {
    const t = fitTransform(2000, 500, 1000, 400)
    expect(t.scale).toBeCloseTo(0.5) // min(1000/2000, 400/500) = 0.5
    expect(t.tx).toBe(0)
    expect(t.ty).toBeCloseTo((400 - 500 * 0.5) / 2) // centré sur l'axe libre
  })

  it('ne grossit JAMAIS un petit graphe (scale plafonné à 1), centré', () => {
    const t = fitTransform(200, 100, 1000, 800)
    expect(t.scale).toBe(1)
    expect(t.tx).toBe(400)
    expect(t.ty).toBe(350)
  })

  it('dimensions dégénérées → transform neutre', () => {
    expect(fitTransform(0, 0, 800, 600)).toEqual({ scale: 1, tx: 0, ty: 0 })
  })
})

describe('clampPan', () => {
  it('empêche de perdre le contenu : au moins une bande reste visible', () => {
    // Contenu 1000×1000 à l'échelle 1 dans un viewport 800×600, jeté très loin.
    const far = clampPan({ scale: 1, tx: 99999, ty: -99999 }, 1000, 1000, 800, 600)
    expect(far.tx).toBeLessThanOrEqual(800) // le bord gauche du contenu ne dépasse pas la droite du viewport
    expect(far.ty).toBeGreaterThanOrEqual(48 - 1000) // le bas du contenu ne remonte pas au-dessus du haut
  })

  it('une position déjà raisonnable est inchangée', () => {
    const t = { scale: 1, tx: -100, ty: -50 }
    expect(clampPan(t, 2000, 1000, 800, 600)).toEqual(t)
  })

  it('ne touche jamais au scale', () => {
    expect(clampPan({ scale: 0.4, tx: 0, ty: 0 }, 100, 100, 800, 600).scale).toBe(0.4)
  })
})
