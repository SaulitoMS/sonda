import { describe, expect, it } from 'vitest'
import type { CurlRequest } from './curl'
import { REDACTED, redactRequest } from './redactRequest'

const base = (over: Partial<CurlRequest> = {}): CurlRequest => ({
  method: 'POST',
  url: 'https://api.test/v1/items',
  headers: [],
  body: '',
  ...over
})

describe('redactRequest', () => {
  it('conserva el esquema de Authorization y oculta el valor', () => {
    const out = redactRequest(
      base({ headers: [{ key: 'Authorization', value: 'Bearer eyJhbGciOi.abc' }] })
    )
    expect(out.headers[0].value).toBe(`Bearer ${REDACTED}`)
  })

  it('oculta cookies y API keys, y deja intactos los headers normales', () => {
    const out = redactRequest(
      base({
        headers: [
          { key: 'Cookie', value: 'sid=1' },
          { key: 'X-Api-Key', value: 'k-999' },
          { key: 'Content-Type', value: 'application/json' }
        ]
      })
    )
    expect(out.headers.map((h) => h.value)).toEqual([REDACTED, REDACTED, 'application/json'])
  })

  it('deja las {{variables}} tal cual', () => {
    const out = redactRequest(
      base({
        headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
        url: 'https://api.test/x?api_key={{KEY}}'
      })
    )
    expect(out.headers[0].value).toBe('Bearer {{token}}')
    expect(out.url).toBe('https://api.test/x?api_key={{KEY}}')
  })

  it('oculta tokens en la query sin tocar el resto', () => {
    const out = redactRequest(base({ url: 'https://api.test/x?token=abc123&page=2' }))
    expect(out.url).toBe(`https://api.test/x?token=${REDACTED}&page=2`)
  })

  it('oculta la contraseña incrustada en la URL', () => {
    const out = redactRequest(base({ url: 'https://admin:s3cr3t@api.test/x' }))
    expect(out.url).toBe(`https://admin:${REDACTED}@api.test/x`)
  })

  it('oculta campos secretos del body JSON, incluso anidados', () => {
    const out = redactRequest(
      base({ body: '{"user":"ana","password":"hunter2","a":{"access_token":"zzz"}}' })
    )
    expect(out.body).toBe(
      `{"user":"ana","password":"${REDACTED}","a":{"access_token":"${REDACTED}"}}`
    )
  })

  it('oculta la contraseña de --user pero conserva el usuario', () => {
    expect(redactRequest(base({ user: 'bob:pass123' })).user).toBe(`bob:${REDACTED}`)
    expect(redactRequest(base({ user: 'bob:{{pass}}' })).user).toBe('bob:{{pass}}')
  })

  it('oculta solo los campos de formulario secretos', () => {
    const out = redactRequest(
      base({
        formData: [
          { kind: 'text', key: 'password', value: 'abc' },
          { kind: 'text', key: 'name', value: 'ana' }
        ]
      })
    )
    expect(out.formData?.map((p) => p.value)).toEqual([REDACTED, 'ana'])
  })

  it('no modifica la petición original', () => {
    const req = base({ url: 'https://api.test/x?token=abc', body: '{"password":"x"}' })
    redactRequest(req)
    expect(req.url).toBe('https://api.test/x?token=abc')
    expect(req.body).toBe('{"password":"x"}')
  })

  it('no inventa campos que la petición no tenía', () => {
    const out = redactRequest(base())
    expect('user' in out).toBe(false)
    expect('formData' in out).toBe(false)
  })
})