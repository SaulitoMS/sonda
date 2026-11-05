import { describe, expect, it } from 'vitest'
import { evaluateBenchmark, parseLimit, summarizeBenchmark, type BenchmarkRun } from './benchmark'

// 100 respuestas de 1 a 100 ms: p95 = 95, p99 = 99
const hundred: BenchmarkRun[] = Array.from({ length: 100 }, (_, i) => ({
  status: 200,
  timeMs: i + 1
}))

describe('summarizeBenchmark · p99', () => {
  it('calcula p95 y p99', () => {
    const s = summarizeBenchmark(hundred, 1000)
    expect(s.timing?.p95).toBe(95)
    expect(s.p99Ms).toBe(99)
  })

  it('sin respuestas no hay p99', () => {
    const s = summarizeBenchmark([{ status: null, timeMs: 0, error: 'timeout' }], 1000)
    expect(s.p99Ms).toBeNull()
    expect(s.timing).toBeNull()
  })
})

describe('evaluateBenchmark', () => {
  const summary = summarizeBenchmark(hundred, 1000)

  it('sin límites no revisa nada', () => {
    expect(evaluateBenchmark(summary, {})).toEqual([])
  })

  it('marca cuáles límites se cumplen y cuáles no', () => {
    const checks = evaluateBenchmark(summary, {
      maxP95Ms: 100,
      maxP99Ms: 98,
      minSuccessRate: 100
    })
    expect(checks.map((c) => c.passed)).toEqual([true, false, true])
    expect(checks[1].actual).toBe('99 ms')
  })

  it('el promedio se compara contra el límite', () => {
    const checks = evaluateBenchmark(summary, { maxAvgMs: 50 })
    expect(checks[0].passed).toBe(false)
    expect(checks[0].actual).toBe('51 ms')
  })

  it('la tasa de éxito cuenta los status >= 400 como fallos', () => {
    const s = summarizeBenchmark(
      [
        { status: 200, timeMs: 10 },
        { status: 200, timeMs: 10 },
        { status: 200, timeMs: 10 },
        { status: 500, timeMs: 10 }
      ],
      1000
    )
    const [rate] = evaluateBenchmark(s, { minSuccessRate: 90 })
    expect(rate.passed).toBe(false)
    expect(rate.actual).toBe('75%')
  })

  it('un límite de tiempo sin datos falla', () => {
    const s = summarizeBenchmark([{ status: null, timeMs: 0 }], 1000)
    const [p95] = evaluateBenchmark(s, { maxP95Ms: 500 })
    expect(p95.passed).toBe(false)
    expect(p95.actual).toBe('sin datos')
  })
})

describe('parseLimit', () => {
  it('convierte texto a número', () => {
    expect(parseLimit('500')).toBe(500)
    expect(parseLimit(' 99,5 ')).toBe(99.5)
    expect(parseLimit('0')).toBe(0)
  })

  it('vacío, negativo o inválido es "sin límite"', () => {
    expect(parseLimit('')).toBeUndefined()
    expect(parseLimit('abc')).toBeUndefined()
    expect(parseLimit('-5')).toBeUndefined()
  })
})
