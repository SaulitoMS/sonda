import { describe, expect, it } from 'vitest'
import { looksLikeHoppscotch, parseHoppscotch } from './hoppscotch'
import type { PostmanEndpoint } from './postman'

const sample = {
  v: 6,
  name: 'Mi API',
  auth: { authType: 'bearer', authActive: true, token: '<<token>>' },
  headers: [],
  variables: [{ key: 'baseUrl', initialValue: 'https://x.io', currentValue: '', secret: false }],
  requests: [
    {
      v: '16',
      name: 'Listar',
      method: 'GET',
      endpoint: '<<baseUrl>>/users',
      params: [
        { key: 'a', value: '1', active: true },
        { key: 'b', value: '2', active: false }
      ],
      headers: [{ key: 'X-A', value: '1', active: true }],
      auth: { authType: 'inherit', authActive: true },
      body: { contentType: null, body: null },
      preRequestScript: '',
      testScript: ''
    }
  ],
  folders: [
    {
      v: 6,
      name: 'Users',
      auth: { authType: 'none', authActive: true },
      headers: [],
      requests: [
        {
          v: '16',
          name: 'Crear',
          method: 'POST',
          endpoint: '<<baseUrl>>/users',
          params: [],
          headers: [],
          auth: { authType: 'inherit', authActive: true },
          body: { contentType: 'application/json', body: '{"a":1}' },
          testScript: 'pw.expect(1).toBe(1)'
        },
        {
          v: '16',
          name: 'Login',
          method: 'POST',
          endpoint: '<<baseUrl>>/login',
          params: [],
          headers: [],
          auth: {
            authType: 'api-key',
            authActive: true,
            key: 'k',
            value: 'v',
            addTo: 'QUERY_PARAMS'
          },
          body: {
            contentType: 'application/x-www-form-urlencoded',
            body: 'user: ana\n//off: 1'
          }
        }
      ],
      folders: [
        {
          v: 6,
          name: 'Deep',
          requests: [{ name: 'Profundo', method: 'PUT', endpoint: '/d', body: null }],
          folders: []
        }
      ]
    }
  ]
}

describe('looksLikeHoppscotch', () => {
  it('reconoce una colección y un arreglo de colecciones', () => {
    expect(looksLikeHoppscotch(sample)).toBe(true)
    expect(looksLikeHoppscotch([sample, sample])).toBe(true)
  })

  it('no confunde Postman ni Insomnia', () => {
    expect(looksLikeHoppscotch({ info: { name: 'x' }, item: [] })).toBe(false)
    expect(looksLikeHoppscotch({ _type: 'export', resources: [] })).toBe(false)
    expect(looksLikeHoppscotch({ name: 'v1', requests: [{ url: 'http://x' }] })).toBe(false)
    expect(looksLikeHoppscotch(null)).toBe(false)
  })
})

describe('parseHoppscotch', () => {
  const parsed = parseHoppscotch(sample)
  const byName = (n: string): PostmanEndpoint => parsed.requests.find((r) => r.request.name === n)!

  it('convierte variables y agrega solo los params activos', () => {
    expect(byName('Listar').request.url).toBe('{{baseUrl}}/users?a=1')
    expect(parsed.variables).toEqual([{ key: 'baseUrl', value: 'https://x.io' }])
  })

  it('hereda la auth de la colección y respeta none en la carpeta', () => {
    expect(byName('Listar').request.auth).toMatchObject({ type: 'bearer', token: '{{token}}' })
    expect(byName('Crear').request.auth).toBeUndefined()
  })

  it('importa api-key en query y body urlencoded', () => {
    const login = byName('Login').request
    expect(login.auth).toMatchObject({ type: 'apikey', keyName: 'k', keyIn: 'query' })
    expect(login.bodyForm?.mode).toBe('urlencoded')
    expect(login.bodyForm?.fields).toEqual([
      { key: 'user', value: 'ana', type: 'text', enabled: true },
      { key: 'off', value: '1', type: 'text', enabled: false }
    ])
  })

  it('agrega Content-Type al body JSON y avisa de los scripts', () => {
    expect(byName('Crear').request.headers).toContainEqual({
      key: 'Content-Type',
      value: 'application/json',
      enabled: true
    })
    expect(parsed.warnings.some((w) => w.includes('scripts'))).toBe(true)
  })

  it('aplana carpetas más profundas en el nombre', () => {
    const deep = parsed.requests.find((r) => r.request.name === 'Deep / Profundo')!
    expect(deep.folder).toBe('Users')
    expect(deep.request.method).toBe('PUT')
  })

  it('con varias colecciones, cada una queda como carpeta', () => {
    const many = parseHoppscotch([sample, { ...sample, name: 'Otra' }])
    expect(many.name).toBe('Hoppscotch')
    expect(new Set(many.requests.map((r) => r.folder))).toEqual(new Set(['Mi API', 'Otra']))
  })

  it('rechaza lo que no es Hoppscotch', () => {
    expect(() => parseHoppscotch({ foo: 1 })).toThrow()
  })
})
