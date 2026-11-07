import { describe, expect, it } from 'vitest'
import { envMismatch, hostOf } from './envMismatch'
import type { Environment } from './types'

const env = (name: string): Environment => ({ id: name, name, variables: [] })

describe('hostOf', () => {
  it('lee el host aunque haya variables, puerto o credenciales', () => {
    expect(hostOf('https://User:pw@Api.Acme.com:8443/x?y=1')).toBe('api.acme.com')
    expect(hostOf('{{baseUrl}}/x')).toBeNull()
  })
})

describe('envMismatch', () => {
  it('avisa si producción apunta a localhost o a un host de pruebas', () => {
    expect(envMismatch(env('Producción'), 'http://localhost:3000/x', {})).not.toBeNull()
    expect(envMismatch(env('Prod'), 'https://api.staging.acme.com/x', {})).not.toBeNull()
  })

  it('resuelve {{variables}} antes de revisar el host', () => {
    const out = envMismatch(env('prod'), '{{baseUrl}}/x', { baseUrl: 'http://127.0.0.1:8080' })
    expect(out).not.toBeNull()
  })

  it('avisa si un entorno de pruebas apunta a un host de producción', () => {
    expect(envMismatch(env('Desarrollo'), 'https://prod.acme.com/x', {})).not.toBeNull()
    expect(envMismatch(env('Local'), 'https://api.prod.acme.com', {})).not.toBeNull()
  })

  it('no avisa cuando todo coincide, falta información o la palabra es parcial', () => {
    expect(envMismatch(env('Producción'), 'https://api.acme.com/x', {})).toBeNull()
    expect(envMismatch(env('dev'), 'https://dev.acme.com', {})).toBeNull()
    expect(envMismatch(env('Prod'), '{{baseUrl}}/x', {})).toBeNull()
    expect(envMismatch(null, 'http://localhost', {})).toBeNull()
    expect(envMismatch(env('Local'), 'https://product.acme.com', {})).toBeNull()
    expect(envMismatch(env('Prod'), 'https://devops.acme.com', {})).toBeNull()
  })

  it('usa la misma clave para el mismo entorno y host', () => {
    const a = envMismatch(env('Prod'), 'http://localhost:3000/a', {})
    const b = envMismatch(env('Prod'), 'http://localhost:4000/b', {})
    expect(a?.key).toBe(b?.key)
  })
})
