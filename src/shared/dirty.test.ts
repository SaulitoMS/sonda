import { describe, expect, it } from 'vitest'
import { isDirtyState, requestSignature, type SignatureInput } from './dirty'

const auth = {
  type: 'none' as const,
  token: '',
  username: '',
  password: '',
  keyName: '',
  keyValue: '',
  keyIn: 'header' as const
}

const base = (over: Partial<SignatureInput> = {}): SignatureInput => ({
  method: 'GET',
  url: 'https://x.com',
  headers: [],
  body: '',
  auth,
  assertions: [],
  extractions: [],
  ...over
})

describe('requestSignature', () => {
  it('ignora filas vacías de headers y espacios en la URL', () => {
    const a = requestSignature(base({ headers: [{ key: 'A', value: '1', enabled: true }] }))
    const b = requestSignature(
      base({
        url: ' https://x.com ',
        headers: [
          { key: 'A', value: '1', enabled: true },
          { key: '', value: '', enabled: true }
        ]
      })
    )
    expect(a).toBe(b)
  })

  it('ignora los datos de auth cuando el tipo es none', () => {
    expect(requestSignature(base())).toBe(
      requestSignature(base({ auth: { ...auth, token: 'abc' } }))
    )
  })

  it('cambia con la URL, el body o el método', () => {
    const s = requestSignature(base())
    expect(requestSignature(base({ url: 'https://y.com' }))).not.toBe(s)
    expect(requestSignature(base({ body: '{}' }))).not.toBe(s)
    expect(requestSignature(base({ method: 'POST' }))).not.toBe(s)
  })
})

describe('isDirtyState', () => {
  it('es false si coincide con la línea base y true si no', () => {
    const r = base()
    const baseline = requestSignature(r)
    expect(isDirtyState({ ...r, baseline })).toBe(false)
    expect(isDirtyState({ ...r, url: 'https://otra.com', baseline })).toBe(true)
  })
})
