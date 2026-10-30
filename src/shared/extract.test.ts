import { describe, expect, it } from 'vitest'
import { applyExtractions, emptyExtraction, evaluateExtractions } from './extract'
import type { Environment, Extraction, SendRequestResult } from './types'

type Ok = Extract<SendRequestResult, { ok: true }>

const response = (body: unknown, headers: Record<string, string> = {}): Ok => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers,
  body: typeof body === 'string' ? body : JSON.stringify(body),
  timeMs: 10,
  sizeBytes: 10
})

const rule = (p: Partial<Extraction>): Extraction => ({ ...emptyExtraction(), ...p })

describe('evaluateExtractions', () => {
  it('no hace nada sin reglas', () => {
    expect(evaluateExtractions(undefined, response({}))).toEqual([])
    expect(evaluateExtractions([], response({}))).toEqual([])
  })

  it('extrae un valor del body por ruta', () => {
    const [r] = evaluateExtractions(
      [rule({ path: 'data.token', variable: 'token' })],
      response({ data: { token: 'abc' } })
    )
    expect(r).toMatchObject({ ok: true, variable: 'token', value: 'abc' })
  })

  it('convierte números, booleanos y objetos a texto', () => {
    const res = response({ id: 7, ok: true, user: { name: 'Ana' }, nada: null })
    const out = evaluateExtractions(
      [
        rule({ path: 'id', variable: 'a' }),
        rule({ path: 'ok', variable: 'b' }),
        rule({ path: 'user', variable: 'c' }),
        rule({ path: 'nada', variable: 'd' })
      ],
      res
    )
    expect(out.map((r) => r.value)).toEqual(['7', 'true', '{"name":"Ana"}', 'null'])
  })

  it('soporta índices de arreglo', () => {
    const [r] = evaluateExtractions(
      [rule({ path: 'items[1].id', variable: 'second' })],
      response({ items: [{ id: 1 }, { id: 2 }] })
    )
    expect(r.value).toBe('2')
  })

  it('falla con mensaje si la ruta no existe', () => {
    const [r] = evaluateExtractions(
      [rule({ path: 'data.token', variable: 'token' })],
      response({ data: {} })
    )
    expect(r.ok).toBe(false)
    expect(r.message).toContain('no existe')
  })

  it('falla si el body no es JSON y se pide una ruta', () => {
    const [r] = evaluateExtractions([rule({ path: 'a', variable: 'x' })], response('texto plano'))
    expect(r).toMatchObject({ ok: false, message: 'el body no es JSON' })
  })

  it('con ruta vacía toma el body completo, aunque no sea JSON', () => {
    const [r] = evaluateExtractions([rule({ path: '', variable: 'raw' })], response('hola'))
    expect(r).toMatchObject({ ok: true, value: 'hola' })
  })

  it('extrae headers sin distinguir mayúsculas', () => {
    const [r] = evaluateExtractions(
      [rule({ source: 'header', path: 'location', variable: 'loc' })],
      response({}, { Location: '/users/9' })
    )
    expect(r).toMatchObject({ ok: true, value: '/users/9' })
  })

  it('falla si el header no existe', () => {
    const [r] = evaluateExtractions(
      [rule({ source: 'header', path: 'x-nope', variable: 'v' })],
      response({})
    )
    expect(r.ok).toBe(false)
  })

  it('valida el nombre de la variable', () => {
    const out = evaluateExtractions(
      [rule({ path: 'a', variable: '' }), rule({ path: 'a', variable: 'con espacio' })],
      response({ a: 1 })
    )
    expect(out.every((r) => !r.ok)).toBe(true)
  })

  it('omite las reglas desactivadas y conserva el orden', () => {
    const out = evaluateExtractions(
      [
        rule({ path: 'a', variable: 'va' }),
        rule({ path: 'b', variable: 'vb', enabled: false }),
        rule({ path: 'c', variable: 'vc' })
      ],
      response({ a: 1, b: 2, c: 3 })
    )
    expect(out.map((r) => r.variable)).toEqual(['va', 'vc'])
  })
})

const env = (variables: Environment['variables']): Environment => ({
  id: 'e1',
  name: 'Dev',
  variables
})

const ok = (
  variable: string,
  value: string,
  secret = false
): Parameters<typeof applyExtractions>[1][number] => ({
  id: variable,
  variable,
  ok: true,
  value,
  secret,
  message: ''
})

describe('applyExtractions', () => {
  it('crea la variable si no existe, respetando secret', () => {
    const { env: next, changed } = applyExtractions(env([]), [ok('token', 'abc', true)])
    expect(changed).toBe(true)
    expect(next.variables).toHaveLength(1)
    expect(next.variables[0]).toMatchObject({
      key: 'token',
      value: 'abc',
      secret: true,
      enabled: true
    })
  })

  it('actualiza una variable existente sin cambiar su secret', () => {
    const start = env([{ id: 'v1', key: 'token', value: 'viejo', secret: true, enabled: true }])
    const { env: next } = applyExtractions(start, [ok('token', 'nuevo', false)])
    expect(next.variables[0]).toMatchObject({ id: 'v1', value: 'nuevo', secret: true })
  })

  it('reactiva una variable desactivada', () => {
    const start = env([{ id: 'v1', key: 'id', value: '1', secret: false, enabled: false }])
    const { env: next, changed } = applyExtractions(start, [ok('id', '1')])
    expect(changed).toBe(true)
    expect(next.variables[0].enabled).toBe(true)
  })

  it('devuelve el mismo entorno si nada cambió', () => {
    const start = env([{ id: 'v1', key: 'id', value: '1', secret: false, enabled: true }])
    const { env: next, changed } = applyExtractions(start, [ok('id', '1')])
    expect(changed).toBe(false)
    expect(next).toBe(start)
  })

  it('ignora los resultados fallidos', () => {
    const start = env([])
    const { changed } = applyExtractions(start, [
      { id: 'x', variable: 'x', ok: false, secret: false, message: 'no existe' }
    ])
    expect(changed).toBe(false)
  })
})
