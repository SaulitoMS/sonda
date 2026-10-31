import type { RunStatus } from './classify'

export interface MonitorFailure {
  name: string
  detail: string
}

export interface MonitorRun {
  /** Momento en que empezó la comprobación (ms desde epoch) */
  at: number
  collection: string
  total: number
  pass: number
  warn: number
  fail: number
  timeMs: number
  failures: MonitorFailure[]
}

export const MAX_RUNS = 50
export const MIN_INTERVAL_MIN = 1
export const MAX_INTERVAL_MIN = 1440
const MAX_FAILURES_SAVED = 5

export const clampInterval = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, Math.round(value)))
    : MIN_INTERVAL_MIN

export function summarizeRun(input: {
  collection: string
  at?: number
  rows: { name: string; status: RunStatus; detail: string; timeMs: number }[]
  elapsedMs: number
}): MonitorRun {
  const { rows } = input
  return {
    at: input.at ?? Date.now(),
    collection: input.collection,
    total: rows.length,
    pass: rows.filter((r) => r.status === 'pass').length,
    warn: rows.filter((r) => r.status === 'warn').length,
    fail: rows.filter((r) => r.status === 'fail').length,
    timeMs: input.elapsedMs,
    failures: rows
      .filter((r) => r.status === 'fail')
      .slice(0, MAX_FAILURES_SAVED)
      .map((r) => ({ name: r.name, detail: r.detail }))
  }
}

/** Lo más reciente va primero; se conservan solo las últimas MAX_RUNS */
export const pushRun = (runs: MonitorRun[], run: MonitorRun): MonitorRun[] =>
  [run, ...runs].slice(0, MAX_RUNS)

/** % de comprobaciones sin ningún fallo. null si aún no hay ninguna */
export function uptime(runs: MonitorRun[]): number | null {
  if (runs.length === 0) return null
  return Math.round((runs.filter((r) => r.fail === 0).length / runs.length) * 100)
}

/** Solo avisa cuando cambia el estado (empieza a fallar o se recupera), no en cada comprobación */
export function decideNotification(
  prev: MonitorRun | null,
  next: MonitorRun
): { title: string; body: string } | null {
  const wasFailing = prev !== null && prev.fail > 0
  const isFailing = next.fail > 0

  if (isFailing && !wasFailing) {
    const first = next.failures[0]
    return {
      title: `Monitor: ${next.collection} falla`,
      body: `${next.fail} de ${next.total} peticiones fallaron.${first ? ` ${first.name}: ${first.detail}` : ''}`
    }
  }
  if (!isFailing && wasFailing) {
    return {
      title: `Monitor: ${next.collection} se recuperó`,
      body: `Las ${next.total} peticiones vuelven a pasar.`
    }
  }
  return null
}
