export const POLL_MAX_ATTEMPTS = 100
export const POLL_MIN_INTERVAL_MS = 200
export const POLL_MAX_INTERVAL_MS = 60_000

export interface PollOptions {
  attempts: number
  intervalMs: number
}

/** Cómo terminó el polling */
export type PollEnd = 'met' | 'exhausted' | 'stopped'

export interface PollAttempt {
  n: number
  /** null si la petición no obtuvo respuesta */
  status: number | null
  timeMs: number
  met: boolean
  /** Valor encontrado o error, en texto corto */
  detail: string
}

const toInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

/** Deja intentos e intervalo dentro de los límites; lo inválido vuelve al valor por defecto */
export function normalizePoll(raw: { attempts?: unknown; intervalMs?: unknown }): PollOptions {
  return {
    attempts: toInt(raw.attempts, 10, 1, POLL_MAX_ATTEMPTS),
    intervalMs: toInt(raw.intervalMs, 2000, POLL_MIN_INTERVAL_MS, POLL_MAX_INTERVAL_MS)
  }
}

export function pollEndLabel(end: PollEnd, attempts: number): string {
  if (end === 'met') return `Condición cumplida en el intento ${attempts}`
  if (end === 'stopped') return `Detenido tras ${attempts} intento(s)`
  return `La condición no se cumplió en ${attempts} intento(s)`
}
