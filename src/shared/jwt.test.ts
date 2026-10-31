import { describe, expect, it } from 'vitest'
import { decodeJwt, describeExpiry } from './jwt'

const b64url = (obj: unknown): string => Buffer.from(JSON.stringify(obj)).toString('base64url')

const token = (payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string =>
  `${b64url(header)}.${b64url(payload)}.firma`

describe('decodeJwt', () => {
  it('lee header, payload y fechas', () => {
    const jwt = decodeJwt(token({ sub: '42', exp: 2000, iat: 1000, nbf: 1500 }))
    expect(jwt?.header.alg).toBe('HS256')
    expect(jwt?.payload.sub).toBe('42')
    expect(jwt?.expiresAt).toBe(2_000_000)
    expect(jwt?.issuedAt).toBe(1_000_000)
    expect(jwt?.notBefore).toBe(1_500_000)
  })

  it('acepta el prefijo Bearer y caracteres UTF-8', () => {
    const jwt = decodeJwt(`Bearer ${token({ name: 'José Ñandú' })}`)
    expect(jwt?.payload.name).toBe('José Ñandú')
  })

  it('devuelve null si no es un JWT', () => {
    expect(decodeJwt('')).toBeNull()
    expect(decodeJwt('abc')).toBeNull()
    expect(decodeJwt('{{token}}')).toBeNull()
    expect(decodeJwt('a.b.c')).toBeNull()
    expect(decodeJwt(`${b64url([1])}.${b64url({})}.x`)).toBeNull()
  })

  it('sin exp no hay fecha de expiración', () => {
    expect(decodeJwt(token({ sub: '1' }))?.expiresAt).toBeUndefined()
  })
})

describe('describeExpiry', () => {
  const now = 1_000_000_000

  it('token vigente', () => {
    expect(describeExpiry(now + 2 * 3_600_000, now)).toEqual({
      expired: false,
      label: 'Expira en 2 horas'
    })
  })

  it('token expirado', () => {
    expect(describeExpiry(now - 86_400_000, now)).toEqual({
      expired: true,
      label: 'Expiró hace 1 día'
    })
  })

  it('usa segundos y minutos para lo cercano', () => {
    expect(describeExpiry(now + 30_000, now).label).toBe('Expira en 30 segundos')
    expect(describeExpiry(now - 5 * 60_000, now).label).toBe('Expiró hace 5 minutos')
  })
})