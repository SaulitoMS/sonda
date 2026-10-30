import { describe, expect, it } from 'vitest'
import { nextActiveAfterClose, tabLabel } from './tabs'

describe('tabLabel', () => {
  it('prefiere el nombre guardado', () => {
    expect(tabLabel({ name: ' Crear mascota ', url: 'https://x.com/pet' })).toBe('Crear mascota')
  })

  it('quita {{baseUrl}} y el host', () => {
    expect(tabLabel({ name: '', url: '{{baseUrl}}/pet/1' })).toBe('/pet/1')
    expect(tabLabel({ name: '', url: 'https://api.com/users?x=1' })).toBe('/users?x=1')
  })

  it('usa la URL completa si no queda ruta', () => {
    expect(tabLabel({ name: '', url: 'https://api.com' })).toBe('https://api.com')
  })

  it('muestra un texto por defecto si está vacía', () => {
    expect(tabLabel({ name: '', url: '  ' })).toBe('Nueva petición')
  })
})

describe('nextActiveAfterClose', () => {
  const ids = ['a', 'b', 'c']

  it('no cambia la activa al cerrar otra', () => {
    expect(nextActiveAfterClose(ids, 'a', 'b')).toBe('b')
  })

  it('al cerrar la activa elige la que ocupa su lugar', () => {
    expect(nextActiveAfterClose(ids, 'a', 'a')).toBe('b')
    expect(nextActiveAfterClose(ids, 'b', 'b')).toBe('c')
  })

  it('si era la última, elige la anterior', () => {
    expect(nextActiveAfterClose(ids, 'c', 'c')).toBe('b')
  })

  it('devuelve null si no queda ninguna', () => {
    expect(nextActiveAfterClose(['a'], 'a', 'a')).toBeNull()
  })
})