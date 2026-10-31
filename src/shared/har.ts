import { emptyAuth } from './auth'
import type { ParsedPostman, PostmanEndpoint } from './postman'
import type {
  AuthConfig,
  BodyFormData,
  FormFieldData,
  HttpMethod,
  KeyValueData,
  SavedRequest
} from './types'

type Json = Record<string, unknown>

const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const MAX_REQUESTS = 500

/** Headers que pone el navegador por su cuenta y no sirven para reproducir la petición */
const NOISE_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'accept-encoding',
  'priority',
  'upgrade-insecure-requests'
])

/** Respuestas que son recursos de la página y no llamadas a una API */
const STATIC_MIME =
  /^(?:image|font|audio|video)\/|text\/css|javascript|text\/html|application\/wasm/i

/** ¿Es un archivo HAR (lo que exporta el navegador desde Red → "Guardar todo como HAR")? */
export function looksLikeHar(data: unknown): boolean {
  return isObj(data) && isObj(data.log) && Array.isArray(data.log.entries)
}

function decodeBasic(encoded: string): { username: string; password: string } | null {
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    const text = new TextDecoder().decode(bytes)
    const colon = text.indexOf(':')
    return colon === -1 ? null : { username: text.slice(0, colon), password: text.slice(colon + 1) }
  } catch {
    return null
  }
}

function convertHeaders(raw: unknown): {
  headers: KeyValueData[]
  auth?: AuthConfig
  hadCookie: boolean
} {
  const headers: KeyValueData[] = []
  let auth: AuthConfig | undefined
  let hadCookie = false

  for (const h of Array.isArray(raw) ? raw : []) {
    if (!isObj(h)) continue
    const key = str(h.name).trim()
    const lower = key.toLowerCase()
    const value = str(h.value)
    if (!key || key.startsWith(':') || NOISE_HEADERS.has(lower) || lower.startsWith('sec-'))
      continue
    if (lower === 'cookie') {
      hadCookie = true
      continue
    }

    // Bearer y Basic pasan a la configuración de auth de Sonda en vez de quedar como header suelto
    if (lower === 'authorization' && !auth) {
      const match = /^(bearer|basic)\s+(.+)$/i.exec(value.trim())
      if (match?.[1].toLowerCase() === 'bearer') {
        auth = { ...emptyAuth(), type: 'bearer', token: match[2] }
        continue
      }
      const creds = match ? decodeBasic(match[2]) : null
      if (creds) {
        auth = { ...emptyAuth(), type: 'basic', ...creds }
        continue
      }
    }
    headers.push({ key, value, enabled: true })
  }
  return { headers, auth, hadCookie }
}

function convertBody(
  post: unknown,
  label: string,
  warnings: string[]
): { body: string; bodyForm?: BodyFormData } {
  if (!isObj(post)) return { body: '' }
  const mime = str(post.mimeType).toLowerCase()
  const text = str(post.text)
  const params = (Array.isArray(post.params) ? post.params : []).filter(isObj)

  if (mime.startsWith('application/x-www-form-urlencoded')) {
    const pairs = text
      ? [...new URLSearchParams(text)].map(([key, value]) => ({ key, value }))
      : params.map((p) => ({ key: str(p.name), value: str(p.value) }))
    const fields: FormFieldData[] = pairs
      .filter((p) => p.key)
      .map((p) => ({ ...p, type: 'text', enabled: true }))
    return { body: '', bodyForm: { mode: 'urlencoded', fields } }
  }

  if (mime.startsWith('multipart/form-data') && params.length > 0) {
    const fields: FormFieldData[] = params
      .filter((p) => str(p.name))
      .map((p) =>
        p.fileName !== undefined
          ? { key: str(p.name), value: '', type: 'file', enabled: true }
          : { key: str(p.name), value: str(p.value), type: 'text', enabled: true }
      )
    if (fields.some((f) => f.type === 'file')) {
      warnings.push(`"${label}": los archivos de form-data deben volver a seleccionarse.`)
    }
    return { body: '', bodyForm: { mode: 'form-data', fields } }
  }

  // JSON, XML, texto… (y multipart sin campos: el body crudo conserva su boundary)
  return { body: text }
}

/** ¿Es una llamada a una API? Chrome etiqueta cada entrada; en el resto se mira el tipo de respuesta */
function isApiCall(entry: Json, hasResourceTypes: boolean): boolean {
  if (hasResourceTypes) {
    const type = str(entry._resourceType).toLowerCase()
    return type === 'xhr' || type === 'fetch'
  }
  const response = isObj(entry.response) ? entry.response : {}
  const content = isObj(response.content) ? response.content : {}
  return !STATIC_MIME.test(str(content.mimeType))
}

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * Convierte un archivo HAR en peticiones de Sonda. Se queda solo con las llamadas a APIs
 * (XHR / fetch), junta las repetidas y, si todas van al mismo servidor, usa {{baseUrl}}.
 */
export function parseHar(data: unknown): ParsedPostman {
  if (!looksLikeHar(data)) throw new Error('El archivo no tiene formato HAR (falta log.entries)')
  const log = (data as { log: Json }).log
  const entries = (log.entries as unknown[]).filter(isObj)
  const hasResourceTypes = entries.some((e) => '_resourceType' in e)

  const warnings: string[] = []
  let staticSkipped = 0
  let badMethod = 0
  let duplicates = 0
  let hadCookie = false
  let hadToken = false
  const seen = new Set<string>()
  const found: { request: SavedRequest; url: URL }[] = []

  for (const entry of entries) {
    if (!isObj(entry.request)) continue
    if (!isApiCall(entry, hasResourceTypes)) {
      staticSkipped++
      continue
    }

    const req = entry.request
    const method = str(req.method).toUpperCase()
    const parsedUrl = parseUrl(str(req.url))
    if (!METHODS.has(method) || !parsedUrl) {
      badMethod++
      continue
    }

    const name = `${method} ${parsedUrl.pathname}`.slice(0, 80)
    const { headers, auth, hadCookie: cookie } = convertHeaders(req.headers)
    const { body, bodyForm } = convertBody(req.postData, name, warnings)

    const key = `${method} ${parsedUrl.href} ${body} ${JSON.stringify(bodyForm ?? null)}`
    if (seen.has(key)) {
      duplicates++
      continue
    }
    seen.add(key)

    hadCookie ||= cookie
    hadToken ||= !!auth
    found.push({
      url: parsedUrl,
      request: {
        name,
        method: method as HttpMethod,
        url: parsedUrl.href,
        headers,
        body,
        ...(bodyForm ? { bodyForm } : {}),
        ...(auth ? { auth } : {})
      }
    })
  }

  if (found.length === 0) {
    throw new Error(
      'El HAR no contiene llamadas a una API (XHR/fetch). Captura con la pestaña Red abierta.'
    )
  }
  if (found.length > MAX_REQUESTS) {
    warnings.push(
      `El HAR tiene ${found.length} peticiones: se importaron las primeras ${MAX_REQUESTS}.`
    )
    found.length = MAX_REQUESTS
  }

  // Un solo servidor → {{baseUrl}} (cambiar de entorno cambia todo); varios → una carpeta por servidor
  const origins = new Set(found.map((f) => f.url.origin))
  const single = origins.size === 1 ? [...origins][0] : null
  const requests: PostmanEndpoint[] = found.map(({ request, url }) => ({
    folder: single ? '' : url.host,
    request: single ? { ...request, url: request.url.replace(single, '{{baseUrl}}') } : request
  }))

  if (staticSkipped > 0) {
    warnings.push(
      `Se omitieron ${staticSkipped} recursos de la página (imágenes, estilos, scripts…).`
    )
  }
  if (badMethod > 0)
    warnings.push(`Se omitieron ${badMethod} peticiones con método o URL no válidos.`)
  if (duplicates > 0) warnings.push(`Se unieron ${duplicates} peticiones repetidas.`)
  if (hadCookie) {
    warnings.push(
      'Se omitió el header Cookie (guarda tu sesión). Si la API lo necesita, agrégalo a mano.'
    )
  }
  if (hadToken) {
    warnings.push(
      'Los tokens de Authorization se importaron tal cual: pásalos a variables antes de compartir la colección.'
    )
  }

  const pages = Array.isArray(log.pages) ? log.pages.filter(isObj) : []
  const title = pages.length > 0 ? str(pages[0].title).trim() : ''
  return {
    name: `HAR ${title || found[0].url.host}`.slice(0, 80),
    variables: single ? [{ key: 'baseUrl', value: single }] : [],
    requests,
    warnings
  }
}
