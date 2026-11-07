import { describe, expect, it } from 'vitest'
import {
  buildDigestAuthorization,
  findDigestChallenge,
  md5Hex,
  parseDigestChallenge
} from './digest'

describe('md5Hex', () => {
  it('coincide con los vectores conocidos', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe(
      '9e107d9d372bb6826bd81d3542a419d6'
    )
  })
})

describe('parseDigestChallenge', () => {
  const header =
    'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"'

  it('lee realm, nonce, opaque y elige qop=auth', () => {
    expect(parseDigestChallenge(header)).toEqual({
      realm: 'testrealm@host.com',
      nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
      opaque: '5ccc069c403ebaf9f0171e9517f40e41',
      algorithm: 'MD5',
      qop: 'auth'
    })
  })

  it('devuelve null si no es Digest, falta nonce o el algoritmo no se soporta', () => {
    expect(parseDigestChallenge('Basic realm="x"')).toBe(null)
    expect(parseDigestChallenge('Digest realm="x"')).toBe(null)
    expect(parseDigestChallenge('Digest realm="x", nonce="n", algorithm=SHA-512-256')).toBe(null)
  })

  it('usa auth-int cuando es lo único que ofrece el servidor', () => {
    expect(parseDigestChallenge('Digest realm="x", nonce="n", qop="auth-int"')?.qop).toBe(
      'auth-int'
    )
  })

  it('rechaza un qop desconocido', () => {
    expect(parseDigestChallenge('Digest realm="x", nonce="n", qop="foo"')).toBe(null)
  })

  it('encuentra el header sin importar las mayúsculas', () => {
    expect(findDigestChallenge({ 'WWW-Authenticate': header })?.realm).toBe('testrealm@host.com')
    expect(findDigestChallenge({ 'content-type': 'text/html' })).toBe(null)
  })
})

describe('buildDigestAuthorization', () => {
  it('reproduce el ejemplo del RFC 2617', async () => {
    const challenge = parseDigestChallenge(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"'
    )!
    const value = await buildDigestAuthorization({
      challenge,
      username: 'Mufasa',
      password: 'Circle Of Life',
      method: 'GET',
      uri: '/dir/index.html',
      cnonce: '0a4f113b'
    })
    expect(value).toContain('response="6629fae49393a05397450978507c4ef1"')
    expect(value).toContain('nc=00000001')
    expect(value).toContain('qop=auth')
  })

  it('usa SHA-256 cuando el servidor lo pide', async () => {
    const value = await buildDigestAuthorization({
      challenge: { realm: 'r', nonce: 'n', algorithm: 'SHA-256', qop: 'auth' },
      username: 'u',
      password: 'p',
      method: 'get',
      uri: '/',
      cnonce: 'c'
    })
    expect(/response="[0-9a-f]{64}"/.test(value)).toBe(true)
    expect(value).toContain('algorithm=SHA-256')
  })

  it('sin qop no manda nc ni cnonce (RFC 2069)', async () => {
    const value = await buildDigestAuthorization({
      challenge: { realm: 'r', nonce: 'n', algorithm: 'MD5' },
      username: 'u',
      password: 'p',
      method: 'GET',
      uri: '/'
    })
    expect(value.includes('cnonce')).toBe(false)
    expect(value.includes('nc=')).toBe(false)
  })

  it('con qop=auth-int incluye el hash del body en la firma', async () => {
    const value = await buildDigestAuthorization({
      challenge: { realm: 'r', nonce: 'n', algorithm: 'MD5', qop: 'auth-int' },
      username: 'u',
      password: 'p',
      method: 'post',
      uri: '/x?a=1',
      body: '{"a":1}',
      cnonce: 'c'
    })
    expect(value).toContain('response="ba0f3ebb19de00ee88c534af0c573ad3"')
    expect(value).toContain('qop=auth-int')
  })
})
