/** AWS Signature Version 4: firma una petición HTTP con Access Key y Secret Key */

export interface SigV4Input {
  method: string
  /** URL final, con la query incluida */
  url: string
  /** Headers que se van a enviar (se firma Content-Type si existe) */
  headers: { key: string; value: string }[]
  /** Texto del body ('' si no hay) */
  body: string
  accessKey: string
  secretKey: string
  sessionToken?: string
  region: string
  service: string
  /** Solo para pruebas */
  now?: Date
}

const enc = new TextEncoder()

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)))

async function hmac(key: string | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? enc.encode(key) : key
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign'
  ])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

/** Codificación RFC 3986: encodeURIComponent deja sin escapar ! ' ( ) * */
const rfc3986 = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Devuelve los headers que hay que agregar a la petición (Authorization, X-Amz-Date, ...) */
export async function signAwsV4(input: SigV4Input): Promise<{ key: string; value: string }[]> {
  const url = new URL(input.url)
  const isS3 = input.service.toLowerCase() === 's3'

  const amzDate = (input.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(input.body)

  // S3 codifica cada segmento del path una vez; el resto de servicios, dos veces
  const canonicalUri =
    url.pathname
      .split('/')
      .map((seg) => {
        const once = rfc3986(safeDecode(seg))
        return isS3 ? once : rfc3986(once)
      })
      .join('/') || '/'

  const canonicalQuery = [...url.searchParams.entries()]
    .map(([k, v]) => [rfc3986(k), rfc3986(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  const signed = new Map<string, string>()
  signed.set('host', url.host)
  signed.set('x-amz-date', amzDate)
  if (input.sessionToken) signed.set('x-amz-security-token', input.sessionToken)
  if (isS3) signed.set('x-amz-content-sha256', payloadHash)
  const contentType = input.headers.find((h) => h.key.toLowerCase() === 'content-type')
  if (contentType) signed.set('content-type', contentType.value.trim().replace(/\s+/g, ' '))

  const names = [...signed.keys()].sort()
  const canonicalHeaders = names.map((n) => `${n}:${signed.get(n)}\n`).join('')
  const signedHeaders = names.join(';')

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n')

  const scope = `${dateStamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join(
    '\n'
  )

  const kDate = await hmac('AWS4' + input.secretKey, dateStamp)
  const kRegion = await hmac(kDate, input.region)
  const kService = await hmac(kRegion, input.service)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = toHex(await hmac(kSigning, stringToSign))

  const out = [
    { key: 'X-Amz-Date', value: amzDate },
    {
      key: 'Authorization',
      value: `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
    }
  ]
  if (input.sessionToken) out.push({ key: 'X-Amz-Security-Token', value: input.sessionToken })
  if (isS3) out.push({ key: 'X-Amz-Content-Sha256', value: payloadHash })
  return out
}
