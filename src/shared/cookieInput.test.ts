import { describe, expect, it } from 'vitest'
import { parseCookieInput } from './cookieInput'
import type { CookieInput } from './types'

const base: CookieInput = {
  name: 'sid',
  value: 'abc123',
  domain: 'api.ejemplo.com',
  path: '/',
  secure: false,
  expiresAt: null
}

describe('parseCookieInput', () => {
  it('acepta una cookie válida y la normaliza', () => {
    const r = parseCookieInput({ ...base, domain: ' API.Ejemplo.com ', path: '' })
    expect(r).toEqual({
      ok: true,
      cookie: { ...base, hostOnly: true, domain: 'api.ejemplo.com', path: '/' }
    })
  })

  it('el punto inicial del dominio significa que aplica a subdominios', () => {
    const r = parseCookieInput({ ...base, domain: '.ejemplo.com' })
    expect(r.ok && r.cookie).toMatchObject({ domain: 'ejemplo.com', hostOnly: false })
  })

  it('acepta localhost', () => {
    expect(parseCookieInput({ ...base, domain: 'localhost' }).ok).toBe(true)
  })

  it('rechaza nombre vacío o con caracteres inválidos', () => {
    expect(parseCookieInput({ ...base, name: '  ' }).ok).toBe(false)
    expect(parseCookieInput({ ...base, name: 'a b' }).ok).toBe(false)
    expect(parseCookieInput({ ...base, name: 'a=b' }).ok).toBe(false)
  })

  it('rechaza valores con ; o saltos de línea', () => {
    expect(parseCookieInput({ ...base, value: 'a;b' }).ok).toBe(false)
    expect(parseCookieInput({ ...base, value: 'a\nb' }).ok).toBe(false)
  })

  it('rechaza dominios con esquema o ruta', () => {
    expect(parseCookieInput({ ...base, domain: 'https://x.com' }).ok).toBe(false)
    expect(parseCookieInput({ ...base, domain: 'x.com/api' }).ok).toBe(false)
    expect(parseCookieInput({ ...base, domain: '' }).ok).toBe(false)
  })

  it('exige que la ruta empiece con /', () => {
    expect(parseCookieInput({ ...base, path: 'api' }).ok).toBe(false)
  })

  it('rechaza fechas de expiración pasadas', () => {
    expect(parseCookieInput({ ...base, expiresAt: 1000 }, 5000).ok).toBe(false)
    expect(parseCookieInput({ ...base, expiresAt: 9000 }, 5000).ok).toBe(true)
  })
})
