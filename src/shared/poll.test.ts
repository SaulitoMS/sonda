import { describe, expect, it } from 'vitest'
import { normalizePoll, pollEndLabel, POLL_MAX_ATTEMPTS, POLL_MIN_INTERVAL_MS } from './poll'

describe('normalizePoll', () => {
  it('usa valores por defecto si lo recibido no es válido', () => {
    expect(normalizePoll({ attempts: 'x', intervalMs: NaN })).toEqual({
      attempts: 10,
      intervalMs: 2000
    })
  })

  it('recorta a los límites', () => {
    expect(normalizePoll({ attempts: 9999, intervalMs: 1 })).toEqual({
      attempts: POLL_MAX_ATTEMPTS,
      intervalMs: POLL_MIN_INTERVAL_MS
    })
    expect(normalizePoll({ attempts: 0, intervalMs: 999999 }).attempts).toBe(1)
  })
})

describe('pollEndLabel', () => {
  it('describe cada final', () => {
    expect(pollEndLabel('met', 3)).toContain('intento 3')
    expect(pollEndLabel('stopped', 2)).toContain('Detenido')
    expect(pollEndLabel('exhausted', 5)).toContain('no se cumplió')
  })
})
