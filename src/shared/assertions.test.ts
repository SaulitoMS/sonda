import { describe, expect, it } from 'vitest'
import { classifyResult } from './classify'
import {
  changeKind,
  emptyAssertion,
  evaluateAssertions,
  getByPath,
  parsePath,
  summarizeAssertions
} from './assertions'
import type { Assertion, AssertionResult, SendRequestResult } from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

const res = (patch: Partial<OkResponse> = {}): OkResponse => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ id: 7, name: 'Sonda', tags: ['a', 'b'], owner: { email: 'a@b.com' } }),
  timeMs: 120,
  sizeBytes: 50,
  ...patch
})

const make = (patch: Partial<Assertion>): Assertion => ({
  ...emptyAssertion('status'),
  ...patch
})

const run = (a: Partial<Assertion>, response = res()): AssertionResult =>
  evaluateAssertions([make(a)], response)[0]

describe('parsePath', () => {
  it('separa propiedades e índices', () => {
    expect(parsePath('data.items[0].id')).toEqual(['data', 'items', 0, 'id'])
    expect(parsePath('$.a.b')).toEqual(['a', 'b'])
    expect(parsePath('[2].x')).toEqual([2, 'x'])
  })

  it('una ruta vacía o $ apunta al body completo', () => {
    expect(parsePath('')).toEqual([])
    expect(parsePath('$')).toEqual([])
  })

  it('rechaza rutas mal escritas', () => {
    expect(parsePath('a..b')).toBeNull()
    expect(parsePath('a[x]')).toBeNull()
  })
})

describe('getByPath', () => {
  const data = { a: { b: [{ c: 1 }] }, nada: null }

  it('encuentra valores anidados, incluso null', () => {
    expect(getByPath(data, ['a', 'b', 0, 'c'])).toEqual({ found: true, value: 1 })
    expect(getByPath(data, ['nada'])).toEqual({ found: true, value: null })
  })

  it('marca como no encontrado lo que no existe', () => {
    expect(getByPath(data, ['a', 'x']).found).toBe(false)
    expect(getByPath(data, ['a', 'b', 3]).found).toBe(false)
    expect(getByPath(data, ['nada', 'x']).found).toBe(false)
  })
})

describe('evaluateAssertions · status y tiempo', () => {
  it('status igual', () => {
    expect(run({ kind: 'status', op: 'eq', expected: '200' }).passed).toBe(true)
    const bad = run({ kind: 'status', op: 'eq', expected: '201' })
    expect(bad.passed).toBe(false)
    expect(bad.message).toContain('200')
  })

  it('tiempo menor que', () => {
    expect(run({ kind: 'time', op: 'lt', expected: '500' }).passed).toBe(true)
    expect(run({ kind: 'time', op: 'lt', expected: '100' }).passed).toBe(false)
  })

  it('valor esperado no numérico falla con mensaje claro', () => {
    const r = run({ kind: 'time', op: 'lt', expected: 'rápido' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no es un número')
  })
})

describe('evaluateAssertions · headers', () => {
  it('busca el header sin distinguir mayúsculas', () => {
    expect(
      run({ kind: 'header', target: 'Content-Type', op: 'contains', expected: 'json' }).passed
    ).toBe(true)
  })

  it('exists y notExists', () => {
    expect(run({ kind: 'header', target: 'x-request-id', op: 'exists' }).passed).toBe(false)
    expect(run({ kind: 'header', target: 'x-request-id', op: 'notExists' }).passed).toBe(true)
  })

  it('sin nombre falla', () => {
    expect(run({ kind: 'header', target: '', op: 'exists' }).message).toContain('nombre')
  })
})

describe('evaluateAssertions · body', () => {
  it('existe un campo anidado', () => {
    expect(run({ kind: 'body', target: 'owner.email', op: 'exists' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'owner.phone', op: 'exists' }).passed).toBe(false)
  })

  it('compara números y textos', () => {
    expect(run({ kind: 'body', target: 'id', op: 'eq', expected: '7' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'name', op: 'eq', expected: 'Sonda' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'id', op: 'gt', expected: '5' }).passed).toBe(true)
  })

  it('contiene y regex', () => {
    expect(
      run({ kind: 'body', target: 'owner.email', op: 'matches', expected: '^\\S+@\\S+$' }).passed
    ).toBe(true)
    expect(run({ kind: 'body', target: 'tags', op: 'contains', expected: '"a"' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'name', op: 'matches', expected: '(' }).message).toContain(
      'regex'
    )
  })

  it('indices de arreglos', () => {
    expect(run({ kind: 'body', target: 'tags[1]', op: 'eq', expected: 'b' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'tags[5]', op: 'exists' }).passed).toBe(false)
  })

  it('un body que no es JSON falla en rutas pero permite revisar el texto', () => {
    const text = res({ body: 'hola mundo' })
    expect(run({ kind: 'body', target: 'id', op: 'exists' }, text).message).toContain('no es JSON')
    expect(run({ kind: 'body', target: '', op: 'contains', expected: 'mundo' }, text).passed).toBe(
      true
    )
  })
})

describe('evaluateAssertions · general', () => {
  it('omite las desactivadas y conserva el orden', () => {
    const list = [
      make({ id: 'a', expected: '200' }),
      make({ id: 'b', enabled: false }),
      make({ id: 'c', expected: '500' })
    ]
    const results = evaluateAssertions(list, res())
    expect(results.map((r) => r.id)).toEqual(['a', 'c'])
    expect(summarizeAssertions(results)).toEqual({ passed: 1, total: 2 })
  })

  it('sin aserciones devuelve una lista vacía', () => {
    expect(evaluateAssertions(undefined, res())).toEqual([])
    expect(evaluateAssertions([], res())).toEqual([])
  })

  it('changeKind conserva id y estado pero reinicia lo demás', () => {
    const a = make({ id: 'x', enabled: false, kind: 'body', target: 'id', op: 'gt', expected: '3' })
    expect(changeKind(a, 'time')).toMatchObject({
      id: 'x',
      enabled: false,
      kind: 'time',
      target: '',
      op: 'lt'
    })
  })
})

describe('classifyResult con aserciones', () => {
  const failing = evaluateAssertions([make({ expected: '404' })], res())
  const passing404 = evaluateAssertions([make({ expected: '404' })], res({ status: 404 }))

  it('una aserción fallida marca fail y la nombra', () => {
    const v = classifyResult(res(), null, failing)
    expect(v.status).toBe('fail')
    expect(v.detail).toContain('1 aserción fallida')
    expect(v.detail).toContain('Status es igual a 404')
  })

  it('si el usuario espera un 404 y se cumple, pasa aunque el status sea >= 400', () => {
    expect(classifyResult(res({ status: 404 }), null, passing404)).toEqual({
      status: 'pass',
      detail: ''
    })
  })

  it('sin aserciones se mantiene el criterio por status', () => {
    expect(classifyResult(res({ status: 404 }), null).status).toBe('fail')
  })
})