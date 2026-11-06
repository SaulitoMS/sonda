import { describe, expect, it } from 'vitest'
import type { AuthConfig, SavedRequest } from './types'
import { maskSecret, scanAuth, scanHeaders, scanRequest } from './secretScan'

const req = (over: Partial<SavedRequest> = {}): SavedRequest => ({
  name: 'x',
  method: 'POST',
  url: 'https://api.test/v1',
  headers: [],
  body: '',
  ...over
})

const auth = (over: Partial<AuthConfig>): AuthConfig => ({
  type: 'none',
  token: '',
  username: '',
  password: '',
  keyName: '',
  keyValue: '',
  keyIn: 'header',
  ...over
})

describe('secretScan', () => {
  it('nunca devuelve el secreto completo', () => {
    expect(maskSecret('eyJhbGciOiJIUzI1NiJ9')).toBe('ey••••')
    expect(maskSecret('abc')).toBe('••••')
  })

  it('detecta un Bearer escrito a mano y ignora {{variables}}', () => {
    expect(scanAuth(auth({ type: 'bearer', token: 'abcdef123456' }))).toHaveLength(1)
    expect(scanAuth(auth({ type: 'bearer', token: '{{token}}' }))).toEqual([])
  })

  it('ignora la auth heredada o vacía', () => {
    expect(scanAuth(auth({ type: 'inherit', token: 'abcdef123456' }))).toEqual([])
    expect(scanAuth(undefined)).toEqual([])
  })

  it('detecta headers sensibles activos y salta los desactivados', () => {
    const out = scanHeaders([
      { key: 'Authorization', value: 'Bearer abc123456', enabled: true },
      { key: 'X-Api-Key', value: 'k-999999', enabled: false },
      { key: 'Content-Type', value: 'application/json', enabled: true }
    ])
    expect(out.map((f) => f.field)).toEqual(['Header Authorization'])
  })

  it('detecta secretos en la URL, el body JSON y el formulario', () => {
    const out = scanRequest(
      req({
        url: 'https://user:clave123@api.test/x?api_key=ABCDEF123&page=2',
        body: '{"password":"hunter2hunter2","name":"ana","token":"{{t}}"}',
        bodyForm: {
          mode: 'urlencoded',
          fields: [{ key: 'client_secret', value: 'shh-123456', type: 'text', enabled: true }]
        }
      })
    )
    expect(out.map((f) => f.field)).toEqual([
      'URL · api_key',
      'URL · contraseña',
      'Body · password',
      'Formulario · client_secret'
    ])
  })

  it('una petición limpia no devuelve nada', () => {
    expect(scanRequest(req({ body: '{"name":"ana"}' }))).toEqual([])
  })
})
