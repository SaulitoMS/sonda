import { describe, expect, it } from 'vitest'
import { conditionalHeader, isConditionalKey } from './conditional'

describe('conditionalHeader', () => {
  it('prefiere ETag', () => {
    expect(
      conditionalHeader({ etag: '"abc"', 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' })
    ).toEqual({
      key: 'If-None-Match',
      value: '"abc"'
    })
  })

  it('usa Last-Modified si no hay ETag', () => {
    expect(conditionalHeader({ 'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT' })?.key).toBe(
      'If-Modified-Since'
    )
  })

  it('devuelve null sin validadores', () => {
    expect(conditionalHeader({ 'content-type': 'application/json' })).toBeNull()
  })
})

describe('isConditionalKey', () => {
  it('ignora mayúsculas y espacios', () => {
    expect(isConditionalKey(' if-none-match ')).toBe(true)
    expect(isConditionalKey('Authorization')).toBe(false)
  })
})
