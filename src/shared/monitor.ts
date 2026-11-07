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
const MAX_FAILURES_LISTED = 3

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

/**
 * Desde cuándo falla el monitor: la primera comprobación de la racha actual de fallos
 * (`runs` va con la más reciente primero). `complete` es false cuando la racha ocupa todo el
 * historial guardado, así que podría haber empezado antes. null si la última no falló.
 */
export function failingSince(runs: MonitorRun[]): { at: number; complete: boolean } | null {
  let since: number | null = null
  let streak = 0
  for (const r of runs) {
    if (r.fail === 0) break
    since = r.at
    streak++
  }
  if (since === null) return null
  return { at: since, complete: !(streak === runs.length && runs.length >= MAX_RUNS) }
}

/** 90 000 ms → "2 min"; 3 600 000 → "1 h"; mínimo 1 min */
export function formatDuration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60) return `${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return min % 60 ? `${hours} h ${min % 60} min` : `${hours} h`
  const days = Math.floor(hours / 24)
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`
}

/**
 * Solo avisa cuando cambia el estado (empieza a fallar o se recupera), no en cada comprobación.
 * `down` (ver `failingSince`) permite decir cuánto estuvo caída la colección al recuperarse.
 */
export function decideNotification(
  prev: MonitorRun | null,
  next: MonitorRun,
  down: { at: number; complete: boolean } | null = null
): { title: string; body: string } | null {
  const wasFailing = prev !== null && prev.fail > 0
  const isFailing = next.fail > 0

  if (isFailing && !wasFailing) {
    const listed = next.failures.slice(0, MAX_FAILURES_LISTED)
    const lines = listed.map((f) => `• ${f.name}: ${f.detail}`)
    const more = next.fail - listed.length
    return {
      title: `Monitor: ${next.collection} falla`,
      body:
        `${next.fail} de ${next.total} peticiones fallaron.` +
        (lines.length > 0 ? `\n${lines.join('\n')}` : '') +
        (more > 0 ? `\ny ${more} más.` : '')
    }
  }
  if (!isFailing && wasFailing) {
    const lasted = down ? formatDuration(next.at - down.at) : null
    return {
      title: `Monitor: ${next.collection} se recuperó`,
      body:
        `Las ${next.total} peticiones vuelven a pasar.` +
        (lasted ? ` Estuvo fallando ${down?.complete ? '' : 'al menos '}${lasted}.` : '')
    }
  }
  return null
}
