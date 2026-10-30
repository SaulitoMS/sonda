import { describe, expect, it } from 'vitest'
import { appendQuery, applyQuery, parseQuery } from './params'

describe('parseQuery', () => {
  it('lee pares clave=valor', () => {
    expect(parseQuery('https://a.com/x?page=2&sort=name')).toEqual([
      { key: 'page', value: '2' },
      { key: 'sort', value: 'name' }
    ])
  })

  it('devuelve vacío sin query', () => {
    expect(parseQuery('https://a.com/x')).toEqual([])
    expect(parseQuery('https://a.com/x?')).toEqual([])
  })

  it('conserva {{variables}} y no decodifica', () => {
    expect(parseQuery('{{baseUrl}}/x?id={{id}}&q=a%20b')).toEqual([
      { key: 'id', value: '{{id}}' },
      { key: 'q', value: 'a%20b' }
    ])
  })

  it('el valor puede contener "=" y las claves sin valor se aceptan', () => {
    expect(parseQuery('/x?token=a=b&flag')).toEqual([
      { key: 'token', value: 'a=b' },
      { key: 'flag', value: '' }
    ])
  })

  it('ignora el fragmento', () => {
    expect(parseQuery('/x?a=1#top')).toEqual([{ key: 'a', value: '1' }])
  })
})

describe('applyQuery', () => {
  it('reemplaza la query y conserva base y fragmento', () => {
    expect(applyQuery('https://a.com/x?old=1#top', [{ key: 'new', value: '2' }])).toBe(
      'https://a.com/x?new=2#top'
    )
  })

  it('quita la query si no hay parámetros', () => {
    expect(applyQuery('https://a.com/x?a=1', [])).toBe('https://a.com/x')
    expect(applyQuery('https://a.com/x?a=1', [{ key: '', value: '' }])).toBe('https://a.com/x')
  })

  it('escapa & y # para no romper la URL', () => {
    expect(applyQuery('/x', [{ key: 'q', value: 'a&b#c' }])).toBe('/x?q=a%26b%23c')
  })

  it('hace ida y vuelta sin alterar la URL', () => {
    const url = '{{baseUrl}}/users?id={{id}}&tag=a%20b'
    expect(applyQuery(url, parseQuery(url))).toBe(url)
  })
})

describe('appendQuery', () => {
  it('agrega a una URL sin query', () => {
    expect(appendQuery('https://a.com/x', [{ key: 'api_key', value: 'abc' }])).toBe(
      'https://a.com/x?api_key=abc'
    )
  })

  it('conserva los parámetros existentes y el fragmento', () => {
    expect(appendQuery('https://a.com/x?a=1#top', [{ key: 'k', value: 'v' }])).toBe(
      'https://a.com/x?a=1&k=v#top'
    )
  })

  it('codifica el valor agregado', () => {
    expect(appendQuery('/x', [{ key: 'k', value: 'a b&c' }])).toBe('/x?k=a%20b%26c')
  })

  it('no codifica las {{variables}}', () => {
    expect(appendQuery('/x', [{ key: 'api_key', value: '{{apiKey}}' }])).toBe(
      '/x?api_key={{apiKey}}'
    )
  })

  it('no cambia nada si no hay parámetros extra', () => {
    expect(appendQuery('/x?a=1', [])).toBe('/x?a=1')
  })
})
