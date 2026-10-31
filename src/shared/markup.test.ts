import { describe, expect, it } from 'vitest'
import { formatXml, isHtmlResponse, isXmlResponse } from './markup'

describe('isXmlResponse', () => {
  it('detecta por Content-Type', () => {
    expect(isXmlResponse('application/xml; charset=utf-8', '')).toBe(true)
    expect(isXmlResponse('application/soap+xml', '')).toBe(true)
    expect(isXmlResponse('image/svg+xml', '')).toBe(true)
  })

  it('detecta por la declaración <?xml si no hay tipo', () => {
    expect(isXmlResponse(undefined, '  <?xml version="1.0"?><a/>')).toBe(true)
  })

  it('no confunde JSON ni HTML', () => {
    expect(isXmlResponse('application/json', '{"a":1}')).toBe(false)
    expect(isXmlResponse('text/html', '<html></html>')).toBe(false)
  })
})

describe('isHtmlResponse', () => {
  it('detecta por Content-Type', () => {
    expect(isHtmlResponse('text/html; charset=utf-8', '')).toBe(true)
  })

  it('sin tipo útil, mira el inicio del body', () => {
    expect(isHtmlResponse(undefined, '<!DOCTYPE html><html></html>')).toBe(true)
    expect(isHtmlResponse('text/plain', '  <html lang="es">')).toBe(true)
    expect(isHtmlResponse(undefined, '{"a":1}')).toBe(false)
  })

  it('respeta un Content-Type que dice otra cosa', () => {
    expect(isHtmlResponse('application/json', '<html></html>')).toBe(false)
  })
})

describe('formatXml', () => {
  it('indenta y deja los elementos con texto en una línea', () => {
    const xml =
      '<?xml version="1.0"?><pet id="1"><name>Rex</name><tags><tag>a</tag><tag/></tags></pet>'
    expect(formatXml(xml)).toBe(
      [
        '<?xml version="1.0"?>',
        '<pet id="1">',
        '  <name>Rex</name>',
        '  <tags>',
        '    <tag>a</tag>',
        '    <tag/>',
        '  </tags>',
        '</pet>'
      ].join('\n')
    )
  })

  it('reformatear algo ya formateado no cambia nada', () => {
    const once = formatXml('<a><b>1</b><c><d/></c></a>')!
    expect(formatXml(once)).toBe(once)
  })

  it('respeta CDATA, comentarios y > dentro de atributos', () => {
    const out = formatXml('<a x="1>2"><!-- hola --><b><![CDATA[<x>&]]></b></a>')
    expect(out).toBe(
      ['<a x="1>2">', '  <!-- hola -->', '  <b><![CDATA[<x>&]]></b>', '</a>'].join('\n')
    )
  })

  it('un elemento vacío abierto y cerrado queda en una línea', () => {
    expect(formatXml('<a><b></b></a>')).toBe('<a>\n  <b></b>\n</a>')
  })

  it('devuelve null si no está bien formado', () => {
    expect(formatXml('<a><b></a></b>')).toBeNull()
    expect(formatXml('<a><b></b>')).toBeNull()
    expect(formatXml('<a></a></a>')).toBeNull()
    expect(formatXml('hola <a/>')).toBeNull()
    expect(formatXml('<a> < </a>')).toBeNull()
    expect(formatXml('{"a":1}')).toBeNull()
    expect(formatXml('')).toBeNull()
  })

  it('HTML con etiquetas sin cerrar no se toca', () => {
    expect(formatXml('<html><body><br><p>hola</p></body></html>')).toBeNull()
  })
})
