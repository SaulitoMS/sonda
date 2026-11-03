import { describe, expect, it } from 'vitest'
import { bulkToRows, rowsToBulk } from './bulkEdit'

describe('bulkToRows', () => {
  it('separa por el primer ":" y respeta los ":" del valor', () => {
    expect(bulkToRows('Authorization: Bearer abc:def')).toEqual([
      { key: 'Authorization', value: 'Bearer abc:def', enabled: true }
    ])
  })

  it('"//" desactiva la fila, ignora líneas vacías y acepta claves sin valor', () => {
    expect(bulkToRows('// X-Debug: 1\n\nflag')).toEqual([
      { key: 'X-Debug', value: '1', enabled: false },
      { key: 'flag', value: '', enabled: true }
    ])
  })

  it('sin casillas, "//" no desactiva nada', () => {
    expect(bulkToRows('// a: 1', false)).toEqual([{ key: '// a', value: '1', enabled: true }])
  })
})

describe('rowsToBulk', () => {
  it('hace el camino de ida y vuelta', () => {
    const text = 'A: 1\n// B: 2'
    expect(rowsToBulk(bulkToRows(text))).toBe(text)
  })
})