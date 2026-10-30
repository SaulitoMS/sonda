import type { HttpMethod, SendRequestResult } from './types'

/** Métodos que se pueden repetir sin efectos secundarios (POST y PATCH no, para no duplicar datos) */
const IDEMPOTENT_METHODS: ReadonlySet<HttpMethod> = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'PUT',
  'DELETE'
])
const RETRYABLE_STATUS: ReadonlySet<number> = new Set([429, 502, 503, 504])
const NETWORK_ERROR =
  /fetch failed|tiempo límite|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR/i
const MAX_DELAY_MS = 10_000

/** ¿Vale la pena volver a intentar esta petición según su resultado? */
export function shouldRetry(method: HttpMethod, result: SendRequestResult): boolean {
  if (!IDEMPOTENT_METHODS.has(method)) return false
  return result.ok ? RETRYABLE_STATUS.has(result.status) : NETWORK_ERROR.test(result.error)
}

/** Espera antes del intento `attempt` (1, 2, 3…): Retry-After si existe; si no, backoff exponencial */
export function retryDelayMs(attempt: number, baseMs: number, result: SendRequestResult): number {
  if (result.ok) {
    const seconds = Number(result.headers['retry-after'])
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_DELAY_MS)
  }
  return Math.min(baseMs * 2 ** (attempt - 1), MAX_DELAY_MS)
}
