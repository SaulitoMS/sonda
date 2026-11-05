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

describe('evaluateAssertions · tipo y longitud', () => {
  it('isType reconoce string, number, array y object', () => {
    expect(run({ kind: 'body', target: 'name', op: 'isType', expected: 'string' }).passed).toBe(
      true
    )
    expect(run({ kind: 'body', target: 'id', op: 'isType', expected: 'number' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'tags', op: 'isType', expected: 'array' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'owner', op: 'isType', expected: 'object' }).passed).toBe(
      true
    )
  })

  it('isType distingue array de object y null de object', () => {
    expect(run({ kind: 'body', target: 'tags', op: 'isType', expected: 'object' }).passed).toBe(
      false
    )
    const withNull = res({ body: JSON.stringify({ nada: null }) })
    expect(
      run({ kind: 'body', target: 'nada', op: 'isType', expected: 'null' }, withNull).passed
    ).toBe(true)
    expect(
      run({ kind: 'body', target: 'nada', op: 'isType', expected: 'object' }, withNull).passed
    ).toBe(false)
  })

  it('isType ignora mayúsculas y espacios, y explica el fallo', () => {
    expect(run({ kind: 'body', target: 'id', op: 'isType', expected: ' Number ' }).passed).toBe(
      true
    )
    const bad = run({ kind: 'body', target: 'id', op: 'isType', expected: 'string' })
    expect(bad.passed).toBe(false)
    expect(bad.message).toContain('number')
  })

  it('lenEq, lenGt y lenLt sobre arrays', () => {
    expect(run({ kind: 'body', target: 'tags', op: 'lenEq', expected: '2' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'tags', op: 'lenGt', expected: '0' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'tags', op: 'lenLt', expected: '2' }).passed).toBe(false)
  })

  it('la longitud también aplica a strings y a objetos (cantidad de claves)', () => {
    expect(run({ kind: 'body', target: 'name', op: 'lenEq', expected: '5' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'owner', op: 'lenEq', expected: '1' }).passed).toBe(true)
  })

  it('el mensaje de fallo incluye la longitud real', () => {
    const r = run({ kind: 'body', target: 'tags', op: 'lenEq', expected: '9' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('2')
  })

  it('un número no tiene longitud', () => {
    const r = run({ kind: 'body', target: 'id', op: 'lenEq', expected: '1' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no tiene longitud')
  })

  it('un valor esperado no numérico falla con mensaje claro', () => {
    const r = run({ kind: 'body', target: 'tags', op: 'lenGt', expected: 'muchos' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no es un número')
  })

  it('si la ruta no existe, falla con "no existe"', () => {
    const r = run({ kind: 'body', target: 'nada', op: 'lenGt', expected: '0' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no existe')
  })

  it('la descripción de la regla usa el nombre legible del operador', () => {
    const r = run({ kind: 'body', target: 'tags', op: 'lenGt', expected: '0' })
    expect(r.label).toBe('Body tags tiene longitud mayor que 0')
  })
})

describe('evaluateAssertions · in / notIn', () => {
  it('status dentro de una lista', () => {
    expect(run({ kind: 'status', op: 'in', expected: '200,201,204' }).passed).toBe(true)
    expect(run({ kind: 'status', op: 'in', expected: '201, 204' }).passed).toBe(false)
    expect(run({ kind: 'status', op: 'notIn', expected: '500,502' }).passed).toBe(true)
  })

  it('tolera espacios alrededor de cada valor', () => {
    expect(
      run({
        kind: 'header',
        target: 'content-type',
        op: 'in',
        expected: 'text/html , application/json; charset=utf-8'
      }).passed
    ).toBe(true)
  })

  it('compara números y textos del body', () => {
    expect(run({ kind: 'body', target: 'id', op: 'in', expected: '7, 8' }).passed).toBe(true)
    expect(run({ kind: 'body', target: 'name', op: 'in', expected: 'Sonda,Otro' }).passed).toBe(
      true
    )
    expect(run({ kind: 'body', target: 'name', op: 'notIn', expected: 'Sonda' }).passed).toBe(false)
  })

  it('una lista vacía falla con mensaje claro', () => {
    const r = run({ kind: 'status', op: 'in', expected: ' , ' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('vacía')
  })

  it('la descripción usa el nombre legible', () => {
    expect(run({ kind: 'status', op: 'in', expected: '200,201' }).label).toBe(
      'Status es uno de 200,201'
    )
  })
})

describe('evaluateAssertions · JSON Schema', () => {
  const schema = (s: unknown): Partial<Assertion> => ({
    kind: 'schema',
    op: 'validates',
    expected: JSON.stringify(s)
  })

  it('pasa cuando el body cumple el schema', () => {
    const r = run(
      schema({
        type: 'object',
        required: ['id', 'name'],
        properties: { id: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } }
      })
    )
    expect(r.passed).toBe(true)
  })

  it('falla y señala la ruta del campo incorrecto', () => {
    const r = run(schema({ type: 'object', properties: { id: { type: 'string' } } }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('$.id')
  })

  it('falla si falta un campo requerido', () => {
    const r = run(schema({ type: 'object', required: ['telefono'] }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('telefono')
  })

  it('un schema que no es JSON falla con mensaje claro', () => {
    const r = run({ kind: 'schema', op: 'validates', expected: '{ type: ' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no es JSON válido')
  })

  it('un schema que no es un objeto falla con mensaje claro', () => {
    const r = run({ kind: 'schema', op: 'validates', expected: '[1,2]' })
    expect(r.passed).toBe(false)
    expect(r.message).toContain('objeto JSON')
  })

  it('un body que no es JSON falla', () => {
    const r = run(schema({ type: 'object' }), res({ body: 'hola' }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('no es JSON')
  })

  it('la descripción no incluye el schema completo', () => {
    expect(run(schema({ type: 'object' })).label).toBe('Body cumple el JSON Schema')
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
