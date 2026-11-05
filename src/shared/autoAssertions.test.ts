import { describe, expect, it } from 'vitest'
import { generateAssertions } from './autoAssertions'
import type { SendRequestResult } from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

const res = (body: string, contentType: string): OkResponse => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': contentType },
  body,
  timeMs: 120,
  sizeBytes: body.length
})

const bodyRules = (r: OkResponse): { target: string; op: string; expected: string }[] =>
  generateAssertions(r)
    .filter((a) => a.kind === 'body')
    .map(({ target, op, expected }) => ({ target, op, expected }))

describe('generateAssertions con XML', () => {
  it('genera reglas de body desde un XML, sin gastar niveles en el envoltorio', () => {
    const xml = '<?xml version="1.0"?><root><status>active</status><item id="7">x</item></root>'
    expect(bodyRules(res(xml, 'text/xml'))).toEqual([
      { target: 'root.status', op: 'eq', expected: 'active' },
      { target: 'root.item.@id', op: 'exists', expected: '' },
      { target: 'root.item.#text', op: 'eq', expected: 'x' }
    ])
  })

  it('con SOAP llega al contenido de la respuesta', () => {
    const soap =
      '<soap:Envelope xmlns:soap="http://x"><soap:Body><R><state>ok</state></R></soap:Body></soap:Envelope>'
    expect(bodyRules(res(soap, 'text/xml'))).toEqual([
      { target: 'Envelope.Body.R.state', op: 'eq', expected: 'ok' }
    ])
  })

  it('con JSON sigue igual que antes', () => {
    expect(bodyRules(res('{"status":"active"}', 'application/json'))).toEqual([
      { target: 'status', op: 'eq', expected: 'active' }
    ])
  })

  it('con texto plano solo genera status, tiempo, tamaño y content-type', () => {
    const kinds = generateAssertions(res('hola', 'text/plain')).map((a) => a.kind)
    expect(kinds).toEqual(['status', 'time', 'size', 'header'])
  })
})
