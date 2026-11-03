export type SecuritySeverity = 'high' | 'medium' | 'low'

export interface SecurityFinding {
  id: string
  severity: SecuritySeverity
  title: string
  detail: string
}

export interface SecurityInput {
  url: string
  headers: Record<string, string>
  body: string
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i
const SESSION_NAME = /sess|sid|token|auth|jwt/i
const MAX_SCAN = 200_000

const LEAK_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /at\s+[\w$.<>]+\s+\((?:[A-Za-z]:)?[^()\s]+:\d+:\d+\)/, label: 'stack trace de Node.js' },
  { re: /Traceback \(most recent call last\)/, label: 'traceback de Python' },
  { re: /\bat\s+[\w$.]+\([\w$]+\.java:\d+\)/, label: 'stack trace de Java' },
  { re: /System\.[A-Za-z.]*Exception/, label: 'excepción de .NET' },
  {
    re: /SQLSTATE|syntax error at or near|ORA-\d{5}|You have an error in your SQL/i,
    label: 'error de SQL'
  }
]

const SECRET_KEY = /"(password|passwd|pwd|secret|client_secret|private_?key)"\s*:\s*"[^"]{3,}"/i

const ORDER: Record<SecuritySeverity, number> = { high: 0, medium: 1, low: 2 }

function parseUrl(raw: string): URL | null {
  if (!/^https?:\/\//i.test(raw)) return null // por ejemplo "{{baseUrl}}/users": no se puede saber
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

export function checkSecurity(input: SecurityInput): SecurityFinding[] {
  const out: SecurityFinding[] = []
  const h = input.headers
  const url = parseUrl(input.url)
  const isHttps = url?.protocol === 'https:'
  const isLocal = url ? LOCAL_HOST.test(url.hostname) : false
  const contentType = (h['content-type'] ?? '').toLowerCase()
  const add = (f: SecurityFinding): void => {
    out.push(f)
  }

  // Transporte
  if (url && !isHttps && !isLocal) {
    add({
      id: 'no-https',
      severity: 'high',
      title: 'La petición va por HTTP sin cifrar',
      detail: 'Cualquiera en la red puede leer o modificar el tráfico. Usa HTTPS.'
    })
  }
  if (isHttps && !h['strict-transport-security']) {
    add({
      id: 'no-hsts',
      severity: 'low',
      title: 'Falta Strict-Transport-Security (HSTS)',
      detail: 'Sin este header el navegador puede intentar conectar por HTTP la primera vez.'
    })
  }

  // CORS
  const origin = h['access-control-allow-origin']
  const credentials = (h['access-control-allow-credentials'] ?? '').toLowerCase() === 'true'
  if (origin === '*' && credentials) {
    add({
      id: 'cors-wildcard-credentials',
      severity: 'high',
      title: 'CORS: "*" junto con credenciales',
      detail:
        'Access-Control-Allow-Origin es "*" y Allow-Credentials es true. Es una mala configuración.'
    })
  } else if (origin === '*') {
    add({
      id: 'cors-wildcard',
      severity: 'low',
      title: 'CORS abierto a cualquier origen',
      detail: 'Está bien para APIs públicas; revísalo si esta API devuelve datos privados.'
    })
  }

  // Información que sobra
  if (h['x-powered-by']) {
    add({
      id: 'x-powered-by',
      severity: 'low',
      title: `Expone la tecnología: X-Powered-By: ${h['x-powered-by']}`,
      detail: 'Le da pistas a un atacante. Conviene quitar este header.'
    })
  }
  if (h['server'] && /\d+\.\d+/.test(h['server'])) {
    add({
      id: 'server-version',
      severity: 'low',
      title: `Expone la versión del servidor: ${h['server']}`,
      detail: 'Publicar la versión facilita buscar vulnerabilidades conocidas.'
    })
  }
  if (!/nosniff/i.test(h['x-content-type-options'] ?? '')) {
    add({
      id: 'no-nosniff',
      severity: 'low',
      title: 'Falta X-Content-Type-Options: nosniff',
      detail: 'El navegador podría interpretar la respuesta con otro tipo del declarado.'
    })
  }
  if (contentType.includes('text/html') && !h['content-security-policy'] && !h['x-frame-options']) {
    add({
      id: 'no-framing-protection',
      severity: 'low',
      title: 'Página HTML sin Content-Security-Policy ni X-Frame-Options',
      detail: 'Podría incrustarse en un iframe ajeno (clickjacking).'
    })
  }

  // Cookies (el main las junta con saltos de línea)
  const cookies = (h['set-cookie'] ?? '').split('\n').filter((c) => c.trim())
  for (const raw of cookies) {
    const [pair, ...attrs] = raw.split(';')
    const name = pair.split('=')[0].trim()
    const keys = new Set(attrs.map((a) => a.split('=')[0].trim().toLowerCase()))
    const sensitive = SESSION_NAME.test(name)

    if (!keys.has('httponly')) {
      add({
        id: `cookie-httponly-${name}`,
        severity: sensitive ? 'medium' : 'low',
        title: `Cookie "${name}" sin HttpOnly`,
        detail: 'JavaScript de la página puede leerla, y un XSS podría robarla.'
      })
    }
    if (isHttps && !keys.has('secure')) {
      add({
        id: `cookie-secure-${name}`,
        severity: sensitive ? 'medium' : 'low',
        title: `Cookie "${name}" sin Secure`,
        detail: 'Puede viajar por conexiones HTTP sin cifrar.'
      })
    }
    if (!keys.has('samesite')) {
      add({
        id: `cookie-samesite-${name}`,
        severity: 'low',
        title: `Cookie "${name}" sin SameSite`,
        detail: 'Sin SameSite queda más expuesta a ataques CSRF.'
      })
    }
  }

  // Body
  const body = input.body.slice(0, MAX_SCAN)
  for (const { re, label } of LEAK_PATTERNS) {
    if (re.test(body)) {
      add({
        id: `leak-${label}`,
        severity: 'high',
        title: `El body filtra un ${label}`,
        detail: 'Los errores internos no deberían llegar al cliente: revelan rutas y librerías.'
      })
      break
    }
  }
  const secret = body.match(SECRET_KEY)
  if (secret) {
    add({
      id: 'secret-in-body',
      severity: 'high',
      title: `El JSON incluye el campo "${secret[1]}" con valor`,
      detail:
        'Comprueba que sea intencional: una API normal no devuelve contraseñas ni claves privadas.'
    })
  }

  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity])
}
