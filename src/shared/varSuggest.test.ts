import { describe, expect, it } from 'vitest'
import { applySuggestion, openVariableAt, suggestionEdit, suggestVariables } from './varSuggest'

const env = [
  { name: 'baseUrl', value: 'https://api.test', secret: false },
  { name: 'token', value: 'abc', secret: true }
]
const dynamic = [
  { name: '$uuid', description: 'UUID v4 aleatorio' },
  { name: '$randomInt', description: 'Entero aleatorio' }
]

describe('openVariableAt', () => {
  it('detecta una llave abierta', () => {
    expect(openVariableAt('{{base', 6)).toEqual({ start: 0, query: 'base' })
    expect(openVariableAt('x/{{ba/y', 6)).toEqual({ start: 2, query: 'ba' })
  })

  it('ignora llaves ya cerradas o texto que no es una variable', () => {
    expect(openVariableAt('{{a}}', 5)).toBeNull()
    expect(openVariableAt('sin llaves', 4)).toBeNull()
    expect(openVariableAt('{{a b', 5)).toBeNull()
  })
})

describe('suggestVariables', () => {
  it('sin texto muestra todas, con las del entorno primero', () => {
    expect(suggestVariables('', env, dynamic).map((s) => s.name)).toEqual([
      'baseUrl',
      'token',
      '$uuid',
      '$randomInt'
    ])
  })

  it('prioriza las que empiezan igual y oculta los secretos', () => {
    const r = suggestVariables('to', env, dynamic)
    expect(r[0]).toMatchObject({ name: 'token', detail: 'Secreto' })
  })

  it('con $ solo salen dinámicas', () => {
    expect(suggestVariables('$ran', env, dynamic).map((s) => s.name)).toEqual(['$randomInt'])
  })

  it('respeta el límite', () => {
    expect(suggestVariables('', env, dynamic, 2)).toHaveLength(2)
  })
})

describe('applySuggestion', () => {
  it('reemplaza lo escrito y cierra las llaves', () => {
    expect(applySuggestion('{{ba', 4, { start: 0, query: 'ba' }, 'baseUrl')).toEqual({
      text: '{{baseUrl}}',
      cursor: 11
    })
  })

  it('no duplica las llaves de cierre existentes', () => {
    expect(applySuggestion('{{ba}}/x', 4, { start: 0, query: 'ba' }, 'baseUrl')).toEqual({
      text: '{{baseUrl}}/x',
      cursor: 11
    })
  })
})

describe('suggestionEdit', () => {
  it('cubre desde las llaves de apertura hasta las de cierre existentes (body JSON)', () => {
    expect(suggestionEdit('{"a": "{{ba}}"}', 11, { start: 7, query: 'ba' }, 'baseUrl')).toEqual({
      from: 7,
      to: 13,
      insert: '{{baseUrl}}'
    })
  })

  it('funciona con las llaves que cierra solo el editor: {{|}}', () => {
    expect(suggestionEdit('{"a": "{{}}"}', 9, { start: 7, query: '' }, '$uuid')).toEqual({
      from: 7,
      to: 11,
      insert: '{{$uuid}}'
    })
  })
})
