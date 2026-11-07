import type { RunStatus } from './classify'

export type ResultFilter = 'all' | 'issues' | 'fail'

/** Resultados del runner que se muestran: filtrados por estado y, si se pide, de más lenta a más rápida */
export function visibleResults<T extends { status: RunStatus; timeMs: number }>(
  rows: T[],
  filter: ResultFilter,
  slowestFirst: boolean
): T[] {
  const kept =
    filter === 'all'
      ? rows
      : rows.filter((r) => (filter === 'fail' ? r.status === 'fail' : r.status !== 'pass'))
  return slowestFirst ? [...kept].sort((a, b) => b.timeMs - a.timeMs) : kept
}
