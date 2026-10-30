import { describe, expect, it } from 'vitest'
import { buildAuth, emptyAuth, toBase64 } from './auth'
import type { AuthConfig } from './types'

const id = (t: string): string => t
const make = (patch: Partial<AuthConfig>): AuthConfig => ({ ...emptyAuth(), ...patch })

describe('buildAuth', () => {
  it('no agrega nada sin auth o con tipo none', () => {
    expect(buildAuth(null, id)).toEqual({ headers: [], query: [], warnings: [] })
    expect(buildAuth(make({ type: 'none', token: 'x' }), id)).toEqual({
      headers: [],
      query: [],
      warnings: []
    })
  })

  it('Bearer agrega el header Authorization', () => {
    expect(buildAuth(make({ type: 'bearer', token: 'abc' }), id).headers).toEqual([
      { key: 'Authorization', value: 'Bearer abc' }
    ])
  })

  it('Bearer no duplica el prefijo y omite tokens vacíos', () => {
    expect(buildAuth(make({ type: 'bearer', token: 'Bearer abc' }), id).headers[0].value).toBe(
      'Bearer abc'
    )
    expect(buildAuth(make({ type: 'bearer', token: '  ' }), id).headers).toEqual([])
  })

  it('Bearer con token vacío avisa en vez de callar', () => {
    const parts = buildAuth(make({ type: 'bearer', token: '' }), id)
    expect(parts.headers).toEqual([])
    expect(parts.warnings).toHaveLength(1)
    expect(parts.warnings[0]).toContain('token')
  })

  it('Basic sin datos avisa', () => {
    expect(buildAuth(make({ type: 'basic' }), id).warnings).toHaveLength(1)
  })

  it('Bearer resuelve variables', () => {
    const resolve = (t: string): string => t.replace('{{token}}', 'secreto')
    expect(buildAuth(make({ type: 'bearer', token: '{{token}}' }), resolve).headers[0].value).toBe(
      'Bearer secreto'
    )
  })

  it('Basic codifica usuario:contraseña en base64', () => {
    const parts = buildAuth(make({ type: 'basic', username: 'ana', password: '1234' }), id)
    expect(parts.headers).toEqual([{ key: 'Authorization', value: 'Basic YW5hOjEyMzQ=' }])
  })

  it('Basic soporta caracteres UTF-8', () => {
    expect(toBase64('ñ:é')).toBe('w7E6w6k=')
  })

  it('API Key va al header o a la query según keyIn', () => {
    const header = buildAuth(make({ type: 'apikey', keyName: 'X-API-Key', keyValue: 'k' }), id)
    expect(header.headers).toEqual([{ key: 'X-API-Key', value: 'k' }])
    expect(header.query).toEqual([])

    const query = buildAuth(
      make({ type: 'apikey', keyName: 'api_key', keyValue: 'k', keyIn: 'query' }),
      id
    )
    expect(query.query).toEqual([{ key: 'api_key', value: 'k' }])
    expect(query.headers).toEqual([])
  })

  it('API Key incompleta no agrega nada y avisa', () => {
    const noValue = buildAuth(make({ type: 'apikey', keyName: 'X-Key' }), id)
    expect(noValue.headers).toEqual([])
    expect(noValue.warnings[0]).toContain('X-Key')

    const noName = buildAuth(make({ type: 'apikey', keyValue: 'v' }), id)
    expect(noName.headers).toEqual([])
    expect(noName.warnings).toHaveLength(1)
  })

  it('una auth completa no genera avisos', () => {
    expect(buildAuth(make({ type: 'bearer', token: 'abc' }), id).warnings).toEqual([])
  })
})
