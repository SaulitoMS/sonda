import { describe, expect, it } from 'vitest'
import type { EnvVariable, Environment } from './types'
import { buildVarMap, withGlobalVariables } from './variables'

const v = (key: string, value: string, extra: Partial<EnvVariable> = {}): EnvVariable => ({
  id: key,
  key,
  value,
  secret: false,
  enabled: true,
  ...extra
})

const env: Environment = { id: 'e', name: 'Dev', variables: [v('baseUrl', 'http://dev')] }

describe('withGlobalVariables', () => {
  it('el entorno gana a la global con la misma clave', () => {
    const map = buildVarMap(withGlobalVariables(env, [v('baseUrl', 'http://global')]))
    expect(map.baseUrl).toBe('http://dev')
  })

  it('agrega las globales que el entorno no define', () => {
    const map = buildVarMap(withGlobalVariables(env, [v('apiKey', 'abc')]))
    expect(map).toEqual({ baseUrl: 'http://dev', apiKey: 'abc' })
  })

  it('sin entorno activo, las globales bastan', () => {
    expect(buildVarMap(withGlobalVariables(null, [v('apiKey', 'abc')]))).toEqual({ apiKey: 'abc' })
  })

  it('ignora globales desactivadas o sin clave', () => {
    const globals = [v('a', '1', { enabled: false }), v('', 'x')]
    expect(withGlobalVariables(env, globals)).toBe(env)
  })

  it('conserva la marca de secreto', () => {
    const merged = withGlobalVariables(null, [v('token', 's3', { secret: true })])
    expect(merged?.variables[0].secret).toBe(true)
  })
})
