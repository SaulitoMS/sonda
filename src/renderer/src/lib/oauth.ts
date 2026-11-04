import { toBase64 } from '../../../shared/auth'

export type OAuthGrant = 'client_credentials' | 'password' | 'authorization_code'

export interface OAuthParams {
  grant: OAuthGrant
  tokenUrl: string
  clientId: string
  clientSecret: string
  scope: string
  /** Solo con el grant "password" */
  username: string
  password: string
  /** Solo con "authorization_code" */
  authUrl: string
  /** 0 = automático */
  redirectPort: number
}

export type OAuthTokenResult =
  { ok: true; token: string; cached: boolean } | { ok: false; error: string }

interface CachedToken {
  token: string
  expiresAt: number
  /** Para renovar sin volver a abrir el navegador (authorization_code) */
  refreshToken?: string
}

/** Solo en memoria: al cerrar la app se descarta y se pide uno nuevo */
const cache = new Map<string, CachedToken>()

/** Margen para no usar un token que caduca mientras viaja la petición */
const SAFETY_MS = 30_000
/** Si el servidor no dice cuánto dura el token, se asume 1 hora */
const DEFAULT_TTL_S = 3600

const cacheKey = (p: OAuthParams): string =>
  JSON.stringify([
    p.grant,
    p.tokenUrl,
    p.clientId,
    p.clientSecret,
    p.scope,
    p.username,
    p.password,
    p.authUrl,
    p.redirectPort
  ])

export function clearOAuthCache(): void {
  cache.clear()
}

type TokenReply =
  { ok: true; token: string; refreshToken?: string; ttlMs: number } | { ok: false; error: string }

/** Llama al endpoint del token y normaliza la respuesta */
async function requestToken(p: OAuthParams, body: URLSearchParams): Promise<TokenReply> {
  const headers: { key: string; value: string }[] = [
    { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    { key: 'Accept', value: 'application/json' }
  ]
  // Cliente público (authorization_code sin secreto): se identifica en el body, sin Basic
  if (p.grant === 'authorization_code' && !p.clientSecret) {
    body.set('client_id', p.clientId)
  } else {
    headers.push({
      key: 'Authorization',
      value: `Basic ${toBase64(`${p.clientId}:${p.clientSecret}`)}`
    })
  }

  const res = await window.api.sendRequest({
    method: 'POST',
    url: p.tokenUrl,
    headers,
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
  return {
    ok: true,
    token,
    refreshToken:
      typeof json.refresh_token === 'string' && json.refresh_token ? json.refresh_token : undefined,
    ttlMs: (Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_S) * 1000
  }
}

function remember(
  key: string,
  reply: Extract<TokenReply, { ok: true }>,
  previousRefresh?: string
): void {
  cache.set(key, {
    token: reply.token,
    expiresAt: Date.now() + reply.ttlMs - SAFETY_MS,
    // Algunos servidores no devuelven un refresh token nuevo al renovar: se conserva el anterior
    refreshToken: reply.refreshToken ?? previousRefresh
  })
}

/** Pide (o reutiliza) un access token con client credentials, password o authorization code */
export async function getOAuthToken(p: OAuthParams): Promise<OAuthTokenResult> {
  if (!p.tokenUrl) return { ok: false, error: 'OAuth 2.0: falta la URL del token.' }
  if (!p.clientId) return { ok: false, error: 'OAuth 2.0: falta el Client ID.' }
  if (p.grant === 'password' && !p.username) {
    return { ok: false, error: 'OAuth 2.0: falta el usuario.' }
  }
  if (p.grant === 'authorization_code' && !p.authUrl) {
    return { ok: false, error: 'OAuth 2.0: falta la URL de autorización.' }
  }

  const key = cacheKey(p)
  const hit = cache.get(key)
  if (hit && hit.expiresAt > Date.now()) return { ok: true, token: hit.token, cached: true }

  // Token caducado pero con refresh token: se renueva sin abrir el navegador
  if (p.grant === 'authorization_code' && hit?.refreshToken) {
    const refreshed = await requestToken(
      p,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: hit.refreshToken })
    )
    if (refreshed.ok) {
      remember(key, refreshed, hit.refreshToken)
      return { ok: true, token: refreshed.token, cached: false }
    }
    // El refresh token ya no sirve: se vuelve a iniciar sesión
    cache.delete(key)
  }

  let body: URLSearchParams
  if (p.grant === 'authorization_code') {
    const auth = await window.api.oauthAuthorize({
      authUrl: p.authUrl,
      clientId: p.clientId,
      scope: p.scope.trim(),
      port: p.redirectPort
    })
    if (!auth.ok) return { ok: false, error: `OAuth 2.0: ${auth.error}` }
    body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: auth.code,
      redirect_uri: auth.redirectUri,
      code_verifier: auth.verifier
    })
  } else {
    body = new URLSearchParams({ grant_type: p.grant })
    if (p.grant === 'password') {
      body.set('username', p.username)
      body.set('password', p.password)
    }
    if (p.scope.trim()) body.set('scope', p.scope.trim())
  }

  const reply = await requestToken(p, body)
  if (!reply.ok) return reply

  remember(key, reply)
  return { ok: true, token: reply.token, cached: false }
}
