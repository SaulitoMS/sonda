import { describe, expect, it } from 'vitest'
import { timestampHint } from './timestampHint'

describe('timestampHint', () => {
  it('reconoce segundos y milisegundos en campos de fecha', () => {
    expect(timestampHint(1700000000, 'created_at')).toContain('2023')
    expect(timestampHint(1700000000000, 'updatedAt')).toContain('2023')
    expect(timestampHint(1700000000, 'exp')).toContain('2023')
  })

  it('ignora campos que no parecen fechas', () => {
    expect(timestampHint(1700000000, 'id')).toBeNull()
    expect(timestampHint(1700000000, undefined)).toBeNull()
  })

  it('ignora números fuera de rango o no enteros', () => {
    expect(timestampHint(12345, 'created_at')).toBeNull()
    expect(timestampHint(1700000000.5, 'created_at')).toBeNull()
    expect(timestampHint(-5, 'created_at')).toBeNull()
  })
})
