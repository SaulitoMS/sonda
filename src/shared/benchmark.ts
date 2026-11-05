import { percentile, timingStats, type TimingStats } from './timing'

/** Resultado de un envío. status = null si no hubo respuesta (error de red, timeout, variables sin definir) */
export interface BenchmarkRun {
  status: number | null
  timeMs: number
  error?: string
}

export interface BenchmarkSummary {
  total: number
  succeeded: number
  failed: number
  /** 0-100. Éxito = hubo respuesta con status menor a 400 */
  successRate: number
  /** Cantidad de respuestas por status ("200", "500", "Sin respuesta") */
  statusCounts: Record<string, number>
  /** Solo de las peticiones que obtuvieron respuesta */
  timing: TimingStats | null
  /** Percentil 99 de las peticiones que obtuvieron respuesta; null si no hay datos */
  p99Ms: number | null
  elapsedMs: number
  requestsPerSecond: number
  firstError?: string
}

export function summarizeBenchmark(runs: BenchmarkRun[], elapsedMs: number): BenchmarkSummary {
  const statusCounts: Record<string, number> = {}
  let succeeded = 0

  for (const r of runs) {
    const key = r.status === null ? 'Sin respuesta' : String(r.status)
    statusCounts[key] = (statusCounts[key] ?? 0) + 1
    if (r.status !== null && r.status < 400) succeeded++
  }

  const answered = runs.filter((r) => r.status !== null)
  const timing = timingStats(answered.map((r, i) => ({ name: `#${i + 1}`, timeMs: r.timeMs })))

  // Mismo criterio que timingStats: los 0 ms no salieron a la red y falsearían el percentil
  const sorted = answered
    .map((r) => r.timeMs)
    .filter((t) => t > 0)
    .sort((a, b) => a - b)

  return {
    total: runs.length,
    succeeded,
    failed: runs.length - succeeded,
    successRate: runs.length ? Math.round((succeeded / runs.length) * 1000) / 10 : 0,
    statusCounts,
    timing,
    p99Ms: sorted.length ? percentile(sorted, 99) : null,
    elapsedMs,
    requestsPerSecond: elapsedMs > 0 ? Math.round((runs.length / (elapsedMs / 1000)) * 10) / 10 : 0,
    firstError: runs.find((r) => r.error)?.error
  }
}

// ---------- Límites (pasa / falla) ----------

/** Cada límite es opcional: si no se define, no se revisa */
export interface BenchmarkLimits {
  maxAvgMs?: number
  maxP95Ms?: number
  maxP99Ms?: number
  /** 0-100 */
  minSuccessRate?: number
}

export interface BenchmarkCheck {
  label: string
  passed: boolean
  actual: string
}

/** Texto del input a número. Vacío o inválido = sin límite */
export function parseLimit(text: string): number | undefined {
  const t = text.trim().replace(',', '.')
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function evaluateBenchmark(
  summary: BenchmarkSummary,
  limits: BenchmarkLimits
): BenchmarkCheck[] {
  const checks: BenchmarkCheck[] = []

  const maxMs = (name: string, limit: number | undefined, actual: number | null): void => {
    if (limit === undefined) return
    checks.push({
      label: `${name} ≤ ${limit} ms`,
      passed: actual !== null && actual <= limit,
      actual: actual === null ? 'sin datos' : `${actual} ms`
    })
  }

  maxMs('Promedio', limits.maxAvgMs, summary.timing?.avg ?? null)
  maxMs('p95', limits.maxP95Ms, summary.timing?.p95 ?? null)
  maxMs('p99', limits.maxP99Ms, summary.p99Ms)

  if (limits.minSuccessRate !== undefined) {
    checks.push({
      label: `Éxito ≥ ${limits.minSuccessRate}%`,
      passed: summary.successRate >= limits.minSuccessRate,
      actual: `${summary.successRate}%`
    })
  }

  return checks
}
