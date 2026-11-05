import { describe, expect, it } from 'vitest'
import { parseJsonOrXml, parseXml } from './xmlBody'
import { evaluateAssertions } from './assertions'
import { evaluateExtractions } from './extract'
import type { Assertion, Extraction, SendRequestResult } from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

const SOAP = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://x"><soap:Body><GetUserResponse id="9"><name>Ana &amp; Co</name><tag>a</tag><tag>b</tag><empty/></GetUserResponse></soap:Body></soap:Envelope>`

const res = (body: string): OkResponse => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'text/xml' },
  body,
  timeMs: 10,
  sizeBytes: body.length
})

const assertion = (patch: Partial<Assertion>): Assertion => ({
  id: 'a',
  enabled: true,
  kind: 'body',
  target: '',
  op: 'eq',
  expected: '',
  ...patch
})

describe('parseXml', () => {
  it('quita namespaces, lee atributos, entidades y repetidos', () => {
    expect(parseXml(SOAP)).toEqual({
      Envelope: {
        Body: {
          GetUserResponse: { '@id': '9', name: 'Ana & Co', tag: ['a', 'b'], empty: '' }
        }
      }
    })
  })

  it('lanza error si las etiquetas no coinciden', () => {
    expect(() => parseXml('<a><b></a>')).toThrow('XML inválido')
  })
})

describe('parseJsonOrXml', () => {
  it('prefiere JSON, cae a XML y rechaza texto plano', () => {
    expect(parseJsonOrXml('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseJsonOrXml('<a>1</a>')).toEqual({ ok: true, value: { a: '1' } })
    expect(parseJsonOrXml('hola')).toEqual({ ok: false })
  })
})

describe('aserciones y extracciones sobre XML', () => {
  it('evalúa rutas del body XML', () => {
    const path = 'Envelope.Body.GetUserResponse'
    const results = evaluateAssertions(
      [
        assertion({ target: `${path}.name`, expected: 'Ana & Co' }),
        assertion({ target: `${path}.tag[1]`, expected: 'b' }),
        assertion({ target: `${path}.@id`, op: 'gt', expected: '5' })
      ],
      res(SOAP)
    )
    expect(results.map((r) => r.passed)).toEqual([true, true, true])
  })

  it('extrae un valor del XML a una variable', () => {
    const rule: Extraction = {
      id: 'e',
      enabled: true,
      source: 'body',
      path: 'Envelope.Body.GetUserResponse.@id',
      variable: 'userId',
      secret: false
    }
    const [r] = evaluateExtractions([rule], res(SOAP))
    expect(r).toMatchObject({ ok: true, value: '9' })
  })
})
