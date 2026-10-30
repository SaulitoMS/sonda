import { describe, expect, it } from 'vitest'
import { buildFullExport, extensionFor, mimeFor, suggestFileName } from './exportResponse'

describe('extensionFor', () => {
  it('usa el Content-Type', () => {
    expect(extensionFor('application/json; charset=utf-8', '')).toBe('json')
    expect(extensionFor('text/html', '')).toBe('html')
    expect(extensionFor('application/xml', '')).toBe('xml')
    expect(extensionFor('text/csv', '')).toBe('csv')
    expect(extensionFor('text/plain', '')).toBe('txt')
  })

  it('detecta JSON cuando el Content-Type no ayuda', () => {
    expect(extensionFor(undefined, '{"a":1}')).toBe('json')
    expect(extensionFor('application/octet-stream', 'hola')).toBe('txt')
  })
})

describe('mimeFor', () => {
  it('mapea extensiones', () => {
    expect(mimeFor('json')).toBe('application/json')
    expect(mimeFor('xyz')).toBe('text/plain')
  })
})

describe('suggestFileName', () => {
  const now = new Date(2026, 9, 29, 15, 30)

  it('arma el nombre con método, ruta y fecha', () => {
    expect(suggestFileName('GET', '{{baseUrl}}/pet/1?x=2', 'json', now)).toBe(
      'get-pet-1-20261029-1530.json'
    )
    expect(suggestFileName('POST', 'https://api.com/users', 'txt', now)).toBe(
      'post-users-20261029-1530.txt'
    )
  })

  it('usa "respuesta" si no hay ruta', () => {
    expect(suggestFileName('GET', 'https://api.com', 'json', now)).toBe(
      'get-respuesta-20261029-1530.json'
    )
  })
})

describe('buildFullExport', () => {
  const res = {
    ok: true as const,
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: '{"id":1}',
    timeMs: 12,
    sizeBytes: 8
  }

  it('incluye la petición y parsea el body JSON', () => {
    const out = JSON.parse(buildFullExport({ method: 'GET', url: '{{baseUrl}}/x' }, res))
    expect(out.request).toEqual({ method: 'GET', url: '{{baseUrl}}/x' })
    expect(out.response.body).toEqual({ id: 1 })
    expect(out.response.status).toBe(200)
  })

  it('deja el body como texto si no es JSON', () => {
    const out = JSON.parse(buildFullExport({ method: 'GET', url: 'u' }, { ...res, body: 'hola' }))
    expect(out.response.body).toBe('hola')
  })
})