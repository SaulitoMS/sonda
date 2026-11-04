import { describe, expect, it } from 'vitest'
import { compileRoutes, matchRoute } from './mock'
import { applyOverrides, normalizeOverrides, overrideError, overrideKey } from './mockOverrides'

const routes = [
  {
    method: 'GET' as const,
    path: '/pet/{petId}',
    status: 200,
    body: '{"a":1}',
    responses: { '200': '{"a":1}', '404': '{}' }
  },
  { method: 'DELETE' as const, path: '/pet/{petId}', status: 200, body: '{}' }
]

describe('mockOverrides', () => {
  const overrides = {
    [overrideKey('GET', '/pet/{petId}')]: { status: 418, body: '{"tea":true}' },
    [overrideKey('DELETE', '/pet/{petId}')]: { status: 204, body: '{"x":1}' }
  }

  it('aplica la respuesta fijada sin mutar las rutas originales', () => {
    const applied = applyOverrides(routes, overrides)
    expect(applied[0].status).toBe(418)
    expect(applied[0].body).toBe('{"tea":true}')
    expect(applied[0].responses?.['418']).toBe('{"tea":true}')
    expect(applied[0].responses?.['404']).toBe('{}')
    expect(routes[0].status).toBe(200)
  })

  it('un 204 no lleva body', () => {
    expect(applyOverrides(routes, overrides)[1].body).toBe('')
  })

  it('la ruta compilada responde con lo fijado', () => {
    const compiled = compileRoutes(applyOverrides(routes, overrides))
    expect(matchRoute(compiled, 'GET', '/pet/7')?.status).toBe(418)
  })

  it('valida status y JSON', () => {
    expect(overrideError({ status: 99, body: '' })).toMatch(/status/)
    expect(overrideError({ status: 200, body: '{x' })).toMatch(/JSON/)
    expect(overrideError({ status: 200, body: '' })).toBeNull()
  })

  it('descarta lo inválido que venga de disco', () => {
    const out = normalizeOverrides({
      'GET /a': { status: 200, body: '{}' },
      'GET /b': { status: 'x' },
      'GET /c': 5
    })
    expect(Object.keys(out)).toEqual(['GET /a'])
  })
})
