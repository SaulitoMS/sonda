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
const SKIPPED_HEADERS = new Set(['content-length', 'host'])

/** Hoppscotch escribe <<variable>>; Sonda usa {{variable}} */
const convertVars = (text: string): string => text.replace(/<<\s*([\w.-]+)\s*>>/g, '{{$1}}')

/** Una colección de Hoppscotch: { v, name, folders: [...], requests: [{ endpoint, ... }] } */
function isCollection(x: unknown): x is Json {
  if (!isObj(x) || 'info' in x || typeof x.name !== 'string') return false
  if (!Array.isArray(x.requests)) return false
  if (typeof x.v !== 'number' && !Array.isArray(x.folders)) return false
  const folders = Array.isArray(x.folders) ? x.folders : []
  return (
    x.requests.every((r) => isObj(r) && typeof r.endpoint === 'string') &&
    folders.every(isCollection)
  )
}

/** Un export de Hoppscotch: una colección o un arreglo de colecciones */
export function looksLikeHoppscotch(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(isCollection)
  return isCollection(data)
}

/** undefined = hereda; null = sin autenticación */
function parseAuth(raw: unknown, warnings: string[]): AuthConfig | null | undefined {
  if (!isObj(raw)) return undefined
  const type = str(raw.authType)
  if (!type || type === 'inherit') return undefined
  if (type === 'none' || raw.authActive === false) return null

  const base = emptyAuth()
  switch (type) {
    case 'bearer':
      return { ...base, type: 'bearer', token: convertVars(str(raw.token)) }
    case 'basic':
      return {
        ...base,
        type: 'basic',
        username: convertVars(str(raw.username)),
        password: convertVars(str(raw.password))
      }
    case 'api-key':
      return {
        ...base,
        type: 'apikey',
        keyName: convertVars(str(raw.key)),
        keyValue: convertVars(str(raw.value)),
        keyIn: str(raw.addTo).toUpperCase() === 'QUERY_PARAMS' ? 'query' : 'header'
      }
    default:
      warnings.push(`Auth "${type}" no está soportada: se importó sin autenticación.`)
      return undefined
  }
}

const isActive = (x: Json): boolean => x.active !== false

function parseHeaders(raw: unknown): KeyValueData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is Json => isObj(h) && !!str(h.key).trim())
    .filter((h) => !SKIPPED_HEADERS.has(str(h.key).trim().toLowerCase()))
    .map((h) => ({
      key: str(h.key).trim(),
      value: convertVars(str(h.value)),
      enabled: isActive(h)
    }))
}

/** Hoppscotch guarda los query params aparte del endpoint: los activos se agregan al final */
function buildUrl(endpoint: string, params: unknown): string {
  const query = (Array.isArray(params) ? params : [])
    .filter((p): p is Json => isObj(p) && isActive(p) && !!str(p.key))
    .map((p) => `${str(p.key)}=${str(p.value)}`)
    .join('&')
  const url = convertVars(endpoint)
  if (!query) return url
  return url + (url.includes('?') ? '&' : '?') + convertVars(query)
}

/** urlencoded viene como texto "clave: valor" por línea; una línea con "//" delante está desactivada */
function parseUrlencodedText(text: string): FormFieldData[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const enabled = !line.startsWith('//')
      const content = enabled ? line : line.slice(2)
      const i = content.indexOf(':')
      const key = (i === -1 ? content : content.slice(0, i)).trim()
      const value = i === -1 ? '' : content.slice(i + 1).trim()
      return { key, value: convertVars(value), type: 'text' as const, enabled }
    })
    .filter((f) => f.key)
}

function parseFormFields(raw: unknown, warnings: string[], name: string): FormFieldData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Json => isObj(f) && !!str(f.key).trim())
    .map((f) => {
      const isFile = f.isFile === true || Array.isArray(f.value)
      if (isFile) {
        warnings.push(`"${name}": los archivos de form-data deben volver a seleccionarse.`)
      }
      return {
        key: str(f.key).trim(),
        value: isFile ? '' : convertVars(str(f.value)),
        type: isFile ? ('file' as const) : ('text' as const),
        enabled: isActive(f)
      }
    })
}

function parseBody(
  raw: unknown,
  name: string,
  warnings: string[]
): { body: string; contentType: string; bodyForm?: BodyFormData } {
  if (!isObj(raw)) return { body: '', contentType: '' }
  const contentType = str(raw.contentType).toLowerCase()
  if (!contentType) return { body: '', contentType: '' }

  if (contentType === 'application/x-www-form-urlencoded') {
    const fields = Array.isArray(raw.body)
      ? parseFormFields(raw.body, warnings, name)
      : parseUrlencodedText(str(raw.body))
    return { body: '', contentType, bodyForm: { mode: 'urlencoded', fields } }
  }
  if (contentType === 'multipart/form-data') {
    return {
      body: '',
      contentType,
      bodyForm: { mode: 'form-data', fields: parseFormFields(raw.body, warnings, name) }
    }
  }
  return { body: convertVars(str(raw.body)), contentType }
}

/** Convierte un export de Hoppscotch (JSON) en peticiones de Sonda */
export function parseHoppscotch(data: unknown): ParsedPostman {
  if (!looksLikeHoppscotch(data)) {
    throw new Error('El archivo no parece un export de Hoppscotch (JSON)')
  }
  const roots = (Array.isArray(data) ? data : [data]) as Json[]
  const warnings: string[] = []
  const requests: PostmanEndpoint[] = []
  const variables: { key: string; value: string }[] = []
  let withScripts = 0
  let withCollectionHeaders = 0

  const readVariables = (col: Json): void => {
    if (!Array.isArray(col.variables)) return
    for (const v of col.variables) {
      if (!isObj(v) || !str(v.key).trim()) continue
      const value = str(v.initialValue) || str(v.currentValue) || str(v.value)
      variables.push({ key: str(v.key).trim(), value })
    }
  }

  const walk = (col: Json, path: string[], inherited: AuthConfig | null): void => {
    const own = parseAuth(col.auth, warnings)
    const auth = own === undefined ? inherited : own
    if (Array.isArray(col.headers) && col.headers.length > 0) withCollectionHeaders++
    readVariables(col)

    for (const item of col.requests as Json[]) {
      const folder = path[0] ?? ''
      const rawName = str(item.name).trim() || 'Sin nombre'
      // Sonda soporta un nivel de carpetas: lo demás se aplana en el nombre
      const name = [...path.slice(1), rawName].join(' / ')

      const method = str(item.method).toUpperCase() || 'GET'
      if (!METHODS.has(method)) {
        warnings.push(`"${name}": el método ${method} no está soportado, se importó como GET.`)
      }

      const { body, contentType, bodyForm } = parseBody(item.body, name, warnings)
      const headers = parseHeaders(item.headers)
      const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
      if (body && contentType && !hasContentType) {
        headers.push({ key: 'Content-Type', value: contentType, enabled: true })
      }

      if (str(item.preRequestScript).trim() || str(item.testScript).trim()) withScripts++

      const own = parseAuth(item.auth, warnings)
      const requestAuth = own === undefined ? auth : own

      const request: SavedRequest = {
        name,
        method: (METHODS.has(method) ? method : 'GET') as HttpMethod,
        url: buildUrl(str(item.endpoint), item.params),
        headers,
        body,
        ...(bodyForm ? { bodyForm } : {}),
        ...(requestAuth ? { auth: requestAuth } : {})
      }
      requests.push({ folder, request })
    }

    for (const sub of (Array.isArray(col.folders) ? col.folders : []) as Json[]) {
      walk(sub, [...path, str(sub.name) || 'Carpeta'], auth)
    }
  }

  if (roots.length === 1) {
    walk(roots[0], [], null)
  } else {
    // Varias colecciones en un solo archivo: cada una queda como carpeta de primer nivel
    for (const root of roots) walk(root, [str(root.name) || 'Colección'], null)
  }

  if (withScripts > 0) {
    warnings.push(
      `${withScripts} petición(es) tenían scripts de Hoppscotch (pw.*); no se importaron, revísalas a mano.`
    )
  }
  if (withCollectionHeaders > 0) {
    warnings.push(
      `${withCollectionHeaders} colección(es) o carpeta(s) tenían headers propios; no se importaron, agrégalos como headers heredados.`
    )
  }

  return {
    name: roots.length === 1 ? str(roots[0].name).trim() || 'Hoppscotch' : 'Hoppscotch',
    variables,
    requests,
    warnings
  }
}
