import type { AppSettings } from './types'

export const MIN_TIMEOUT_S = 1
export const MAX_TIMEOUT_S = 600
export const MIN_RETRIES = 0
export const MAX_RETRIES = 5
export const MIN_RETRY_DELAY_MS = 100
export const MAX_RETRY_DELAY_MS = 10000

export const DEFAULT_SETTINGS: AppSettings = {
  timeoutSeconds: 30,
  followRedirects: true,
  sslMode: 'auto',
  proxyUrl: '',
  retries: 0,
  retryDelayMs: 500,
  clientCertPath: '',
  clientKeyPath: '',
  clientCertHost: '',
  caCertPath: '',
  workspacePath: ''
}

const toInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
  return Math.min(max, Math.max(min, n))
}

const toText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Valida lo que viene de disco o de la interfaz: lo inválido vuelve a su valor por defecto */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  return {
    timeoutSeconds: toInt(
      r.timeoutSeconds,
      DEFAULT_SETTINGS.timeoutSeconds,
      MIN_TIMEOUT_S,
      MAX_TIMEOUT_S
    ),
    followRedirects:
      typeof r.followRedirects === 'boolean' ? r.followRedirects : DEFAULT_SETTINGS.followRedirects,
    sslMode:
      r.sslMode === 'verify' || r.sslMode === 'ignore' || r.sslMode === 'auto'
        ? r.sslMode
        : DEFAULT_SETTINGS.sslMode,
    proxyUrl: toText(r.proxyUrl),
    retries: toInt(r.retries, DEFAULT_SETTINGS.retries, MIN_RETRIES, MAX_RETRIES),
    retryDelayMs: toInt(
      r.retryDelayMs,
      DEFAULT_SETTINGS.retryDelayMs,
      MIN_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS
    ),
    clientCertPath: toText(r.clientCertPath),
    clientKeyPath: toText(r.clientKeyPath),
    clientCertHost: toText(r.clientCertHost).toLowerCase(),
    caCertPath: toText(r.caCertPath),
    workspacePath: toText(r.workspacePath)
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
