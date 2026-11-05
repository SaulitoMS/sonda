import { describe, expect, it } from 'vitest'
import { sortKeysDeep, transformJson } from './jsonBodyTools'

describe('transformJson', () => {
  it('formatea con sangría de 2 espacios', () => {
    expect(transformJson('{"a":1}', 'format')).toBe('{\n  "a": 1\n}')
  })

  it('minifica', () => {
    expect(transformJson('{\n  "a": 1,\n  "b": [1, 2]\n}', 'minify')).toBe('{"a":1,"b":[1,2]}')
  })

  it('ordena las claves y formatea', () => {
    expect(transformJson('{"b":1,"a":2}', 'sort')).toBe('{\n  "a": 2,\n  "b": 1\n}')
  })

  it('devuelve null si no es JSON válido', () => {
    expect(transformJson('{"a":', 'format')).toBeNull()
    expect(transformJson('{"id": {{id}} }', 'minify')).toBeNull()
  })
})

describe('sortKeysDeep', () => {
  it('ordena objetos anidados y respeta el orden de los arrays', () => {
    const sorted = sortKeysDeep({ z: [{ b: 1, a: 2 }, 3], a: { y: 1, x: 2 } })
    expect(JSON.stringify(sorted)).toBe('{"a":{"x":2,"y":1},"z":[{"a":2,"b":1},3]}')
  })
})