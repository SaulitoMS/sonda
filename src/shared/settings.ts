import type { AppSettings } from './types'

export const MIN_TIMEOUT_S = 1
export const MAX_TIMEOUT_S = 600
export const MIN_RETRIES = 0
export const MAX_RETRIES = 5
export const MIN_RETRY_DELAY_MS = 100
export const MAX_RETRY_DELAY_MS = 10000
export const MIN_REDIRECT_LIMIT = 1
export const MAX_REDIRECT_LIMIT = 50
export const DEFAULT_USER_AGENT = 'Sonda/1.0'

export const DEFAULT_SETTINGS: AppSettings = {
  timeoutSeconds: 30,
  followRedirects: true,
  maxRedirects: 20,
  autoSave: false,
  sslMode: 'auto',
  proxyUrl: '',
  noProxy: '',
  retries: 0,
  retryDelayMs: 500,
  http2: false,
  clientCertPath: '',
  clientKeyPath: '',
  clientCertHost: '',
  caCertPath: '',
  userAgent: DEFAULT_USER_AGENT,
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
    maxRedirects: toInt(
      r.maxRedirects,
      DEFAULT_SETTINGS.maxRedirects,
      MIN_REDIRECT_LIMIT,
      MAX_REDIRECT_LIMIT
    ),
    autoSave: typeof r.autoSave === 'boolean' ? r.autoSave : DEFAULT_SETTINGS.autoSave,
    sslMode:
      r.sslMode === 'verify' || r.sslMode === 'ignore' || r.sslMode === 'auto'
        ? r.sslMode
        : DEFAULT_SETTINGS.sslMode,
    proxyUrl: toText(r.proxyUrl),
    noProxy: toText(r.noProxy),
    retries: toInt(r.retries, DEFAULT_SETTINGS.retries, MIN_RETRIES, MAX_RETRIES),
    retryDelayMs: toInt(
      r.retryDelayMs,
      DEFAULT_SETTINGS.retryDelayMs,
      MIN_RETRY_DELAY_MS,
      MAX_RETRY_DELAY_MS
    ),
    http2: typeof r.http2 === 'boolean' ? r.http2 : DEFAULT_SETTINGS.http2,
    clientCertPath: toText(r.clientCertPath),
    clientKeyPath: toText(r.clientKeyPath),
    clientCertHost: toText(r.clientCertHost).toLowerCase(),
    caCertPath: toText(r.caCertPath),
    userAgent:
      typeof r.userAgent === 'string' && !/[\r\n]/.test(r.userAgent)
        ? r.userAgent.trim()
        : DEFAULT_SETTINGS.userAgent,
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

/**
 * ¿Este host debe saltarse el proxy? La lista va separada por comas o espacios:
 * "example.com" (incluye subdominios), ".interna.local", "*.corp.net", "10.0.0.5" o "*" (todos).
 * No soporta rangos CIDR ni puertos.
 */
export function bypassesProxy(hostname: string, noProxy: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return noProxy
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') return true
      const domain = entry.replace(/^\*?\./, '')
      return host === domain || host.endsWith(`.${domain}`)
    })
}
