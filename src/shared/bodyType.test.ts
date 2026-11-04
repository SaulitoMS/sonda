import { describe, expect, it } from 'vitest'
import { looksLikeXml } from './bodyType'

describe('looksLikeXml', () => {
  it('reconoce XML con y sin declaración', () => {
    expect(looksLikeXml('<?xml version="1.0"?><a/>')).toBe(true)
    expect(looksLikeXml('  <a><b>1</b></a>  ')).toBe(true)
    expect(looksLikeXml('<soap:Envelope xmlns:soap="x"><soap:Body/></soap:Envelope>')).toBe(true)
  })

  it('ignora JSON, texto y HTML', () => {
    expect(looksLikeXml('{"a":1}')).toBe(false)
    expect(looksLikeXml('hola')).toBe(false)
    expect(looksLikeXml('<html><body></body></html>')).toBe(false)
  })
})
