import { describe, expect, it } from 'vitest'
import { sortAlphabetically } from './reorder'

describe('sortAlphabetically', () => {
  it('ordena por la etiqueta y devuelve los nombres', () => {
    const out = sortAlphabetically([
      { name: 'c.json', label: 'Zeta' },
      { name: 'a.json', label: 'álbum' },
      { name: 'b.json', label: 'alfa' }
    ])
    expect(out).toEqual(['a.json', 'b.json', 'c.json'])
  })

  it('ordena los números por valor', () => {
    const out = sortAlphabetically([
      { name: '10', label: 'Beta 10' },
      { name: '2', label: 'Beta 2' }
    ])
    expect(out).toEqual(['2', '10'])
  })

  it('no modifica la lista original', () => {
    const input = [
      { name: 'b', label: 'B' },
      { name: 'a', label: 'A' }
    ]
    sortAlphabetically(input)
    expect(input[0].name).toBe('b')
  })
})
