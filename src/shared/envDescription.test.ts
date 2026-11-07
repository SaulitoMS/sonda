import { describe, expect, it } from 'vitest'
import { exportEnvironment } from './envTransfer'
import type { Environment } from './types'

const env: Environment = {
  id: '1',
  name: 'dev',
  variables: [
    {
      id: 'a',
      key: 'baseUrl',
      value: 'http://x',
      secret: false,
      enabled: true,
      description: 'URL base del staging'
    },
    { id: 'b', key: 'token', value: '', secret: false, enabled: true }
  ]
}

describe('descripción de variables', () => {
  it('se exporta solo cuando existe', () => {
    const out = JSON.parse(exportEnvironment(env, false))
    expect(out.variables[0].description).toBe('URL base del staging')
    expect(out.variables[1]).not.toHaveProperty('description')
  })
})
