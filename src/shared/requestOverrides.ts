import type { RequestOverrides } from './types'

export const MAX_TIMEOUT_SECONDS = 600

/** Deja solo valores válidos (descarta lo que no sea un número 1–600 o un booleano) */
export function cleanOverrides(raw: unknown): RequestOverrides {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: RequestOverrides = {}
  if (typeof r.timeoutSeconds === 'number' && Number.isFinite(r.timeoutSeconds)) {
    const seconds = Math.round(r.timeoutSeconds)
    if (seconds >= 1) out.timeoutSeconds = Math.min(MAX_TIMEOUT_SECONDS, seconds)
  }
  if (typeof r.followRedirects === 'boolean') out.followRedirects = r.followRedirects
  return out
}

export const hasOverrides = (o: RequestOverrides | undefined): boolean =>
  !!o && (o.timeoutSeconds !== undefined || o.followRedirects !== undefined)
