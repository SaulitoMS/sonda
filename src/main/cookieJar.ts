interface StoredCookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  /** Marca de tiempo en ms. null = cookie de sesión */
  expiresAt: number | null
}

const jar = new Map<string, StoredCookie>()

const domainMatches = (host: string, domain: string): boolean =>
  host === domain || host.endsWith(`.${domain}`)

function defaultPath(pathname: string): string {
  if (!pathname.startsWith('/')) return '/'
  const i = pathname.lastIndexOf('/')
  return i <= 0 ? '/' : pathname.slice(0, i)
}

/** Guarda las cookies de los Set-Cookie de una respuesta */
export function storeCookies(url: URL, setCookies: string[]): void {
  const host = url.hostname.toLowerCase()

  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue

    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()

    let domain = host
    let hostOnly = true
    let path = defaultPath(url.pathname)
    let secure = false
    let maxAge: number | null = null
    let expires: number | null = null
    let rejected = false

    for (const attr of attrs) {
      const i = attr.indexOf('=')
      const key = (i === -1 ? attr : attr.slice(0, i)).trim().toLowerCase()
      const val = i === -1 ? '' : attr.slice(i + 1).trim()

      if (key === 'domain' && val) {
        const d = val.replace(/^\./, '').toLowerCase()
        if (domainMatches(host, d)) {
          domain = d
          hostOnly = false
        } else {
          rejected = true // un sitio no puede poner cookies de otro dominio
        }
      } else if (key === 'path' && val.startsWith('/')) {
        path = val
      } else if (key === 'secure') {
        secure = true
      } else if (key === 'max-age') {
        const n = Number.parseInt(val, 10)
        if (!Number.isNaN(n)) maxAge = n
      } else if (key === 'expires') {
        const t = Date.parse(val)
        if (!Number.isNaN(t)) expires = t
      }
    }
    if (rejected) continue

    // Max-Age tiene prioridad sobre Expires
    const expiresAt = maxAge !== null ? Date.now() + maxAge * 1000 : expires
    const id = `${domain}|${path}|${name}`

    if (expiresAt !== null && expiresAt <= Date.now()) {
      jar.delete(id) // el servidor está borrando la cookie
    } else {
      jar.set(id, { name, value, domain, hostOnly, path, secure, expiresAt })
    }
  }
}

/** Valor del header Cookie para una URL, o null si no hay cookies que enviar */
export function cookieHeaderFor(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  const now = Date.now()
  const matches: StoredCookie[] = []

  for (const [id, c] of jar) {
    if (c.expiresAt !== null && c.expiresAt <= now) {
      jar.delete(id)
      continue
    }
    if (c.hostOnly ? host !== c.domain : !domainMatches(host, c.domain)) continue
    if (c.secure && url.protocol !== 'https:') continue

    const base = c.path.endsWith('/') ? c.path : `${c.path}/`
    if (url.pathname !== c.path && !url.pathname.startsWith(base)) continue

    matches.push(c)
  }
  if (matches.length === 0) return null

  // Las rutas más específicas primero, como pide la RFC 6265
  matches.sort((a, b) => b.path.length - a.path.length)
  return matches.map((c) => `${c.name}=${c.value}`).join('; ')
}

export function clearCookies(): void {
  jar.clear()
}