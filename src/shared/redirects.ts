import type { RedirectHop } from './types'

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308])
export const MAX_REDIRECTS = 20

/** Headers que describen el body: si el body se descarta, estos también */
const BODY_HEADERS = [
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-location'
]

/** Credenciales que no deben viajar a otro sitio al seguir una redirección */
const CROSS_ORIGIN_STRIPPED = ['authorization', 'cookie', 'proxy-authorization']

type RequestBody = string | FormData

export interface FollowOptions {
  url: URL
  method: string
  headers: Headers
  body?: RequestBody
  /** false = devuelve la primera respuesta tal cual, aunque sea un 3xx */
  follow: boolean
  /** Una sola petición, sin seguir redirecciones por su cuenta (redirect: 'manual') */
  send: (
    url: URL,
    init: { method: string; headers: Headers; body?: RequestBody }
  ) => Promise<Response>
  /** Antes de cada petición, la primera incluida: aquí se ponen las cookies guardadas */
  beforeSend?: (url: URL, headers: Headers) => void
  /** Después de cada respuesta, también las intermedias: aquí se guardan sus cookies */
  afterResponse?: (url: URL, res: Response) => void
}

export interface FollowResult {
  res: Response
  /** URL de la que viene `res` (la final, si hubo redirecciones) */
  url: URL
  hops: RedirectHop[]
}

/**
 * Envía una petición y sigue las redirecciones a mano, una por una. A diferencia de
 * `redirect: 'follow'`, deja ver cada salto y permite guardar/enviar las cookies en cada uno
 * (un login suele fijar la sesión en una redirección intermedia).
 * Reglas como las de los navegadores: 303 (y 301/302 sobre POST) pasan a GET sin body;
 * 307/308 conservan método y body; al cambiar de sitio se quitan Authorization y Cookie.
 */
export async function sendFollowingRedirects(opts: FollowOptions): Promise<FollowResult> {
  let url = opts.url
  let method = opts.method
  let body = opts.body
  const headers = new Headers(opts.headers)
  const hops: RedirectHop[] = []

  for (;;) {
    opts.beforeSend?.(url, headers)
    const sentAt = performance.now()
    const res = await opts.send(url, { method, headers, ...(body !== undefined ? { body } : {}) })
    opts.afterResponse?.(url, res)

    const location = res.headers.get('location')
    if (!opts.follow || !REDIRECT_STATUS.has(res.status) || !location) return { res, url, hops }

    let next: URL
    try {
      next = new URL(location, url)
    } catch {
      return { res, url, hops }
    }
    if (next.protocol !== 'http:' && next.protocol !== 'https:') return { res, url, hops }

    await res.body?.cancel()
    if (hops.length >= MAX_REDIRECTS) {
      throw new Error(`Demasiadas redirecciones (más de ${MAX_REDIRECTS}). ¿Hay un bucle?`)
    }
    hops.push({
      status: res.status,
      url: url.href,
      location: next.href,
      timeMs: Math.round(performance.now() - sentAt),
      setCookies: res.headers.getSetCookie().length
    })

    const toGet =
      (res.status === 303 && method !== 'GET' && method !== 'HEAD') ||
      ((res.status === 301 || res.status === 302) && method === 'POST')
    if (toGet) {
      method = 'GET'
      body = undefined
      for (const name of BODY_HEADERS) headers.delete(name)
    }
    if (next.origin !== url.origin) {
      for (const name of CROSS_ORIGIN_STRIPPED) headers.delete(name)
    }
    url = next
  }
}
