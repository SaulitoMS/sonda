import type { HttpMethod } from './types'

export interface CurlRequest {
  method: HttpMethod
  url: string
  headers: { key: string; value: string }[]
  body: string
}

export interface ParsedCurl extends CurlRequest {
  /** Cosas del comando que Sonda no soporta o ignoró */
  warnings: string[]
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

// Headers que calcula el motor de peticiones; copiarlos suele causar errores
const SKIPPED_HEADERS = new Set(['content-length', 'host'])

const LONG_WITH_VALUE = new Set([
  'request',
  'header',
  'data',
  'data-raw',
  'data-binary',
  'data-ascii',
  'data-urlencode',
  'user',
  'cookie',
  'user-agent',
  'referer',
  'url',
  'json',
  'form',
  'form-string',
  'output',
  'max-time',
  'connect-timeout',
  'proxy',
  'proxy-user',
  'cacert',
  'cert',
  'key',
  'retry',
  'write-out',
  'upload-file',
  'cookie-jar',
  'dump-header',
  'resolve',
  'limit-rate',
  'interface',
  'oauth2-bearer'
])

const SHORT_WITH_VALUE = 'XHdubAeFomxEwTKcDYyz'

const SHORT_TO_LONG: Record<string, string> = {
  X: 'request',
  H: 'header',
  d: 'data',
  u: 'user',
  b: 'cookie',
  A: 'user-agent',
  e: 'referer',
  F: 'form'
}

const SHORT_FLAGS: Record<string, string> = { G: 'get', I: 'head' }

export const looksLikeCurl = (text: string): boolean => /^\s*curl(\s|$)/i.test(text)

/* ---------- Tokenizador estilo shell ---------- */

/** Lee un string $'...' (el formato que usa Chrome al copiar como cURL) */
function readAnsiC(text: string, start: number): { value: string; end: number } {
  let out = ''
  let i = start
  while (i < text.length && text[i] !== "'") {
    if (text[i] === '\\' && i + 1 < text.length) {
      const n = text[i + 1]
      if (n === 'n') {
        out += '\n'
        i += 2
      } else if (n === 't') {
        out += '\t'
        i += 2
      } else if (n === 'r') {
        out += '\r'
        i += 2
      } else if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) {
        out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
        i += 6
      } else if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(text.slice(i + 2, i + 4))) {
        out += String.fromCharCode(parseInt(text.slice(i + 2, i + 4), 16))
        i += 4
      } else {
        out += n // \\ \' \"
        i += 2
      }
    } else {
      out += text[i]
      i++
    }
  }
  if (i >= text.length) throw new Error('Hay una comilla sin cerrar en el comando')
  return { value: out, end: i + 1 }
}

function tokenize(input: string): string[] {
  const text = input.replace(/\\\r?\n/g, ' ') // continuaciones de línea con \
  const tokens: string[] = []
  let cur = ''
  let has = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (c === "'") {
      const end = text.indexOf("'", i + 1)
      if (end === -1) throw new Error('Hay una comilla sin cerrar en el comando')
      cur += text.slice(i + 1, end)
      has = true
      i = end + 1
    } else if (c === '$' && text[i + 1] === "'") {
      const { value, end } = readAnsiC(text, i + 2)
      cur += value
      has = true
      i = end
    } else if (c === '"') {
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length && '"\\$`'.includes(text[i + 1])) {
          cur += text[i + 1]
          i += 2
        } else {
          cur += text[i]
          i++
        }
      }
      if (i >= text.length) throw new Error('Hay una comilla sin cerrar en el comando')
      has = true
      i++
    } else if (c === '\\') {
      if (i + 1 < text.length) {
        cur += text[i + 1]
        has = true
      }
      i += 2
    } else if (/\s/.test(c)) {
      if (has) {
        tokens.push(cur)
        cur = ''
        has = false
      }
      i++
    } else {
      cur += c
      has = true
      i++
    }
  }
  if (has) tokens.push(cur)
  return tokens
}

/* ---------- Utilidades ---------- */

const looksLikeJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function encodeUrlencodedField(value: string): string {
  const idx = value.indexOf('=')
  if (idx === -1) return encodeURIComponent(value)
  if (idx === 0) return encodeURIComponent(value.slice(1))
  return `${value.slice(0, idx)}=${encodeURIComponent(value.slice(idx + 1))}`
}

/* ---------- cURL → petición ---------- */

export function parseCurl(input: string): ParsedCurl {
  if (!looksLikeCurl(input)) throw new Error('El texto debe empezar con "curl"')

  const tokens = tokenize(input.trim())
  tokens.shift() // "curl"

  const warnings: string[] = []
  const headers: { key: string; value: string }[] = []
  const dataParts: string[] = []
  let url = ''
  let explicitMethod = ''
  let jsonBody: string | null = null
  let useGet = false
  let head = false
  let hasForm = false

  const addHeader = (key: string, value: string): void => {
    if (SKIPPED_HEADERS.has(key.toLowerCase())) {
      const label = key.toLowerCase() === 'host' ? 'Host' : 'Content-Length'
      const msg = `Se omitió el header ${label} (Sonda lo calcula solo)`
      if (!warnings.includes(msg)) warnings.push(msg)
      return
    }
    headers.push({ key, value })
  }

  const hasHeader = (name: string): boolean =>
    headers.some((h) => h.key.toLowerCase() === name.toLowerCase())

  const handleOption = (name: string, value: string): void => {
    switch (name) {
      case 'request':
        explicitMethod = value.toUpperCase()
        break
      case 'header': {
        const idx = value.indexOf(':')
        if (idx > 0) addHeader(value.slice(0, idx).trim(), value.slice(idx + 1).trim())
        break
      }
      case 'data':
      case 'data-ascii':
      case 'data-binary':
        if (value.startsWith('@'))
          warnings.push(`Se omitió el archivo ${value}: Sonda aún no envía archivos`)
        else dataParts.push(value)
        break
      case 'data-raw':
        dataParts.push(value)
        break
      case 'data-urlencode':
        dataParts.push(encodeUrlencodedField(value))
        break
      case 'json':
        jsonBody = value
        break
      case 'user':
        addHeader('Authorization', `Basic ${toBase64(value)}`)
        break
      case 'oauth2-bearer':
        addHeader('Authorization', `Bearer ${value}`)
        break
      case 'cookie':
        if (value.includes('=')) addHeader('Cookie', value)
        else warnings.push('Se omitió el archivo de cookies (-b)')
        break
      case 'user-agent':
        addHeader('User-Agent', value)
        break
      case 'referer':
        addHeader('Referer', value)
        break
      case 'url':
        url = value
        break
      case 'form':
      case 'form-string':
        hasForm = true
        break
      default:
        break // opciones sin efecto en Sonda (-o, --max-time, --proxy…)
    }
  }

  const handleFlag = (name: string): void => {
    if (name === 'get') useGet = true
    if (name === 'head') head = true
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]

    if (tok.startsWith('--') && tok.length > 2) {
      let name = tok.slice(2)
      let value: string | undefined
      const eq = name.indexOf('=')
      if (eq !== -1) {
        value = name.slice(eq + 1)
        name = name.slice(0, eq)
      }
      if (LONG_WITH_VALUE.has(name)) {
        if (value === undefined) value = tokens[++i]
        if (value === undefined) throw new Error(`Falta el valor de --${name}`)
        handleOption(name, value)
      } else {
        handleFlag(name)
      }
    } else if (tok.startsWith('-') && tok.length > 1) {
      for (let j = 1; j < tok.length; j++) {
        const ch = tok[j]
        if (SHORT_WITH_VALUE.includes(ch)) {
          let value = tok.slice(j + 1)
          if (!value) value = tokens[++i]
          if (value === undefined) throw new Error(`Falta el valor de -${ch}`)
          handleOption(SHORT_TO_LONG[ch] ?? ch, value)
          break
        }
        handleFlag(SHORT_FLAGS[ch] ?? ch)
      }
    } else if (!url) {
      url = tok
    }
  }

  if (!url) throw new Error('No encontré la URL en el comando')

  // curl asume http:// si no hay esquema (pero respetamos {{baseUrl}})
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith('{{')) url = `http://${url}`

  let body = jsonBody ?? dataParts.join('&')

  // -G manda los datos como query string en vez de body
  if (useGet && body && jsonBody === null) {
    url += (url.includes('?') ? '&' : '?') + body
    body = ''
  }

  if (hasForm) {
    warnings.push('Los formularios multipart (-F) aún no están soportados; se omitió el body')
  }

  if (jsonBody !== null) {
    if (!hasHeader('content-type')) headers.push({ key: 'Content-Type', value: 'application/json' })
    if (!hasHeader('accept')) headers.push({ key: 'Accept', value: 'application/json' })
  } else if (body && !hasHeader('content-type') && !looksLikeJson(body)) {
    // Lo que hace curl con -d; los bodies JSON los resuelve Sonda al enviar
    headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
  }

  let method = explicitMethod
  if (!method) method = head ? 'HEAD' : body || hasForm ? 'POST' : 'GET'
  if (!METHODS.has(method)) throw new Error(`Método HTTP no soportado: ${method}`)

  return { method: method as HttpMethod, url, headers, body, warnings }
}

/* ---------- Petición → cURL ---------- */

const quote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`

export function toCurl(req: CurlRequest): string {
  const lines: string[] = [req.method === 'HEAD' ? 'curl --head' : `curl --request ${req.method}`]

  lines.push(`--url ${quote(req.url)}`)
  for (const h of req.headers) lines.push(`--header ${quote(`${h.key}: ${h.value}`)}`)

  if (req.body.trim() && req.method !== 'GET' && req.method !== 'HEAD') {
    lines.push(`--data-raw ${quote(req.body)}`)
  }

  return lines.join(' \\\n  ')
}
