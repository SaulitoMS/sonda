import { describe, expect, it } from 'vitest'
import { exportCookies, parseCookiesImport } from './cookieTransfer'
import type { CookieInfo } from './types'

const NOW = Date.UTC(2026, 0, 1)
const LATER = NOW + 86_400_000

const jar: CookieInfo[] = [
  {
    id: 'a',
    name: 'sid',
    value: 'abc',
    domain: 'api.x.io',
    hostOnly: true,
    path: '/',
    secure: true,
    expiresAt: null
  },
  {
    id: 'b',
    name: 'pref',
    value: 'dark',
    domain: 'x.io',
    hostOnly: false,
    path: '/app',
    secure: false,
    expiresAt: LATER
  }
]

describe('exportCookies / parseCookiesImport', () => {
  it('lo que se exporta se vuelve a importar igual', () => {
    const { cookies, skipped } = parseCookiesImport(exportCookies(jar), NOW)
    expect(skipped).toBe(0)
    expect(cookies).toEqual([
      { name: 'sid', value: 'abc', domain: 'api.x.io', path: '/', secure: true, expiresAt: null },
      {
        name: 'pref',
        value: 'dark',
        domain: '.x.io',
        path: '/app',
        secure: false,
        expiresAt: LATER
      }
    ])
  })

  it('lee el arreglo de las extensiones del navegador', () => {
    const text = JSON.stringify([
      { name: 'a', value: '1', domain: '.x.io', hostOnly: false, path: '/', session: true },
      {
        name: 'b',
        value: '2',
        domain: 'y.io',
        hostOnly: false,
        path: '/',
        secure: true,
        expirationDate: LATER / 1000
      },
      { name: 'c', value: '3', domain: '.z.io', hostOnly: true, path: '/' }
    ])
    const { cookies } = parseCookiesImport(text, NOW)
    expect(cookies[0]).toMatchObject({ domain: '.x.io', expiresAt: null })
    expect(cookies[1]).toMatchObject({ domain: '.y.io', secure: true, expiresAt: LATER })
    expect(cookies[2]).toMatchObject({ domain: 'z.io' })
  })

  it('omite vencidas, incompletas y fechas inválidas', () => {
    const text = JSON.stringify([
      { name: 'old', value: '1', domain: 'x.io', expiresAt: NOW - 1000 },
      { value: 'sin nombre', domain: 'x.io' },
      { name: 'sin-dominio', value: '1' },
      { name: 'raro', value: '1', domain: 'x.io', expiresAt: 'mañana' },
      'basura',
      { name: 'ok', value: '1', domain: 'x.io' }
    ])
    const { cookies, skipped } = parseCookiesImport(text, NOW)
    expect(cookies.map((c) => c.name)).toEqual(['ok'])
    expect(skipped).toBe(5)
  })

  it('falla con JSON inválido o sin lista', () => {
    expect(() => parseCookiesImport('no es json')).toThrow('JSON válido')
    expect(() => parseCookiesImport('{"foo":1}')).toThrow('lista de cookies')
  })
})
