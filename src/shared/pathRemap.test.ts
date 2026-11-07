import { describe, expect, it } from 'vitest'
import { remapPaths, remapPrefix } from './pathRemap'

describe('remapPrefix', () => {
  const map = remapPrefix('col/vieja/', 'col/nueva/')

  it('cambia solo las rutas que empiezan con el prefijo', () => {
    expect(map('col/vieja/a.json')).toBe('col/nueva/a.json')
    expect(map('col/viejas/a.json')).toBeNull()
    expect(map('otra/vieja/a.json')).toBeNull()
  })
})

describe('remapPaths', () => {
  it('reescribe, mantiene el orden y no deja repetidas', () => {
    const list = ['col/vieja/a.json', 'col/b.json', 'col/nueva/a.json']
    expect(remapPaths(list, remapPrefix('col/vieja/', 'col/nueva/'))).toEqual([
      'col/nueva/a.json',
      'col/b.json'
    ])
  })

  it('si nada cambia devuelve la misma lista', () => {
    const list = ['x/a.json']
    expect(remapPaths(list, remapPrefix('col/vieja/', 'col/nueva/'))).toBe(list)
  })

  it('acepta un mapeo de una sola ruta', () => {
    expect(remapPaths(['a.json', 'b.json'], (p) => (p === 'a.json' ? 'z/a.json' : null))).toEqual([
      'z/a.json',
      'b.json'
    ])
  })
})
