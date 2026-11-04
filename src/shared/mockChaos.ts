/** Caos del servidor mock: latencia artificial y errores aleatorios para probar cómo reacciona un cliente */
export interface MockChaos {
  /** Espera base antes de responder (ms) */
  delayMs: number
  /** Variación aleatoria extra, de 0 a este valor (ms) */
  jitterMs: number
  /** Porcentaje de respuestas que fallan a propósito (0-100) */
  errorRate: number
  /** Status con el que fallan */
  errorStatus: number
}

export const NO_CHAOS: MockChaos = { delayMs: 0, jitterMs: 0, errorRate: 0, errorStatus: 500 }
export const MAX_CHAOS_DELAY_MS = 30_000
export const CHAOS_STATUSES = [500, 502, 503, 504, 429] as const

const toInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

/** Valida lo que llega de la interfaz: lo inválido vuelve a su valor por defecto */
export function normalizeChaos(raw: unknown): MockChaos {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    delayMs: toInt(r.delayMs, 0, 0, MAX_CHAOS_DELAY_MS),
    jitterMs: toInt(r.jitterMs, 0, 0, MAX_CHAOS_DELAY_MS),
    errorRate: toInt(r.errorRate, 0, 0, 100),
    errorStatus: toInt(r.errorStatus, 500, 400, 599)
  }
}

/** Cuánto esperar antes de responder (ms) */
export function chaosDelay(chaos: MockChaos, random: () => number = Math.random): number {
  return chaos.delayMs + Math.floor(random() * (chaos.jitterMs + 1))
}

/** ¿Esta respuesta debe fallar a propósito? */
export function chaosShouldFail(chaos: MockChaos, random: () => number = Math.random): boolean {
  return chaos.errorRate > 0 && random() * 100 < chaos.errorRate
}