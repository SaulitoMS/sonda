import { describe, expect, it } from 'vitest'
import { BINARY_FIELD, binaryBodyPath, parseBodyFormData, toBodyFormData } from './bodyForm'

describe('body binario', () => {
  it('toma la ruta del campo reservado y resuelve variables', () => {
    const fields = [
      { key: 'otro', value: '/x/otro.png', type: 'file' as const, enabled: true },
      { key: BINARY_FIELD, value: '{{dir}}/foto.png', type: 'file' as const, enabled: true }
    ]
    expect(binaryBodyPath(fields, (t) => t.replace('{{dir}}', '/tmp'))).toBe('/tmp/foto.png')
  })

  it('devuelve undefined si no hay archivo o está desactivado', () => {
    const id = (t: string): string => t
    expect(binaryBodyPath([], id)).toBeUndefined()
    expect(
      binaryBodyPath([{ key: BINARY_FIELD, value: '/a.bin', type: 'file', enabled: false }], id)
    ).toBeUndefined()
    expect(
      binaryBodyPath([{ key: BINARY_FIELD, value: '  ', type: 'file', enabled: true }], id)
    ).toBeUndefined()
  })

  it('el modo binary sobrevive a guardar y volver a leer', () => {
    const saved = toBodyFormData({
      mode: 'binary',
      fields: [{ key: BINARY_FIELD, value: '/a.bin', type: 'file', enabled: true }]
    })
    expect(parseBodyFormData(saved)?.mode).toBe('binary')
  })
})
