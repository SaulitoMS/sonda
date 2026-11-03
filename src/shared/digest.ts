/** Autenticación HTTP Digest (RFC 2617 / 7616): MD5, MD5-sess, SHA-256 y SHA-256-sess con qop=auth */

export interface DigestChallenge {
  realm: string
  nonce: string
  opaque?: string
  /** Tal como lo mandó el servidor (MD5, SHA-256, ...) */
  algorithm: string
  /** Solo se soporta "auth". undefined = el servidor no pidió qop (RFC 2069) */
  qop?: 'auth'
}

// ---------- MD5 (Web Crypto no lo ofrece) ----------

const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
]
const K = Array.from(
  { length: 64 },
  (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0
)

export function md5Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (len * 8) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(len / 0x20000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let off = 0; off < padded.length; off += 64) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + view.getUint32(off + g * 4, true)) >>> 0
      a = d
      d = c
      c = b
      b = (b + ((f << SHIFTS[i]) | (f >>> (32 - SHIFTS[i])))) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const out = new DataView(new ArrayBuffer(16))
  out.setUint32(0, a0, true)
  out.setUint32(4, b0, true)
  out.setUint32(8, c0, true)
  out.setUint32(12, d0, true)
  return [...new Uint8Array(out.buffer)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// ---------- Desafío ----------

/** Lee el header WWW-Authenticate. null = no es Digest o usa algo que Sonda no soporta */
export function parseDigestChallenge(header: string): DigestChallenge | null {
  const m = /digest\s+(.*)$/is.exec(header)
  if (!m) return null

  const params: Record<string, string> = {}
  const re = /(\w+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g
  let p: RegExpExecArray | null
  while ((p = re.exec(m[1])) !== null) {
    params[p[1].toLowerCase()] = (p[2] ?? p[3] ?? '').replace(/\\(.)/g, '$1')
  }
  if (!params.nonce) return null

  const algorithm = params.algorithm || 'MD5'
  if (!/^(md5|sha-256)(-sess)?$/i.test(algorithm)) return null

  let qop: 'auth' | undefined
  if (params.qop) {
    const options = params.qop.split(',').map((q) => q.trim().toLowerCase())
    if (!options.includes('auth')) return null // solo auth-int: no soportado
    qop = 'auth'
  }

  return {
    realm: params.realm ?? '',
    nonce: params.nonce,
    ...(params.opaque ? { opaque: params.opaque } : {}),
    algorithm,
    ...(qop ? { qop } : {})
  }
}

/** Busca el desafío Digest entre los headers de una respuesta 401 */
export function findDigestChallenge(headers: Record<string, string>): DigestChallenge | null {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'www-authenticate') {
      const found = parseDigestChallenge(value)
      if (found) return found
    }
  }
  return null
}

// ---------- Respuesta ----------

const randomHex = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')

export interface DigestInput {
  challenge: DigestChallenge
  username: string
  password: string
  method: string
  /** Ruta con query, tal como va en la primera línea de la petición (/dir/index.html?a=1) */
  uri: string
  /** Solo para pruebas */
  cnonce?: string
  nc?: number
}

/** Valor del header Authorization para responder al desafío */
export async function buildDigestAuthorization(input: DigestInput): Promise<string> {
  const { challenge: c, username, password, method, uri } = input
  const sha = /^sha-256/i.test(c.algorithm)
  const sess = /-sess$/i.test(c.algorithm)
  const hash = (t: string): Promise<string> => (sha ? sha256Hex(t) : Promise.resolve(md5Hex(t)))

  const cnonce = input.cnonce ?? randomHex(8)
  const nc = (input.nc ?? 1).toString(16).padStart(8, '0')

  let ha1 = await hash(`${username}:${c.realm}:${password}`)
  if (sess) ha1 = await hash(`${ha1}:${c.nonce}:${cnonce}`)
  const ha2 = await hash(`${method.toUpperCase()}:${uri}`)
  const response = c.qop
    ? await hash(`${ha1}:${c.nonce}:${nc}:${cnonce}:${c.qop}:${ha2}`)
    : await hash(`${ha1}:${c.nonce}:${ha2}`)

  const q = (v: string): string => `"${v.replace(/(["\\])/g, '\\$1')}"`
  const parts = [
    `username=${q(username)}`,
    `realm=${q(c.realm)}`,
    `nonce=${q(c.nonce)}`,
    `uri=${q(uri)}`,
    `algorithm=${c.algorithm}`,
    `response=${q(response)}`
  ]
  if (c.opaque) parts.push(`opaque=${q(c.opaque)}`)
  if (c.qop) parts.push(`qop=${c.qop}`, `nc=${nc}`, `cnonce=${q(cnonce)}`)
  return `Digest ${parts.join(', ')}`
}
