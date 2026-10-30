import { describe, expect, it } from 'vitest'
import { placeItem, sortByOrder } from './reorder'

describe('placeItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('mueve hacia abajo y hacia arriba', () => {
    expect(placeItem(list, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(placeItem(list, 'd', 'b', 'before')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('inserta un elemento que venía de otra carpeta', () => {
    expect(placeItem(['a', 'b'], 'x', 'b', 'before')).toEqual(['a', 'x', 'b'])
  })

  it('devuelve null si no hay nada que hacer', () => {
    expect(placeItem(list, 'a', 'a', 'after')).toBeNull()
    expect(placeItem(list, 'a', 'zzz', 'after')).toBeNull()
  })
})

describe('sortByOrder', () => {
  const items = ['x.json', 'b.json', 'a.json', 'n.json']
  const id = (s: string): string => s

  it('respeta el orden guardado y deja lo nuevo al final, alfabético', () => {
    expect(sortByOrder(items, ['b.json', 'a.json'], id, id)).toEqual([
      'b.json',
      'a.json',
      'n.json',
      'x.json'
    ])
  })

  it('sin orden guardado (o inválido) queda alfabético', () => {
    expect(sortByOrder(items, undefined, id, id)).toEqual(['a.json', 'b.json', 'n.json', 'x.json'])
    expect(sortByOrder(items, 'no-es-lista', id, id)).toEqual([
      'a.json',
      'b.json',
      'n.json',
      'x.json'
    ])
  })
})