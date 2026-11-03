import { describe, expect, it } from 'vitest'
import { looksLikeInsomnia, parseInsomnia } from './insomnia'
import type { PostmanEndpoint } from './postman'

const sample = {
  _type: 'export',
  __export_format: 4,
  resources: [
    { _id: 'wrk_1', _type: 'workspace', name: 'Mi API' },
    {
      _id: 'env_1',
      _type: 'environment',
      parentId: 'wrk_1',
      data: { baseUrl: 'https://x.io', n: 3, nested: { a: 1 } }
    },
    { _id: 'env_2', _type: 'environment', parentId: 'env_1', name: 'Prod', data: {} },
    {
      _id: 'fld_1',
      _type: 'request_group',
      parentId: 'wrk_1',
      name: 'Users',
      metaSortKey: 1,
      authentication: { type: 'bearer', token: '{{ _.tok }}' }
    },
    {
      _id: 'req_1',
      _type: 'request',
      parentId: 'fld_1',
      name: 'Create',
      method: 'POST',
      url: '{{ _.baseUrl }}/users',
      parameters: [
        { name: 'a', value: '1' },
        { name: 'b', value: '2', disabled: true }
      ],
      headers: [{ name: 'X-A', value: '1' }],
      body: { mimeType: 'application/json', text: '{"a":1}' },
      metaSortKey: 2
    },
    {
      _id: 'req_2',
      _type: 'request',
      parentId: 'wrk_1',
      name: 'Login',
      method: 'POST',
      url: '{{ _.baseUrl }}/login',
      body: { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'u', value: 'x' }] },
      authentication: { type: 'none' }
    }
  ]
}

describe('looksLikeInsomnia', () => {
  it('detecta el formato v4', () => {
    expect(looksLikeInsomnia(sample)).toBe(true)
    expect(looksLikeInsomnia({ info: {}, item: [] })).toBe(false)
    expect(looksLikeInsomnia(null)).toBe(false)
  })
})

describe('parseInsomnia', () => {
  const parsed = parseInsomnia(sample)
  const byName = (n: string): PostmanEndpoint => parsed.requests.find((r) => r.request.name === n)!

  it('usa el nombre del workspace', () => {
    expect(parsed.name).toBe('Mi API')
  })

  it('convierte {{ _.var }} y agrega solo los query params activos', () => {
    expect(byName('Create').request.url).toBe('{{baseUrl}}/users?a=1')
  })

  it('respeta carpetas y hereda la auth de la carpeta', () => {
    const create = byName('Create')
    expect(create.folder).toBe('Users')
    expect(create.request.auth?.type).toBe('bearer')
    expect(create.request.auth?.token).toBe('{{tok}}')
  })

  it('"none" corta la herencia y no deja auth', () => {
    expect(byName('Login').request.auth).toBeUndefined()
  })

  it('agrega Content-Type según el tipo de body', () => {
    const headers = byName('Create').request.headers
    expect(headers.map((h) => h.key)).toEqual(['X-A', 'Content-Type'])
  })

  it('mapea urlencoded a bodyForm', () => {
    expect(byName('Login').request.bodyForm?.mode).toBe('urlencoded')
    expect(byName('Login').request.bodyForm?.fields[0].key).toBe('u')
  })

  it('importa solo variables simples del entorno base y avisa de los sub-entornos', () => {
    expect(parsed.variables).toEqual([
      { key: 'baseUrl', value: 'https://x.io' },
      { key: 'n', value: '3' }
    ])
    expect(parsed.warnings.some((w) => w.includes('sub-entorno'))).toBe(true)
  })

  it('falla con un archivo que no es de Insomnia', () => {
    expect(() => parseInsomnia({ foo: 1 })).toThrow()
  })
})
