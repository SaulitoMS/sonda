import { describe, expect, it } from 'vitest'
import {
  mergeChange,
  planSync,
  stampFor,
  stableStringify,
  type EndpointStamp,
  type ExistingFile,
  type SpecEndpoint
} from './specSync'
import type { HttpMethod, SavedRequest } from './types'

const ep = (key: string, over: Partial<SavedRequest> = {}): SpecEndpoint => {
  const [method, path] = key.split(' ')
  return {
    key,
    folder: 'pet',
    fileHint: key.toLowerCase(),
    request: {
      name: key,
      method: method as HttpMethod,
      url: `{{baseUrl}}${path}`,
      headers: [],
      body: '',
      ...over
    }
  }
}

const file = (path: string, e: SpecEndpoint, over: Partial<SavedRequest> = {}): ExistingFile => ({
  path,
  request: { ...e.request, ...over }
})

describe('stableStringify', () => {
  it('no depende del orden de las claves', () => {
    expect(stableStringify({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableStringify({ b: { d: 3, c: 2 }, a: 1 })
    )
  })

  it('trata undefined como null', () => {
    expect(stableStringify(undefined)).toBe('null')
  })
})

describe('planSync', () => {
  const e = ep('GET /pet/1')

  it('no reporta nada si la spec no cambió', () => {
    const plan = planSync([e], [file('pet/a.json', e)], { 'pet/a.json': stampFor(e) })
    expect(plan.unchanged).toHaveLength(1)
    expect(plan.added).toHaveLength(0)
    expect(plan.changed).toHaveLength(0)
    expect(plan.removed).toHaveLength(0)
  })

  it('detecta endpoints nuevos', () => {
    const nuevo = ep('POST /pet')
    const plan = planSync([e, nuevo], [file('pet/a.json', e)], { 'pet/a.json': stampFor(e) })
    expect(plan.added.map((x) => x.key)).toEqual(['POST /pet'])
  })

  it('detecta endpoints eliminados, pero solo los que venían de la spec', () => {
    const viejo = ep('DELETE /pet/1')
    const files = [file('pet/a.json', e), file('pet/viejo.json', viejo), file('mio.json', viejo)]
    const stamps = { 'pet/a.json': stampFor(e), 'pet/viejo.json': stampFor(viejo) }
    const plan = planSync([e], files, stamps)
    expect(plan.removed.map((f) => f.path)).toEqual(['pet/viejo.json'])
  })

  it('detecta cambios de URL y de body', () => {
    const nuevo = ep('GET /pet/1', { url: '{{baseUrl}}/pet/1?x=1', body: '{"a":1}' })
    const plan = planSync([nuevo], [file('pet/a.json', e)], { 'pet/a.json': stampFor(e) })
    expect(plan.changed[0].kinds).toEqual(['url', 'body'])
    expect(plan.changed[0].keptUserEdits).toEqual([])
  })

  it('detecta cambios en los schemas', () => {
    const nuevo = ep('GET /pet/1', { responseSchemas: { '200': { type: 'object' } } })
    const plan = planSync([nuevo], [file('pet/a.json', e)], { 'pet/a.json': stampFor(e) })
    expect(plan.changed[0].kinds).toEqual(['responseSchemas'])
  })

  it('marca lo que el usuario también editó', () => {
    const nuevo = ep('GET /pet/1', { url: '{{baseUrl}}/pet/2' })
    const editado = file('pet/a.json', e, { url: '{{baseUrl}}/pet/42' })
    const plan = planSync([nuevo], [editado], { 'pet/a.json': stampFor(e) })
    expect(plan.changed[0].kinds).toEqual(['url'])
    expect(plan.changed[0].keptUserEdits).toEqual(['url'])
  })

  it('reconoce archivos de importaciones antiguas por método y URL', () => {
    const plan = planSync([e], [file('pet/a.json', e)], {})
    expect(plan.unchanged).toHaveLength(1)
    expect(plan.added).toHaveLength(0)
  })

  it('reconoce archivos antiguos que guardaron la URL completa', () => {
    const completo = file('pet/a.json', e, { url: 'https://api.com/pet/1' })
    const plan = planSync([e], [completo], {}, 'https://api.com')
    expect(plan.unchanged).toHaveLength(1)
  })

  it('nunca propone eliminar archivos sin marca', () => {
    const plan = planSync([], [file('pet/a.json', e)], {})
    expect(plan.removed).toHaveLength(0)
  })
})

describe('mergeChange', () => {
  const old = ep('POST /pet', { body: '{"a":1}' })
  const stamp: EndpointStamp = stampFor(old)

  it('reemplaza URL y body si el usuario no los tocó', () => {
    const nuevo = ep('POST /pet', { url: '{{baseUrl}}/pets', body: '{"b":2}' })
    const merged = mergeChange(file('pet/a.json', old), stamp, nuevo)
    expect(merged.url).toBe('{{baseUrl}}/pets')
    expect(merged.body).toBe('{"b":2}')
  })

  it('conserva la URL y el body que el usuario editó', () => {
    const nuevo = ep('POST /pet', { url: '{{baseUrl}}/pets', body: '{"b":2}' })
    const editado = file('pet/a.json', old, { url: '{{baseUrl}}/pet?x=9', body: '{"mio":true}' })
    const merged = mergeChange(editado, stamp, nuevo)
    expect(merged.url).toBe('{{baseUrl}}/pet?x=9')
    expect(merged.body).toBe('{"mio":true}')
  })

  it('conserva aserciones, extracciones y auth, y agrega los headers que faltan', () => {
    const assertions = [
      {
        id: '1',
        enabled: true,
        kind: 'status' as const,
        target: '',
        op: 'eq' as const,
        expected: '200'
      }
    ]
    const nuevo = ep('POST /pet', {
      headers: [{ key: 'Content-Type', value: 'application/json', enabled: true }]
    })
    const propio = file('pet/a.json', old, {
      assertions,
      headers: [{ key: 'X-Mio', value: '1', enabled: true }]
    })
    const merged = mergeChange(propio, stamp, nuevo)
    expect(merged.assertions).toEqual(assertions)
    expect(merged.headers.map((h) => h.key)).toEqual(['X-Mio', 'Content-Type'])
  })

  it('actualiza y quita schemas según la spec', () => {
    const conSchema = file('pet/a.json', old, { requestSchema: { type: 'object' } })
    const nuevo = ep('POST /pet', { responseSchemas: { '200': null } })
    const merged = mergeChange(conSchema, stamp, nuevo)
    expect(merged.requestSchema).toBeUndefined()
    expect(merged.responseSchemas).toEqual({ '200': null })
  })

  it('sin marca (archivo antiguo) no pisa el body', () => {
    const nuevo = ep('POST /pet', { body: '{"b":2}' })
    const merged = mergeChange(file('pet/a.json', old, { body: '{"mio":true}' }), undefined, nuevo)
    expect(merged.body).toBe('{"mio":true}')
  })
})
