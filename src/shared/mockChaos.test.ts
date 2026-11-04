import { describe, expect, it } from 'vitest'
import { chaosDelay, chaosShouldFail, normalizeChaos, NO_CHAOS } from './mockChaos'

describe('normalizeChaos', () => {
  it('usa los valores por defecto si no hay nada válido', () => {
    expect(normalizeChaos(null)).toEqual(NO_CHAOS)
  })
  it('limita los rangos', () => {
    expect(
      normalizeChaos({ delayMs: 99999, jitterMs: -5, errorRate: 150, errorStatus: 200 })
    ).toEqual({ delayMs: 30000, jitterMs: 0, errorRate: 100, errorStatus: 400 })
  })
})

describe('chaosDelay', () => {
  const c = { ...NO_CHAOS, delayMs: 100, jitterMs: 50 }
  it('va de la base a la base más el jitter', () => {
    expect(chaosDelay(c, () => 0)).toBe(100)
    expect(chaosDelay(c, () => 0.999)).toBe(150)
  })
})

describe('chaosShouldFail', () => {
  it('0 % nunca falla y 100 % siempre falla', () => {
    expect(chaosShouldFail(NO_CHAOS, () => 0)).toBe(false)
    expect(chaosShouldFail({ ...NO_CHAOS, errorRate: 100 }, () => 0.999)).toBe(true)
  })
  it('respeta el porcentaje', () => {
    const c = { ...NO_CHAOS, errorRate: 30 }
    expect(chaosShouldFail(c, () => 0.29)).toBe(true)
    expect(chaosShouldFail(c, () => 0.3)).toBe(false)
  })
})
