import { describe, expect, it } from 'vitest'
import { timingBreakdown } from './timingBreakdown'

describe('timingBreakdown', () => {
  it('sin TTFB no desglosa', () => {
    expect(timingBreakdown(100, undefined)).toEqual([])
  })

  it('conexión nueva: DNS, TLS, espera y descarga suman el total', () => {
    const phases = timingBreakdown(300, 250, {
      dnsMs: 20,
      connectMs: 80,
      secure: true,
      reused: false
    })
    expect(phases.map((p) => p.id)).toEqual(['dns', 'connect', 'wait', 'download'])
    expect(phases.reduce((s, p) => s + p.ms, 0)).toBe(300)
    expect(phases[1].label).toBe('TCP + TLS')
  })

  it('conexión reutilizada: solo espera y descarga', () => {
    const phases = timingBreakdown(120, 100, {
      dnsMs: 0,
      connectMs: 0,
      secure: true,
      reused: true
    })
    expect(phases.map((p) => p.id)).toEqual(['wait', 'download'])
  })
})
