import { describe, expect, it } from 'vitest'
import { buildMockResponses, parseForcedStatus, resolveMockResponse } from './mock'

describe('parseForcedStatus', () => {
  it('sin header no fuerza nada', () => {
    expect(parseForcedStatus(undefined)).toEqual({ kind: 'none' })
    expect(parseForcedStatus('  ')).toEqual({ kind: 'none' })
  })
  it('acepta enteros de 100 a 599', () => {
    expect(parseForcedStatus('404')).toEqual({ kind: 'ok', status: 404 })
    expect(parseForcedStatus(['503'])).toEqual({ kind: 'ok', status: 503 })
  })
  it('rechaza lo demás', () => {
    for (const v of ['abc', '99', '600', '40.4']) {
      expect(parseForcedStatus(v)).toEqual({ kind: 'invalid' })
    }
  })
})

describe('resolveMockResponse', () => {
  const responses = buildMockResponses({
    '200': { type: 'object', properties: { id: { type: 'integer' } } },
    '404': { type: 'object', properties: { error: { type: 'string' } } },
    '4XX': { type: 'object', properties: { generic: { type: 'boolean' } } },
    '204': null
  })

  it('usa el status exacto', () => {
    const r = resolveMockResponse({ responses }, 404)
    expect(r.documented).toBe(true)
    expect(JSON.parse(r.body)).toEqual({ error: 'string' })
  })
  it('cae al rango si no hay exacto', () => {
    const r = resolveMockResponse({ responses }, 422)
    expect(r.status).toBe(422)
    expect(JSON.parse(r.body)).toEqual({ generic: true })
  })
  it('usa default si existe', () => {
    const r = resolveMockResponse(
      { responses: buildMockResponses({ default: { type: 'string' } }) },
      500
    )
    expect(r.documented).toBe(true)
    expect(JSON.parse(r.body)).toBe('string')
  })
  it('responde igual si no está documentado', () => {
    const r = resolveMockResponse({ responses }, 503)
    expect(r.documented).toBe(false)
    expect(r.status).toBe(503)
    expect(JSON.parse(r.body).status).toBe(503)
  })
  it('204 y 304 no llevan body', () => {
    expect(resolveMockResponse({ responses }, 204).body).toBe('')
    expect(resolveMockResponse({}, 304).body).toBe('')
  })
})
