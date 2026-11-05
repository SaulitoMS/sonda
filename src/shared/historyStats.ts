import type { HistoryEntry } from './history'

export interface EndpointStats {
  /** "GET /users/:id" (sin query; ids numéricos y UUID agrupados) */
  key: string
  method: string
  path: string
  count: number
  errors: number
  errorRate: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  lastAt: number
}

export type StatsSort = 'p95' | 'errors' | 'count'

/** Quita query/hash y agrupa segmentos variables: /users/42 y /users/7 → /users/:id */
export function endpointPath(url: string): string {
  let path = url
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/^\{\{[^}]*\}\}/, '')
  path = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
  if (!path.startsWith('/')) path = '/' + path
  const grouped = path
    .split('/')
    .map((seg) =>
      /^\d+$/.test(seg) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)
        ? ':id'
        : seg
    )
    .join('/')
  return grouped.length > 1 ? grouped.replace(/\/+$/, '') : grouped
}

/** Percentil por rango más cercano sobre una lista ya ordenada */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

const isError = (e: HistoryEntry): boolean => !e.response.ok || e.response.status >= 400

export function computeStats(entries: HistoryEntry[], sort: StatsSort = 'p95'): EndpointStats[] {
  const groups = new Map<string, HistoryEntry[]>()
  for (const e of entries) {
    const key = `${e.method} ${endpointPath(e.url)}`
    const list = groups.get(key)
    if (list) list.push(e)
    else groups.set(key, [e])
  }

  const out: EndpointStats[] = []
  for (const [key, list] of groups) {
    const times = list.map((e) => e.response.timeMs).sort((a, b) => a - b)
    const errors = list.filter(isError).length
    out.push({
      key,
      method: list[0].method,
      path: key.slice(list[0].method.length + 1),
      count: list.length,
      errors,
      errorRate: errors / list.length,
      avgMs: Math.round(times.reduce((s, t) => s + t, 0) / times.length),
      p50Ms: percentile(times, 50),
      p95Ms: percentile(times, 95),
      maxMs: times[times.length - 1],
      lastAt: Math.max(...list.map((e) => e.at))
    })
  }

  const by: Record<StatsSort, (a: EndpointStats, b: EndpointStats) => number> = {
    p95: (a, b) => b.p95Ms - a.p95Ms,
    errors: (a, b) => b.errorRate - a.errorRate || b.errors - a.errors,
    count: (a, b) => b.count - a.count
  }
  return out.sort(by[sort])
}
