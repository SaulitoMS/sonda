import { describe, expect, it } from 'vitest'
import {
  extractItems,
  nextPageUrl,
  normalizePaginate,
  parseLinkNext,
  setQueryParam,
  PAGINATE_MAX_PAGES
} from './paginate'

describe('normalizePaginate', () => {
  it('usa valores por defecto y recorta límites', () => {
    const o = normalizePaginate({ mode: 'x', maxPages: 9999, delayMs: -5, cursorParam: '' })
    expect(o.mode).toBe('link')
    expect(o.maxPages).toBe(PAGINATE_MAX_PAGES)
    expect(o.delayMs).toBe(0)
    expect(o.cursorParam).toBe('cursor')
    expect(o.pageParam).toBe('page')
  })
})

describe('parseLinkNext', () => {
  it('encuentra rel="next" entre varios links', () => {
    const h = '<https://api.x.com/u?page=1>; rel="prev", <https://api.x.com/u?page=3>; rel="next"'
    expect(parseLinkNext(h, 'https://api.x.com/u?page=2')).toBe('https://api.x.com/u?page=3')
  })

  it('resuelve URLs relativas', () => {
    expect(parseLinkNext('</u?page=2>; rel=next', 'https://api.x.com/u')).toBe(
      'https://api.x.com/u?page=2'
    )
  })

  it('devuelve null sin next', () => {
    expect(parseLinkNext('<https://a.com/1>; rel="prev"', 'https://a.com/2')).toBeNull()
    expect(parseLinkNext(undefined, 'https://a.com')).toBeNull()
  })
})

describe('setQueryParam', () => {
  it('reemplaza o agrega sin tocar lo demás', () => {
    expect(setQueryParam('{{baseUrl}}/u?a=1&page=2', 'page', '3')).toBe('{{baseUrl}}/u?a=1&page=3')
    expect(setQueryParam('{{baseUrl}}/u', 'cursor', 'a b')).toBe('{{baseUrl}}/u?cursor=a%20b')
  })
})

describe('extractItems', () => {
  it('lee por ruta o detecta el primer array', () => {
    expect(extractItems({ data: { items: [1, 2] } }, 'data.items')).toEqual([1, 2])
    expect(extractItems({ total: 2, results: [1, 2] }, '')).toEqual([1, 2])
    expect(extractItems([1], '')).toEqual([1])
    expect(extractItems({ a: 1 }, '')).toEqual([])
  })
})

describe('nextPageUrl', () => {
  const base = normalizePaginate({})
  it('modo cursor', () => {
    const o = normalizePaginate({ mode: 'cursor', cursorPath: 'meta.next' })
    const ctx = { url: 'https://a.com/u', headers: {}, json: { meta: { next: 'abc' } } }
    expect(nextPageUrl(o, ctx)).toBe('https://a.com/u?cursor=abc')
    expect(nextPageUrl(o, { ...ctx, json: { meta: { next: null } } })).toBeNull()
  })

  it('modo página: arranca en 1 si no hay parámetro', () => {
    const o = { ...base, mode: 'page' as const }
    expect(nextPageUrl(o, { url: 'https://a.com/u', headers: {}, json: [] })).toBe(
      'https://a.com/u?page=2'
    )
    expect(nextPageUrl(o, { url: 'https://a.com/u?page=4', headers: {}, json: [] })).toBe(
      'https://a.com/u?page=5'
    )
  })
})
