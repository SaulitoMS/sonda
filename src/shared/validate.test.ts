import { describe, expect, it } from 'vitest'
import type { ResponseSchemas, SchemaValidation } from './types'
import { validateResponse } from './validate'

const JSON_HEADERS = { 'content-type': 'application/json' }

const pet = {
  type: 'object',
  required: ['id', 'name'],
  properties: {
    id: { type: 'integer' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['available', 'sold'] },
    tags: {
      type: 'array',
      items: { type: 'object', properties: { label: { type: 'string' } } }
    }
  }
}

/** Valida `data` (se serializa a JSON) contra los schemas */
const run = (schemas: ResponseSchemas, data: unknown, status = 200): SchemaValidation | null =>
  validateResponse({
    schemas,
    status,
    method: 'GET',
    headers: JSON_HEADERS,
    body: JSON.stringify(data)
  })

const paths = (v: SchemaValidation | null): string[] => (v?.issues ?? []).map((i) => i.path)

describe('validateResponse: casos básicos', () => {
  it('acepta una respuesta que cumple el schema', () => {
    const r = run({ '200': pet }, { id: 1, name: 'Rex', status: 'sold', tags: [{ label: 'a' }] })
    expect(r?.verdict).toBe('valid')
    expect(r?.matched).toBe('200')
    expect(r?.issues).toEqual([])
  })

  it('devuelve null si la petición no tiene schemas', () => {
    expect(run({}, { id: 1 })).toBeNull()
  })

  it('reporta campos requeridos ausentes con su ruta', () => {
    const r = run({ '200': pet }, { id: 1 })
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues).toEqual([
      { path: '$.name', message: 'Campo requerido ausente', severity: 'error' }
    ])
  })

  it('reporta tipos incorrectos', () => {
    const r = run({ '200': pet }, { id: '5', name: 'Rex' })
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues[0].path).toBe('$.id')
    expect(r?.issues[0].message).toBe('Se esperaba integer pero llegó string')
  })

  it('distingue integer de number', () => {
    const r = run({ '200': pet }, { id: 1.5, name: 'Rex' })
    expect(r?.issues[0].message).toBe('Se esperaba integer pero llegó number')
  })

  it('valida enums', () => {
    const r = run({ '200': pet }, { id: 1, name: 'Rex', status: 'lost' })
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues[0].path).toBe('$.status')
  })

  it('indica la posición dentro de arrays', () => {
    const r = run({ '200': pet }, { id: 1, name: 'Rex', tags: [{ label: 'a' }, { label: 7 }] })
    expect(paths(r)).toEqual(['$.tags[1].label'])
  })

  it('valida la raíz cuando es un array', () => {
    const schemas = { '200': { type: 'array', items: pet } }
    const r = run(schemas, [{ id: 1, name: 'a' }, { name: 'b' }])
    expect(paths(r)).toEqual(['$[1].id'])
  })
})

describe('validateResponse: null y nullable', () => {
  const schema = {
    type: 'object',
    properties: {
      a: { type: 'string', nullable: true },
      b: { type: 'string' },
      c: { type: ['string', 'null'] }
    }
  }

  it('acepta null en campos nullable', () => {
    expect(run({ '200': schema }, { a: null, c: null })?.verdict).toBe('valid')
  })

  it('rechaza null en campos que no lo permiten', () => {
    const r = run({ '200': schema }, { b: null })
    expect(r?.issues[0].message).toBe('Se esperaba string pero llegó null')
  })
})

describe('validateResponse: restricciones', () => {
  it('valida longitud, patrón y formato de strings', () => {
    const schema = {
      type: 'object',
      properties: {
        code: { type: 'string', minLength: 3, maxLength: 5 },
        zip: { type: 'string', pattern: '^\\d{5}$' },
        email: { type: 'string', format: 'email' },
        id: { type: 'string', format: 'uuid' },
        when: { type: 'string', format: 'date-time' },
        other: { type: 'string', format: 'int64' }
      }
    }
    const ok = run(
      { '200': schema },
      {
        code: 'abcd',
        zip: '12345',
        email: 'a@b.co',
        id: '123e4567-e89b-12d3-a456-426614174000',
        when: '2024-05-01T10:00:00Z',
        other: 'lo-que-sea'
      }
    )
    expect(ok?.verdict).toBe('valid')

    const bad = run(
      { '200': schema },
      { code: 'ab', zip: 'abc', email: 'no-es-email', id: 'x', when: 'ayer' }
    )
    expect(paths(bad)).toEqual(['$.code', '$.zip', '$.email', '$.id', '$.when'])
  })

  it('valida mínimos y máximos (incluido el exclusive booleano de OpenAPI 3.0)', () => {
    const schema = {
      type: 'object',
      properties: {
        age: { type: 'integer', minimum: 0, maximum: 120 },
        score: { type: 'number', minimum: 0, exclusiveMinimum: true }
      }
    }
    expect(run({ '200': schema }, { age: 30, score: 0.5 })?.verdict).toBe('valid')
    expect(paths(run({ '200': schema }, { age: 130, score: 0 }))).toEqual(['$.age', '$.score'])
  })

  it('valida tamaño y unicidad de arrays', () => {
    const schema = { type: 'array', minItems: 2, maxItems: 3, uniqueItems: true }
    expect(run({ '200': schema }, [1, 2])?.verdict).toBe('valid')
    expect(run({ '200': schema }, [1])?.verdict).toBe('invalid')
    expect(run({ '200': schema }, [1, 2, 3, 4])?.verdict).toBe('invalid')
    expect(run({ '200': schema }, [1, 1])?.verdict).toBe('invalid')
  })

  it('usa corchetes para claves que no son identificadores', () => {
    const schema = { type: 'object', required: ['content-type'] }
    expect(paths(run({ '200': schema }, {}))).toEqual(['$["content-type"]'])
  })
})

describe('validateResponse: campos no documentados', () => {
  it('los marca como advertencia sin invalidar la respuesta', () => {
    const r = run({ '200': pet }, { id: 1, name: 'Rex', extra: true })
    expect(r?.verdict).toBe('valid')
    expect(r?.issues).toEqual([
      { path: '$.extra', message: 'Campo no documentado en el schema', severity: 'warning' }
    ])
  })

  it('con additionalProperties: false es un error', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false
    }
    const r = run({ '200': schema }, { a: 'x', b: 1 })
    expect(r?.verdict).toBe('invalid')
    expect(paths(r)).toEqual(['$.b'])
  })

  it('con additionalProperties como schema valida los campos extra', () => {
    const schema = { type: 'object', additionalProperties: { type: 'integer' } }
    expect(run({ '200': schema }, { x: 1, y: 2 })?.verdict).toBe('valid')
    expect(paths(run({ '200': schema }, { x: 1, y: 'dos' }))).toEqual(['$.y'])
  })

  it('un objeto sin properties no genera advertencias', () => {
    expect(run({ '200': { type: 'object' } }, { cualquier: 'cosa' })?.issues).toEqual([])
  })
})

describe('validateResponse: allOf / anyOf / oneOf', () => {
  it('allOf combina propiedades sin falsas advertencias', () => {
    const schema = {
      allOf: [
        { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
        { type: 'object', required: ['b'], properties: { b: { type: 'integer' } } }
      ]
    }
    const ok = run({ '200': schema }, { a: 'x', b: 1 })
    expect(ok?.verdict).toBe('valid')
    expect(ok?.issues).toEqual([])

    const bad = run({ '200': schema }, { a: 'x' })
    expect(paths(bad)).toEqual(['$.b'])
  })

  it('anyOf acepta si cumple alguna variante', () => {
    const schema = { anyOf: [{ type: 'string' }, { type: 'integer' }] }
    expect(run({ '200': schema }, 'hola')?.verdict).toBe('valid')
    expect(run({ '200': schema }, 5)?.verdict).toBe('valid')
    expect(run({ '200': schema }, true)?.verdict).toBe('invalid')
  })

  it('oneOf exige exactamente una variante', () => {
    const schema = { oneOf: [{ type: 'number' }, { type: 'integer' }] }
    expect(run({ '200': schema }, 1)?.verdict).toBe('invalid') // coincide con las dos
    expect(run({ '200': schema }, 1.5)?.verdict).toBe('valid')
    expect(run({ '200': schema }, 'x')?.verdict).toBe('invalid')
  })

  it('oneOf con objetos muestra los errores de la variante más cercana', () => {
    const schema = {
      oneOf: [
        { type: 'object', required: ['cat'], properties: { cat: { type: 'string' } } },
        { type: 'object', required: ['dog', 'age'], properties: { dog: { type: 'string' } } }
      ]
    }
    const r = run({ '200': schema }, { cat: 5 })
    expect(r?.verdict).toBe('invalid')
    expect(paths(r)).toEqual(['$', '$.cat'])
  })
})

describe('validateResponse: selección por status', () => {
  const schemas: ResponseSchemas = {
    '200': pet,
    '4XX': { type: 'object', required: ['error'] },
    '204': null,
    default: { type: 'object', required: ['message'] }
  }

  it('usa el status exacto antes que el rango', () => {
    expect(run(schemas, { id: 1, name: 'a' }, 200)?.matched).toBe('200')
  })

  it('usa el rango 4XX', () => {
    const r = run(schemas, { error: 'x' }, 404)
    expect(r?.matched).toBe('4XX')
    expect(r?.verdict).toBe('valid')
  })

  it('cae a default si no hay exacto ni rango', () => {
    const r = run(schemas, {}, 500)
    expect(r?.matched).toBe('default')
    expect(paths(r)).toEqual(['$.message'])
  })

  it('avisa si el status no está documentado y no hay default', () => {
    const r = run({ '200': pet }, {}, 418)
    expect(r?.verdict).toBe('undocumented')
    expect(r?.message).toBe('El status 418 no está documentado en la spec (documentados: 200).')
  })

  it('un status documentado sin schema no se valida', () => {
    const r = validateResponse({ schemas, status: 204, headers: {}, body: '' })
    expect(r?.verdict).toBe('no-schema')
    expect(r?.matched).toBe('204')
  })
})

describe('validateResponse: el body', () => {
  const schemas: ResponseSchemas = { '200': pet }

  it('marca error si el body está vacío', () => {
    const r = validateResponse({ schemas, status: 200, headers: JSON_HEADERS, body: '  ' })
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues[0].message).toBe('La respuesta está vacía pero la spec define un body')
  })

  it('marca error si dice ser JSON pero no lo es', () => {
    const r = validateResponse({ schemas, status: 200, headers: JSON_HEADERS, body: '{oops' })
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues[0].message).toBe('El body no es JSON válido')
  })

  it('omite la validación si no es JSON ni lo declara', () => {
    const r = validateResponse({
      schemas,
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html></html>'
    })
    expect(r?.verdict).toBe('skipped')
  })

  it('valida aunque el content-type sea text/plain si el body es JSON', () => {
    const r = validateResponse({
      schemas,
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ id: 1, name: 'a' })
    })
    expect(r?.verdict).toBe('valid')
  })

  it('omite HEAD', () => {
    const r = validateResponse({ schemas, status: 200, method: 'HEAD', headers: {}, body: '' })
    expect(r?.verdict).toBe('skipped')
  })

  it('no lanza con specs mal formadas', () => {
    const r = run({ '200': { allOf: [null] } as never }, { a: 1 })
    expect(r?.verdict).toBe('skipped')
  })
})

describe('validateResponse: límites', () => {
  it('limita los errores reportados y avisa que hay más', () => {
    const schema = { type: 'array', items: { type: 'integer' } }
    const data = Array.from({ length: 120 }, () => 'x')
    const r = run({ '200': schema }, data)
    expect(r?.verdict).toBe('invalid')
    expect(r?.issues).toHaveLength(50)
    expect(r?.truncated).toBe(true)
  })
})
