import { describe, expect, it } from 'vitest'
import { variableSource } from './varSource'
import type { Environment, EnvVariable } from './types'

const v = (key: string, enabled = true): EnvVariable => ({
  id: key,
  key,
  value: '1',
  secret: false,
  enabled
})

const env: Environment = { id: 'e', name: 'Dev', variables: [v('a'), v('off', false)] }
const collection = [
  { key: 'a', value: '2', enabled: true },
  { key: 'b', value: '2', enabled: true }
]
const globals = [v('a'), v('b'), v('c'), v(' d ')]

describe('variableSource', () => {
  it('prioriza entorno, luego colección y luego globales', () => {
    expect(variableSource('a', env, collection, globals)).toBe('environment')
    expect(variableSource('b', env, collection, globals)).toBe('collection')
    expect(variableSource('c', env, collection, globals)).toBe('global')
  })

  it('ignora variables desactivadas y reconoce claves con espacios', () => {
    expect(variableSource('off', env, collection, globals)).toBeNull()
    expect(variableSource('d', env, collection, globals)).toBe('global')
  })

  it('funciona sin entorno ni colección', () => {
    expect(variableSource('c', null, undefined, globals)).toBe('global')
    expect(variableSource('c', null, undefined, undefined)).toBeNull()
  })
})
