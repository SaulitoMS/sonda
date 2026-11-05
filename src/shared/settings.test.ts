import { describe, expect, it } from 'vitest'
import { bypassesProxy } from './settings'

describe('bypassesProxy', () => {
  it('coincide con el dominio exacto y con sus subdominios', () => {
    expect(bypassesProxy('example.com', 'example.com')).toBe(true)
    expect(bypassesProxy('api.example.com', 'example.com')).toBe(true)
  })

  it('no confunde dominios que solo terminan parecido', () => {
    expect(bypassesProxy('evil-interna.local', 'interna.local')).toBe(false)
    expect(bypassesProxy('example.org', 'example.com')).toBe(false)
  })

  it('acepta punto inicial, comodín y IPs', () => {
    expect(bypassesProxy('api.interna.local', '.interna.local')).toBe(true)
    expect(bypassesProxy('api.corp.net', '*.corp.net')).toBe(true)
    expect(bypassesProxy('10.0.0.5', 'example.com, 10.0.0.5')).toBe(true)
  })

  it('"*" excluye todo y una lista vacía no excluye nada', () => {
    expect(bypassesProxy('x.com', '*')).toBe(true)
    expect(bypassesProxy('x.com', '')).toBe(false)
  })
})
