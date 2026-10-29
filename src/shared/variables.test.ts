import { describe, expect, it } from 'vitest'
import type { Environment } from './types'
import { buildVarMap, interpolate } from './variables'

const env = (variables: Partial<Environment['variables'][number]>[]): Environment => ({
  id: 'e1',
  name: 'Dev',
  variables: variables.map((v, i) => ({
    id: `v${i}`,
    key: '',
    value: '',
    secret: false,
    enabled: true,
    ...v
  }))
})

describe('buildVarMap', () => {
  it('devuelve un mapa vacío sin entorno', () => {
    expect(buildVarMap(null)).toEqual({})
    expect(buildVarMap(undefined)).toEqual({})
  })

  it('incluye solo variables activas y con clave', () => {
    const map = buildVarMap(
      env([
        { key: 'baseUrl', value: 'https://api.com' },
        { key: 'apagada', value: 'x', enabled: false },
        { key: '  ', value: 'sin clave' }
      ])
    )
    expect(map).toEqual({ baseUrl: 'https://api.com' })
  })

  it('recorta espacios en la clave', () => {
    expect(buildVarMap(env([{ key: ' token ', value: 'abc' }]))).toEqual({ token: 'abc' })
  })
})

describe('interpolate', () => {
  it('reemplaza variables definidas', () => {
    expect(interpolate('{{baseUrl}}/pet/1', { baseUrl: 'https://api.com' })).toEqual({
      text: 'https://api.com/pet/1',
      missing: []
    })
  })

  it('tolera espacios dentro de las llaves', () => {
    expect(interpolate('Bearer {{ token }}', { token: 'abc' }).text).toBe('Bearer abc')
  })

  it('soporta puntos y guiones en el nombre', () => {
    expect(interpolate('{{api.key-1}}', { 'api.key-1': 'ok' }).text).toBe('ok')
  })

  it('deja intactas las variables que faltan y las reporta', () => {
    expect(interpolate('{{a}}/{{b}}/{{a}}', { a: '1' })).toEqual({
      text: '1/{{b}}/1',
      missing: ['b']
    })
  })

  it('no repite variables faltantes', () => {
    expect(interpolate('{{x}} {{x}}', {}).missing).toEqual(['x'])
  })

  it('no confunde nombres como toString con propiedades heredadas', () => {
    expect(interpolate('{{toString}}', {}).missing).toEqual(['toString'])
  })

  it('no toca texto sin variables', () => {
    expect(interpolate('https://x.com/a', {}).text).toBe('https://x.com/a')
  })
})

describe('interpolate con variables dinámicas', () => {
  it('resuelve {{$uuid}} sin necesitar entorno', () => {
    const r = interpolate('/users/{{$uuid}}', {})
    expect(r.missing).toEqual([])
    expect(r.text).toMatch(/^\/users\/[0-9a-f-]{36}$/)
  })

  it('genera un valor distinto en cada aparición', () => {
    const [a, b] = interpolate('{{$uuid}}|{{$uuid}}', {}).text.split('|')
    expect(a).not.toBe(b)
  })

  it('tolera espacios dentro de las llaves', () => {
    expect(interpolate('{{ $randomInt }}', {}).text).toMatch(/^\d+$/)
  })

  it('reporta como faltante una dinámica que no existe', () => {
    expect(interpolate('{{$nope}}', {})).toEqual({ text: '{{$nope}}', missing: ['$nope'] })
  })

  it('con dynamic: false las deja intactas', () => {
    expect(interpolate('{{$uuid}}', {}, { dynamic: false }).text).toBe('{{$uuid}}')
  })

  it('las dinámicas conviven con las del entorno', () => {
    const r = interpolate('{{baseUrl}}?id={{$randomInt}}', { baseUrl: 'https://api.com' })
    expect(r.text).toMatch(/^https:\/\/api\.com\?id=\d+$/)
  })
})