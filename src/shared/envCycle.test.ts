import { describe, expect, it } from 'vitest'
import { nextEnvironmentId } from './envCycle'

const envs = [{ id: 'dev' }, { id: 'stg' }, { id: 'prod' }]

describe('nextEnvironmentId', () => {
  it('avanza al siguiente entorno', () => {
    expect(nextEnvironmentId(envs, 'dev', 1)).toBe('stg')
    expect(nextEnvironmentId(envs, 'stg', 1)).toBe('prod')
  })

  it('después del último vuelve a "sin entorno" y luego al primero', () => {
    expect(nextEnvironmentId(envs, 'prod', 1)).toBeNull()
    expect(nextEnvironmentId(envs, null, 1)).toBe('dev')
  })

  it('retrocede de forma circular', () => {
    expect(nextEnvironmentId(envs, 'dev', -1)).toBeNull()
    expect(nextEnvironmentId(envs, null, -1)).toBe('prod')
    expect(nextEnvironmentId(envs, 'stg', -1)).toBe('dev')
  })

  it('sin entornos se queda en null', () => {
    expect(nextEnvironmentId([], null, 1)).toBeNull()
    expect(nextEnvironmentId([], null, -1)).toBeNull()
  })

  it('un activeId que ya no existe se trata como "sin entorno"', () => {
    expect(nextEnvironmentId(envs, 'borrado', 1)).toBe('dev')
  })
})
