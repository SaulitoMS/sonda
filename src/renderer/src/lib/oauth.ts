import { toBase64 } from '../../../shared/auth'

export interface OAuthParams {
  tokenUrl: string
  clientId: string
  clientSecret: string
  scope: string
}

export type OAuthTokenResult =
  { ok: true; token: string; cached: boolean } | { ok: false; error: string }

interface CachedToken {
  token: string
  expiresAt: number
}

/** Solo en memoria: al cerrar la app se descarta y se pide uno nuevo */
const cache = new Map<string, CachedToken>()

/** Margen para no usar un token que caduca mientras viaja la petición */
const SAFETY_MS = 30_000
/** Si el servidor no dice cuánto dura el token, se asume 1 hora */
const DEFAULT_TTL_S = 3600

const cacheKey = (p: OAuthParams): string =>
  JSON.stringify([p.tokenUrl, p.clientId, p.clientSecret, p.scope])

export function clearOAuthCache(): void {
  cache.clear()
}

/** Pide (o reutiliza) un access token con el flujo client credentials */
export async function getOAuthToken(p: OAuthParams): Promise<OAuthTokenResult> {
  if (!p.tokenUrl) return { ok: false, error: 'OAuth 2.0: falta la URL del token.' }
  if (!p.clientId) return { ok: false, error: 'OAuth 2.0: falta el Client ID.' }

  const key = cacheKey(p)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return { ok: true, token: hit.token, cached: true }

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  if (p.scope.trim()) body.set('scope', p.scope.trim())

  const res = await window.api.sendRequest({
    method: 'POST',
    url: p.tokenUrl,
    headers: [
      { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
      { key: 'Accept', value: 'application/json' },
      { key: 'Authorization', value: `Basic ${toBase64(`${p.clientId}:${p.clientSecret}`)}` }
    ],
    body: body.toString()
  })

  if (!res.ok) return { ok: false, error: `OAuth 2.0: no se pudo pedir el token (${res.error})` }

  let json: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(res.body)
    if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>
  } catch {
    // Se reporta abajo, junto con el status
  }

  const token = typeof json.access_token === 'string' ? json.access_token : ''
  if (res.status < 200 || res.status >= 300 || !token) {
    const detail =
      typeof json.error_description === 'string'
        ? json.error_description
        : typeof json.error === 'string'
          ? json.error
          : res.body.slice(0, 200) || res.statusText
    return {
      ok: false,
      error: `OAuth 2.0: el servidor respondió ${res.status}${detail ? ` · ${detail}` : ''}`
    }
  }

  const ttl = Number(json.expires_in)
  const ttlMs = (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_S) * 1000
  cache.set(key, { token, expiresAt: Date.now() + ttlMs - SAFETY_MS })
  return { ok: true, token, cached: false }
}
