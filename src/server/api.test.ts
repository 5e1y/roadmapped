import { describe, it, expect } from 'vitest'
import { routeApi } from './api'

describe('routeApi', () => {
  it('GET /api/tree', () => {
    expect(routeApi('GET', '/api/tree', null)).toEqual({ type: 'getTree' })
  })

  it('POST /api/tasks → createTask avec body', () => {
    expect(routeApi('POST', '/api/tasks', { title: 'X' })).toEqual({
      type: 'createTask', body: { title: 'X' },
    })
  })

  it('PATCH /api/tasks/:id → patchTask id numérique', () => {
    expect(routeApi('PATCH', '/api/tasks/42', { zone: 'store' })).toEqual({
      type: 'patchTask', id: 42, body: { zone: 'store' },
    })
  })

  it('POST /api/tasks/:id/archive → archiveTask', () => {
    expect(routeApi('POST', '/api/tasks/42/archive', null)).toEqual({ type: 'archiveTask', id: 42 })
  })

  it('DELETE /api/tasks/:id → deleteTask', () => {
    expect(routeApi('DELETE', '/api/tasks/42', null)).toEqual({ type: 'deleteTask', id: 42 })
  })

  it('POST /api/sections → createSection', () => {
    expect(routeApi('POST', '/api/sections', { title: 'S' })).toEqual({
      type: 'createSection', body: { title: 'S' },
    })
  })

  it('PATCH /api/sections/:dir → patchSection (dir décodé)', () => {
    expect(routeApi('PATCH', '/api/sections/01-x', { title: 'X2' })).toEqual({
      type: 'patchSection', dir: '01-x', body: { title: 'X2' },
    })
  })

  it('route inconnue → notFound', () => {
    expect(routeApi('GET', '/api/nope', null)).toEqual({ type: 'notFound' })
    expect(routeApi('POST', '/other', null)).toEqual({ type: 'notFound' })
  })
})

describe('routeApi — durcissement traversal', () => {
  it('PATCH /api/sections/:dir rejette un dir contenant .. ou / (encodé)', () => {
    expect(routeApi('PATCH', '/api/sections/..%2F..%2Fetc', { title: 'X' }).type).toBe('badRequest')
    expect(routeApi('PATCH', '/api/sections/%2e%2e', { title: 'X' }).type).toBe('badRequest')
  })

  it('POST /api/tasks rejette une section qui est un chemin', () => {
    expect(routeApi('POST', '/api/tasks', { section: '../evil', title: 'T' }).type).toBe('badRequest')
    expect(routeApi('POST', '/api/tasks', { section: 'a/b', title: 'T' }).type).toBe('badRequest')
  })
})

describe('routeApi — percent-encoding malformé', () => {
  it('PATCH /api/sections/%ZZ → badRequest (pas d’URIError)', () => {
    expect(routeApi('PATCH', '/api/sections/%ZZ', { title: 'X' }).type).toBe('badRequest')
  })
})

describe('routeApi — roadmaps (phase 2)', () => {
  it('PUT /api/roadmaps → putRoadmaps avec body', () => {
    expect(routeApi('PUT', '/api/roadmaps', { roadmaps: [] })).toEqual({
      type: 'putRoadmaps', body: { roadmaps: [] },
    })
  })
})

describe('routeApi — docs (phase 3)', () => {
  it('GET /api/docs → getDocsTree', () => {
    expect(routeApi('GET', '/api/docs', null)).toEqual({ type: 'getDocsTree' })
  })

  it('GET /api/docs/content?path=... → getDocContent avec path décodé', () => {
    expect(routeApi('GET', '/api/docs/content?path=FORMATS.md', null)).toEqual({
      type: 'getDocContent', path: 'FORMATS.md',
    })
    expect(routeApi('GET', '/api/docs/content?path=plans%2Factive%2Ffoo.md', null)).toEqual({
      type: 'getDocContent', path: 'plans/active/foo.md',
    })
  })

  it('rejette un path manquant → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content', null).type).toBe('badRequest')
  })

  it('rejette un path traversal (.. brut ou encodé) → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content?path=../secret.md', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=%2e%2e/secret.md', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=/etc/secret.md', null).type).toBe('badRequest')
  })

  it('rejette une extension non-.md → badRequest', () => {
    expect(routeApi('GET', '/api/docs/content?path=FORMATS.txt', null).type).toBe('badRequest')
    expect(routeApi('GET', '/api/docs/content?path=FORMATS', null).type).toBe('badRequest')
  })
})
