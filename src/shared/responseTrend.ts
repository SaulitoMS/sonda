import type { HistoryEntry } from './history'

export interface TimeTrend {
  /** Tiempos en ms, del más antiguo al más reciente */
  times: number[]
  avg: number
  min: number
  max: number
  /** Cuánto se desvía el último de la media de los anteriores (0.4 = 40 % más lento). null si no se puede calcular */
  lastVsPrevious: number | null
}

/** Tendencia de tiempos de una misma petición (método + URL) según el historial. null si hay menos de 2 envíos */
export function timeTrend(
  entries: HistoryEntry[],
  method: string,
  url: string,
  limit = 20
): TimeTrend | null {
  const target = url.trim()
  const times = entries
    .filter((e) => e.response.ok && e.method === method && e.url === target)
    .slice(0, limit)
    .map((e) => e.response.timeMs)
    .reverse()

  if (times.length < 2) return null

  const previous = times.slice(0, -1)
  const previousAvg = previous.reduce((sum, t) => sum + t, 0) / previous.length
  const last = times[times.length - 1]

  return {
    times,
    avg: Math.round(times.reduce((sum, t) => sum + t, 0) / times.length),
    min: Math.min(...times),
    max: Math.max(...times),
    lastVsPrevious: previousAvg > 0 ? (last - previousAvg) / previousAvg : null
  }
}
