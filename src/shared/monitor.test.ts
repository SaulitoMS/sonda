import { describe, expect, it } from 'vitest'
import {
  clampInterval,
  decideNotification,
  failingSince,
  formatDuration,
  MAX_RUNS,
  pushRun,
  summarizeRun,
  uptime,
  type MonitorRun
} from './monitor'

const run = (over: Partial<MonitorRun> = {}): MonitorRun => ({
  at: 1,
  collection: 'API',
  total: 3,
  pass: 3,
  warn: 0,
  fail: 0,
  timeMs: 100,
  failures: [],
  ...over
})

describe('summarizeRun', () => {
  it('cuenta por estado y guarda los fallos', () => {
    const r = summarizeRun({
      collection: 'API',
      at: 42,
      elapsedMs: 250,
      rows: [
        { name: 'a', status: 'pass', detail: '', timeMs: 10 },
        { name: 'b', status: 'warn', detail: 'sin schema', timeMs: 10 },
        { name: 'c', status: 'fail', detail: 'HTTP 500', timeMs: 10 }
      ]
    })
    expect(r).toEqual({
      at: 42,
      collection: 'API',
      total: 3,
      pass: 1,
      warn: 1,
      fail: 1,
      timeMs: 250,
      failures: [{ name: 'c', detail: 'HTTP 500' }]
    })
  })

  it('guarda como mucho 5 fallos pero cuenta todos', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      name: `r${i}`,
      status: 'fail' as const,
      detail: 'x',
      timeMs: 1
    }))
    const r = summarizeRun({ collection: 'API', rows, elapsedMs: 1 })
    expect(r.fail).toBe(8)
    expect(r.failures).toHaveLength(5)
  })
})

describe('pushRun', () => {
  it('pone lo más reciente primero y limita el historial', () => {
    let runs: MonitorRun[] = []
    for (let i = 0; i < MAX_RUNS + 10; i++) runs = pushRun(runs, run({ at: i }))
    expect(runs).toHaveLength(MAX_RUNS)
    expect(runs[0].at).toBe(MAX_RUNS + 9)
  })
})

describe('uptime', () => {
  it('es null sin comprobaciones', () => {
    expect(uptime([])).toBeNull()
  })

  it('porcentaje de comprobaciones sin fallos', () => {
    expect(uptime([run(), run(), run({ fail: 1 }), run()])).toBe(75)
    expect(uptime([run({ fail: 2 })])).toBe(0)
  })
})

describe('clampInterval', () => {
  it('acota a 1..1440 y redondea', () => {
    expect(clampInterval(0)).toBe(1)
    expect(clampInterval(5.6)).toBe(6)
    expect(clampInterval(99999)).toBe(1440)
    expect(clampInterval(Number.NaN)).toBe(1)
  })
})

describe('decideNotification', () => {
  const failing = run({ fail: 1, pass: 2, failures: [{ name: 'Login', detail: 'HTTP 500' }] })

  it('avisa cuando empieza a fallar, con el primer fallo', () => {
    const n = decideNotification(run(), failing)
    expect(n?.title).toContain('falla')
    expect(n?.body).toContain('1 de 3')
    expect(n?.body).toContain('Login: HTTP 500')
  })

  it('avisa si la primera comprobación ya falla', () => {
    expect(decideNotification(null, failing)).not.toBeNull()
  })

  it('avisa cuando se recupera', () => {
    expect(decideNotification(failing, run())?.title).toContain('se recuperó')
  })

  it('no repite el aviso mientras el estado no cambia', () => {
    expect(decideNotification(failing, failing)).toBeNull()
    expect(decideNotification(run(), run())).toBeNull()
    expect(decideNotification(null, run())).toBeNull()
  })

  it('los warnings no cuentan como fallo', () => {
    expect(decideNotification(run(), run({ warn: 2, pass: 1 }))).toBeNull()
  })
})

describe('decideNotification: detalle del aviso', () => {
  const fails = (n: number): { name: string; detail: string }[] =>
    Array.from({ length: n }, (_, i) => ({ name: `R${i + 1}`, detail: `HTTP 50${i}` }))

  it('lista hasta 3 fallos y cuenta el resto', () => {
    const n = decideNotification(run(), run({ fail: 5, pass: 0, total: 5, failures: fails(5) }))
    expect(n?.body).toContain('• R1: HTTP 500')
    expect(n?.body).toContain('• R3: HTTP 502')
    expect(n?.body).not.toContain('R4')
    expect(n?.body).toContain('y 2 más.')
  })

  it('al recuperarse dice cuánto estuvo fallando', () => {
    const n = decideNotification(run({ fail: 1 }), run({ at: 10 * 60_000 }), {
      at: 60_000,
      complete: true
    })
    expect(n?.body).toContain('Estuvo fallando 9 min.')
  })

  it('si la racha podría ser más larga, dice "al menos"', () => {
    const n = decideNotification(run({ fail: 1 }), run({ at: 10 * 60_000 }), {
      at: 60_000,
      complete: false
    })
    expect(n?.body).toContain('Estuvo fallando al menos 9 min.')
  })

  it('sin dato de caída no menciona el tiempo', () => {
    expect(decideNotification(run({ fail: 1 }), run())?.body).not.toContain('Estuvo')
  })
})

describe('failingSince', () => {
  it('devuelve el inicio de la racha actual', () => {
    const runs = [run({ at: 3, fail: 1 }), run({ at: 2, fail: 1 }), run({ at: 1 })]
    expect(failingSince(runs)).toEqual({ at: 2, complete: true })
  })

  it('es null si la última comprobación pasó o no hay historial', () => {
    expect(failingSince([run()])).toBeNull()
    expect(failingSince([])).toBeNull()
  })

  it('marca incompleta la racha que ocupa todo el historial', () => {
    const runs = Array.from({ length: MAX_RUNS }, (_, i) => run({ at: MAX_RUNS - i, fail: 1 }))
    expect(failingSince(runs)?.complete).toBe(false)
  })
})

describe('formatDuration', () => {
  it('formatea minutos, horas y días', () => {
    expect(formatDuration(0)).toBe('1 min')
    expect(formatDuration(90_000)).toBe('2 min')
    expect(formatDuration(3_600_000)).toBe('1 h')
    expect(formatDuration(3_660_000)).toBe('1 h 1 min')
    expect(formatDuration(86_400_000)).toBe('1 d')
    expect(formatDuration(90_000_000)).toBe('1 d 1 h')
  })
})
