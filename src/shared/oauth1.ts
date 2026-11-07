/** OAuth 1.0a (RFC 5849): firma una petición HTTP y devuelve el header Authorization */

export type OAuth1Method = 'HMAC-SHA1' | 'HMAC-SHA256' | 'PLAINTEXT'

export const OAUTH1_METHODS: OAuth1Method[] = ['HMAC-SHA1', 'HMAC-SHA256', 'PLAINTEXT']

export interface OAuth1Input {
  method: string
  /** URL final, con la query incluida */
  url: string
  /** Headers que se van a enviar (el Content-Type decide si el body entra en la firma) */
  headers: { key: string; value: string }[]
  /** Texto del body ('' si no hay) */
  body: string
  consumerKey: string
  consumerSecret: string
  /** Token de acceso. Vacío en la petición que obtiene el request token */
  token?: string
  tokenSecret?: string
  signatureMethod: OAuth1Method
  realm?: string
  /** Solo para pruebas */
  nonce?: string
  timestamp?: number
}

const enc = new TextEncoder()

/** Codificación RFC 3986: encodeURIComponent deja sin escapar ! ' ( ) * */
const rfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

/** Orden por código de byte (no por idioma), como pide la RFC */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const toBase64 = (buf: ArrayBuffer): string => {
  let binary = ''
  for (const b of new Uint8Array(buf)) binary += String.fromCharCode(b)
  return btoa(binary)
}

const randomNonce = (): string =>
  [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

async function hmac(hash: 'SHA-1' | 'SHA-256', key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash }, false, [
    'sign'
  ])
  return toBase64(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}

/** Parámetros que entran en la firma: query de la URL y body, solo si es x-www-form-urlencoded */
function requestParams(input: OAuth1Input, url: URL): [string, string][] {
  const params: [string, string][] = [...url.searchParams.entries()]
  const contentType =
    input.headers.find((h) => h.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? ''
  if (input.body && contentType.startsWith('application/x-www-form-urlencoded')) {
    params.push(...new URLSearchParams(input.body).entries())
  }
  return params
}

/** Devuelve el header Authorization que hay que agregar a la petición */
export async function signOAuth1(input: OAuth1Input): Promise<{ key: string; value: string }[]> {
  const url = new URL(input.url)

  const oauth: [string, string][] = [
    ['oauth_consumer_key', input.consumerKey],
    ['oauth_nonce', input.nonce ?? randomNonce()],
    ['oauth_signature_method', input.signatureMethod],
    ['oauth_timestamp', String(input.timestamp ?? Math.floor(Date.now() / 1000))],
    ['oauth_version', '1.0']
  ]
  if (input.token) oauth.push(['oauth_token', input.token])

  const signingKey = `${rfc3986(input.consumerSecret)}&${rfc3986(input.tokenSecret ?? '')}`

  let signature: string
  if (input.signatureMethod === 'PLAINTEXT') {
    signature = signingKey
  } else {
    // Se codifica cada clave y valor, y se ordena por clave codificada y luego por valor
    const paramString = [...requestParams(input, url), ...oauth]
      .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
      .sort((a, b) => compare(a[0], b[0]) || compare(a[1], b[1]))
      .map(([k, v]) => `${k}=${v}`)
      .join('&')

    // Sin query ni fragmento; origin ya baja el host a minúsculas y quita el puerto por defecto
    const baseUri = `${url.origin}${url.pathname}`
    const baseString = [input.method.toUpperCase(), baseUri, paramString].map(rfc3986).join('&')
    signature = await hmac(
      input.signatureMethod === 'HMAC-SHA256' ? 'SHA-256' : 'SHA-1',
      signingKey,
      baseString
    )
  }

  const fields: [string, string][] = [...oauth, ['oauth_signature', signature]]
  if (input.realm) fields.unshift(['realm', input.realm])
  const value = 'OAuth ' + fields.map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`).join(', ')
  return [{ key: 'Authorization', value }]
}
