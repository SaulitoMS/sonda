import type { AppSettings } from './types'

export const MIN_TIMEOUT_S = 1
export const MAX_TIMEOUT_S = 600

export const DEFAULT_SETTINGS: AppSettings = {
  timeoutSeconds: 30,
  followRedirects: true,
  sslMode: 'auto',
  proxyUrl: ''
}

/** Valida lo que viene de disco o de la interfaz: lo inválido vuelve a su valor por defecto */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const timeout =
    typeof r.timeoutSeconds === 'number' && Number.isFinite(r.timeoutSeconds)
      ? Math.round(r.timeoutSeconds)
      : DEFAULT_SETTINGS.timeoutSeconds

  return {
    timeoutSeconds: Math.min(MAX_TIMEOUT_S, Math.max(MIN_TIMEOUT_S, timeout)),
    followRedirects:
      typeof r.followRedirects === 'boolean' ? r.followRedirects : DEFAULT_SETTINGS.followRedirects,
    sslMode:
      r.sslMode === 'verify' || r.sslMode === 'ignore' || r.sslMode === 'auto'
        ? r.sslMode
        : DEFAULT_SETTINGS.sslMode,
    proxyUrl: typeof r.proxyUrl === 'string' ? r.proxyUrl.trim() : ''
  }
}

/** Mensaje de error si el proxy no es una URL http(s) válida; null si está bien o vacío */
export function proxyError(proxyUrl: string): string | null {
  if (!proxyUrl) return null
  try {
    const { protocol } = new URL(proxyUrl)
    return protocol === 'http:' || protocol === 'https:'
      ? null
      : 'El proxy debe empezar con http:// o https://'
  } catch {
    return 'URL de proxy inválida (ejemplo: http://localhost:8080)'
  }
}