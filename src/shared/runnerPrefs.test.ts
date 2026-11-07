import { describe, expect, it } from 'vitest'
import { DEFAULT_RUNNER_PREFS, normalizeRunnerPrefs } from './runnerPrefs'

describe('normalizeRunnerPrefs', () => {
  it('usa los valores por defecto ante algo que no es un objeto', () => {
    expect(normalizeRunnerPrefs(null)).toEqual(DEFAULT_RUNNER_PREFS)
    expect(normalizeRunnerPrefs('x')).toEqual(DEFAULT_RUNNER_PREFS)
  })

  it('conserva lo válido y corrige lo inválido', () => {
    expect(
      normalizeRunnerPrefs({ stopOnFail: true, retries: 99, delayMs: -5, retryAny: 'sí' })
    ).toEqual({ ...DEFAULT_RUNNER_PREFS, stopOnFail: true, retries: 10, delayMs: 0 })
  })

  it('redondea los enteros', () => {
    expect(normalizeRunnerPrefs({ retries: 2.6 }).retries).toBe(3)
  })

  it('no guarda "incluir escrituras"', () => {
    expect('includeWrites' in normalizeRunnerPrefs({ includeWrites: true })).toBe(false)
  })
})
