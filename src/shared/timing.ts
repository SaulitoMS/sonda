export interface TimingStats {
  count: number
  min: number
  max: number
  avg: number
  p50: number
  p95: number
  slowest: { name: string; timeMs: number }
}

/** Percentil por rango más cercano sobre una lista ya ordenada */
const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]

/**
 * Resume los tiempos de una ejecución. Ignora las peticiones con 0 ms
 * (las que fallaron antes de salir a la red), porque falsearían los promedios.
 */
export function timingStats(rows: { name: string; timeMs: number }[]): TimingStats | null {
  const valid = rows.filter((r) => r.timeMs > 0)
  if (valid.length === 0) return null

  const sorted = valid.map((r) => r.timeMs).sort((a, b) => a - b)
  const slowest = valid.reduce((a, b) => (b.timeMs > a.timeMs ? b : a))

  return {
    count: valid.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((sum, t) => sum + t, 0) / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    slowest: { name: slowest.name, timeMs: slowest.timeMs }
  }
}