import { describe, expect, it } from 'vitest'
import {
  formDataParts,
  fromBodyFormData,
  toBodyFormData,
  urlencodedBody,
  parseBodyFormData
} from './bodyForm'
import type { FormFieldData } from './types'

const f = (key: string, value: string, over: Partial<FormFieldData> = {}): FormFieldData => ({
  key,
  value,
  type: 'text',
  enabled: true,
  ...over
})
const same = (t: string): string => t

describe('urlencodedBody', () => {
  it('codifica claves y valores y omite desactivados y vacíos', () => {
    const fields = [f('a b', 'x&y'), f('off', '1', { enabled: false }), f('', 'z')]
    expect(urlencodedBody(fields, same)).toBe('a+b=x%26y')
  })

  it('resuelve variables antes de codificar', () => {
    const resolve = (t: string): string => t.replace('{{user}}', 'ana')
    expect(urlencodedBody([f('name', '{{user}}')], resolve)).toBe('name=ana')
  })

  it('ignora los campos de archivo', () => {
    expect(urlencodedBody([f('doc', '/tmp/a.pdf', { type: 'file' })], same)).toBe('')
  })
})

describe('formDataParts', () => {
  it('conserva el tipo de cada campo', () => {
    const parts = formDataParts([f('avatar', '/tmp/a.png', { type: 'file' }), f('n', '1')], same)
    expect(parts).toEqual([
      { key: 'avatar', kind: 'file', value: '/tmp/a.png' },
      { key: 'n', kind: 'text', value: '1' }
    ])
  })
})

describe('toBodyFormData / fromBodyFormData', () => {
  it('no guarda nada en modo raw sin campos', () => {
    expect(toBodyFormData({ mode: 'raw', fields: [f('', '')] })).toBeUndefined()
  })

  it('guarda el modo y descarta filas sin clave', () => {
    expect(toBodyFormData({ mode: 'form-data', fields: [f('a', '1'), f('', '')] })).toEqual({
      mode: 'form-data',
      fields: [f('a', '1')]
    })
  })

  it('al cargar agrega una fila vacía al final', () => {
    const form = fromBodyFormData({ mode: 'urlencoded', fields: [f('a', '1')] })
    expect(form.fields).toHaveLength(2)
    expect(form.fields[1].key).toBe('')
  })
})

describe('parseBodyFormData', () => {
  it('lee un bodyForm válido', () => {
    const data = { mode: 'form-data', fields: [f('a', '1')] }
    expect(parseBodyFormData(data)).toEqual(data)
  })

  it('descarta modos desconocidos y campos que no son lista', () => {
    expect(parseBodyFormData({ mode: 'raro', fields: [] })).toBeUndefined()
    expect(parseBodyFormData({ mode: 'raw', fields: 5 })).toBeUndefined()
    expect(parseBodyFormData(null)).toBeUndefined()
  })
})
