import { describe, expect, it } from 'vitest'
import { addBodyExtraction, pathReaches, suggestVariableName } from './extractFromTree'

describe('suggestVariableName', () => {
  it('usa el último campo de la ruta', () => {
    expect(suggestVariableName('data.user_id')).toBe('user_id')
    expect(suggestVariableName('items[0].id')).toBe('id')
    expect(suggestVariableName('tokens[2]')).toBe('tokens')
  })

  it('cae a "valor" si no hay un nombre usable', () => {
    expect(suggestVariableName('[0]')).toBe('valor')
    expect(suggestVariableName('')).toBe('valor')
  })
})

describe('pathReaches', () => {
  const root = { data: { items: [{ id: 7 }] }, 'a.b': 1 }

  it('confirma rutas que sí llegan al valor', () => {
    expect(pathReaches(root, 'data.items[0].id', 7)).toBe(true)
    expect(pathReaches([{ id: 1 }], '[0].id', 1)).toBe(true)
  })

  it('rechaza rutas ambiguas, vacías o que apuntan a otro valor', () => {
    expect(pathReaches(root, 'a.b', 1)).toBe(false)
    expect(pathReaches(root, '', root)).toBe(false)
    expect(pathReaches(root, 'data.items[0].id', 8)).toBe(false)
  })
})

describe('addBodyExtraction', () => {
  it('crea una regla de body con nombre sugerido', () => {
    const next = addBodyExtraction([], 'data.token') ?? []
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      source: 'body',
      path: 'data.token',
      variable: 'token',
      enabled: true
    })
  })

  it('no duplica la misma ruta', () => {
    const first = addBodyExtraction([], 'data.token') ?? []
    expect(addBodyExtraction(first, 'data.token')).toBeNull()
  })

  it('evita repetir el nombre de variable', () => {
    const first = addBodyExtraction([], 'data.token') ?? []
    const second = addBodyExtraction(first, 'other.token') ?? []
    expect(second[1].variable).toBe('token2')
  })
})
