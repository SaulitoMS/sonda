import { describe, expect, it } from 'vitest'
import { looksLikeBruno, parseBruno } from './bruno'
import type { PostmanEndpoint } from './postman'

const sample = {
  name: 'Mi API',
  version: '1',
  items: [
    {
      type: 'http-request',
      name: 'Listar',
      seq: 2,
      request: {
        method: 'GET',
        url: 'https://x.io/users/:id',
        params: [
          { name: 'id', value: '7', type: 'path', enabled: true },
          { name: 'a', value: '1', type: 'query', enabled: true },
          { name: 'b', value: '2', type: 'query', enabled: false }
        ],
        headers: [
          { name: 'X-A', value: '1', enabled: true },
          { name: 'Content-Length', value: '9', enabled: true }
        ],
        auth: { mode: 'bearer', bearer: { token: '{{token}}' } },
        body: { mode: 'none' },
        script: { req: 'bru.setVar("a", 1)' },
        docs: 'Lista usuarios'
      }
    },
    {
      type: 'folder',
      name: 'Users',
      items: [
        {
          type: 'http-request',
          name: 'Crear',
          seq: 1,
          request: {
            method: 'POST',
            url: '{{baseUrl}}/users',
            headers: [],
            auth: { mode: 'inherit' },
            body: { mode: 'json', json: '{"a":1}' }
          }
        },
        {
          type: 'folder',
          name: 'Admin',
          items: [
            {
              type: 'http-request',
              name: 'Login',
              seq: 1,
              request: {
                method: 'POST',
                url: '{{baseUrl}}/login',
                headers: [],
                auth: { mode: 'oauth2' },
                body: {
                  mode: 'formUrlEncoded',
                  formUrlEncoded: [{ name: 'u', value: 'x', enabled: true }]
                }
              }
            },
            {
              type: 'graphql-request',
              name: 'Consulta',
              seq: 2,
              request: {
                method: 'POST',
                url: '{{baseUrl}}/graphql',
                headers: [],
                body: { mode: 'graphql', graphql: { query: '{ me { id } }', variables: '{"a":1}' } }
              }
            }
          ]
        }
      ]
    }
  ],
  environments: [
    {
      name: 'dev',
      variables: [
        { name: 'baseUrl', value: 'https://x.io', enabled: true },
        { name: 'clave', value: 's', secret: true, enabled: true }
      ]
    },
    { name: 'prod', variables: [] }
  ]
}

const find = (list: PostmanEndpoint[], name: string): PostmanEndpoint => {
  const found = list.find((e) => e.request.name === name)
  if (!found) throw new Error(`No se encontró "${name}"`)
  return found
}

describe('looksLikeBruno', () => {
  it('reconoce un export de Bruno', () => {
    expect(looksLikeBruno(sample)).toBe(true)
  })

  it('descarta Postman, Hoppscotch y objetos sin versión', () => {
    expect(looksLikeBruno({ info: {}, item: [] })).toBe(false)
    expect(looksLikeBruno({ name: 'x', v: 1, requests: [] })).toBe(false)
    expect(looksLikeBruno({ name: 'x', items: [{ type: 'http-request' }] })).toBe(false)
    expect(looksLikeBruno([])).toBe(false)
  })
})

describe('parseBruno', () => {
  const parsed = parseBruno(sample)

  it('usa el nombre de la colección', () => {
    expect(parsed.name).toBe('Mi API')
  })

  it('sustituye params de path y agrega los de query activos', () => {
    expect(find(parsed.requests, 'Listar').request.url).toBe('https://x.io/users/7?a=1')
  })

  it('quita Content-Length y conserva la descripción', () => {
    const { request } = find(parsed.requests, 'Listar')
    expect(request.headers).toEqual([{ key: 'X-A', value: '1', enabled: true }])
    expect(request.description).toBe('Lista usuarios')
  })

  it('mapea Bearer y deja heredar con inherit', () => {
    expect(find(parsed.requests, 'Listar').request.auth?.token).toBe('{{token}}')
    expect(find(parsed.requests, 'Crear').request.auth).toBeUndefined()
  })

  it('agrega Content-Type al body JSON', () => {
    const { request } = find(parsed.requests, 'Crear')
    expect(request.body).toBe('{"a":1}')
    expect(request.headers).toEqual([
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ])
  })

  it('respeta la carpeta de primer nivel y aplana las más profundas', () => {
    expect(find(parsed.requests, 'Listar').folder).toBe('')
    expect(find(parsed.requests, 'Crear').folder).toBe('Users')
    expect(find(parsed.requests, 'Admin / Login').folder).toBe('Users')
  })

  it('convierte urlencoded en bodyForm', () => {
    const { request } = find(parsed.requests, 'Admin / Login')
    expect(request.bodyForm?.mode).toBe('urlencoded')
    expect(request.bodyForm?.fields[0]).toEqual({
      key: 'u',
      value: 'x',
      type: 'text',
      enabled: true
    })
  })

  it('convierte GraphQL en un body JSON con query y variables', () => {
    const { request } = find(parsed.requests, 'Admin / Consulta')
    expect(JSON.parse(request.body)).toEqual({ query: '{ me { id } }', variables: { a: 1 } })
  })

  it('importa el primer entorno sin los secretos', () => {
    expect(parsed.variables).toEqual([{ key: 'baseUrl', value: 'https://x.io' }])
  })

  it('avisa de lo que no pudo importar', () => {
    const text = parsed.warnings.join('\n')
    expect(text).toContain('oauth2')
    expect(text).toContain('2 entornos')
    expect(text).toContain('secretas')
    expect(text).toContain('scripts o tests')
  })

  it('rechaza un archivo que no es de Bruno', () => {
    expect(() => parseBruno({ nope: true })).toThrow('Bruno')
  })
})
