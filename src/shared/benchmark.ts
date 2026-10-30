import { timingStats, type TimingStats } from './timing'

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

  const timing = timingStats(
    runs
      .filter((r) => r.status !== null)
      .map((r, i) => ({ name: `#${i + 1}`, timeMs: r.timeMs }))
  )

  return {
    total: runs.length,
    succeeded,
    failed: runs.length - succeeded,
    successRate: runs.length ? Math.round((succeeded / runs.length) * 1000) / 10 : 0,
    statusCounts,
    timing,
    elapsedMs,
    requestsPerSecond: elapsedMs > 0 ? Math.round((runs.length / (elapsedMs / 1000)) * 10) / 10 : 0,
    firstError: runs.find((r) => r.error)?.error
  }
}