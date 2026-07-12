import { describe, it, expect } from 'vitest'
import { zoomAt, fitTransform, boxTransform, centerTransform, clampPan, clampScale, ZOOM_MIN, ZOOM_MAX } from './useZoomPan'

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

describe('boxTransform (fit sur les résultats de recherche)', () => {
  it('centre la boîte dans le viewport', () => {
    // Boîte 100×100 en (200,200) → centre (250,250) ; viewport 800×600.
    const t = boxTransform({ x: 200, y: 200, w: 100, h: 100 }, 800, 600)
    expect(t.tx + 250 * t.scale).toBeCloseTo(400) // le centre X de la boîte tombe au centre du viewport
    expect(t.ty + 250 * t.scale).toBeCloseTo(300)
  })

  it('PEUT grossir un petit sous-ensemble (jusqu’à ZOOM_MAX), contrairement à fit', () => {
    const t = boxTransform({ x: 0, y: 0, w: 40, h: 40 }, 800, 600)
    expect(t.scale).toBeGreaterThan(1)
    expect(t.scale).toBeLessThanOrEqual(ZOOM_MAX)
  })

  it('boîte dégénérée → transform neutre', () => {
    expect(boxTransform({ x: 0, y: 0, w: 0, h: 0 }, 800, 600)).toEqual({ scale: 1, tx: 0, ty: 0 })
  })
})

describe('centerTransform (zoom-sur-nœud du clic, #311)', () => {
  it('place le point du contenu AU CENTRE du viewport, au scale demandé', () => {
    const t = centerTransform({ x: 300, y: 200 }, 1.25, 800, 600)
    expect(t.scale).toBe(1.25)
    expect(t.tx + 300 * t.scale).toBeCloseTo(400) // point.x → centre viewport
    expect(t.ty + 200 * t.scale).toBeCloseTo(300) // point.y → centre viewport
  })

  it('borne le scale à [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(centerTransform({ x: 0, y: 0 }, 99, 800, 600).scale).toBe(ZOOM_MAX)
    expect(centerTransform({ x: 0, y: 0 }, 0.001, 800, 600).scale).toBe(ZOOM_MIN)
  })

  it('reste centré quel que soit le scale (le centrage ne dépend pas du zoom)', () => {
    for (const s of [1.25, 2]) {
      const t = centerTransform({ x: 120, y: 90 }, s, 1000, 400)
      expect(t.tx + 120 * t.scale).toBeCloseTo(500)
      expect(t.ty + 90 * t.scale).toBeCloseTo(200)
    }
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

  it('unbounded (#319, KB) : pan LIBRE — la transform revient telle quelle', () => {
    const far = { scale: 1.4, tx: 99999, ty: -99999 }
    expect(clampPan(far, 1000, 1000, 800, 600, true)).toEqual(far)
  })

  it('unbounded omis/false : comportement borné inchangé (RoadmapGraph)', () => {
    const far = { scale: 1, tx: 99999, ty: -99999 }
    expect(clampPan(far, 1000, 1000, 800, 600, false)).toEqual(clampPan(far, 1000, 1000, 800, 600))
    expect(clampPan(far, 1000, 1000, 800, 600).tx).toBeLessThanOrEqual(800)
  })
})
