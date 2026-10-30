import { emptyAuth } from './auth'
import type {
  AuthConfig,
  BodyFormData,
  FormFieldData,
  HttpMethod,
  KeyValueData,
  SavedRequest
} from './types'

export interface PostmanEndpoint {
  /** Carpeta de primer nivel ('' = raíz de la colección) */
  folder: string
  request: SavedRequest
}

export interface ParsedPostman {
  name: string
  variables: { key: string; value: string }[]
  requests: PostmanEndpoint[]
  /** Cosas que Sonda no soporta o ignoró */
  warnings: string[]
}

type Json = Record<string, unknown>

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
const SKIPPED_HEADERS = new Set(['content-length', 'host'])

const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

/** Postman guarda auth como [{key, value}] (v2.1) o como objeto plano (v2.0) */
function authValue(block: unknown, key: string): string {
  if (Array.isArray(block)) {
    const found = block.find((e) => isObj(e) && e.key === key)
    return isObj(found) ? str(found.value) : ''
  }
  return isObj(block) ? str(block[key]) : ''
}

/** undefined = sin auth propia (hereda); null = explícitamente sin auth */
function parseAuth(raw: unknown, warnings: string[]): AuthConfig | null | undefined {
  if (!isObj(raw)) return undefined
  const type = str(raw.type)
  const base = emptyAuth()

  switch (type) {
    case 'noauth':
      return null
    case 'bearer':
      return { ...base, type: 'bearer', token: authValue(raw.bearer, 'token') }
    case 'basic':
      return {
        ...base,
        type: 'basic',
        username: authValue(raw.basic, 'username'),
        password: authValue(raw.basic, 'password')
      }
    case 'apikey':
      return {
        ...base,
        type: 'apikey',
        keyName: authValue(raw.apikey, 'key'),
        keyValue: authValue(raw.apikey, 'value'),
        keyIn: authValue(raw.apikey, 'in') === 'query' ? 'query' : 'header'
      }
    default:
      if (type) warnings.push(`Auth "${type}" no está soportada: se importó sin autenticación.`)
      return undefined
  }
}

function parseUrl(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (!isObj(raw)) return ''
  if (typeof raw.raw === 'string' && raw.raw) return raw.raw

  const host = Array.isArray(raw.host) ? raw.host.join('.') : str(raw.host)
  const path = Array.isArray(raw.path) ? raw.path.join('/') : str(raw.path)
  const query = (Array.isArray(raw.query) ? raw.query : [])
    .filter((q): q is Json => isObj(q) && q.disabled !== true && !!str(q.key))
    .map((q) => `${str(q.key)}=${str(q.value)}`)
    .join('&')
  const protocol = str(raw.protocol)

  return (
    (protocol ? `${protocol}://` : '') +
    host +
    (path ? `/${path}` : '') +
    (query ? `?${query}` : '')
  )
}

function parseHeaders(raw: unknown): KeyValueData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is Json => isObj(h) && !!str(h.key).trim())
    .filter((h) => !SKIPPED_HEADERS.has(str(h.key).trim().toLowerCase()))
    .map((h) => ({ key: str(h.key).trim(), value: str(h.value), enabled: h.disabled !== true }))
}

function parseFields(raw: unknown): FormFieldData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Json => isObj(f) && !!str(f.key).trim())
    .map((f) => {
      const isFile = f.type === 'file'
      // En archivos, Postman guarda la ruta en `src` (texto, lista o null)
      const src = Array.isArray(f.src) ? str(f.src[0]) : str(f.src)
      return {
        key: str(f.key).trim(),
        value: isFile ? src : str(f.value),
        type: isFile ? ('file' as const) : ('text' as const),
        enabled: f.disabled !== true
      }
    })
}

function parseBody(
  raw: unknown,
  name: string,
  warnings: string[]
): { body: string; bodyForm?: BodyFormData } {
  if (!isObj(raw)) return { body: '' }

  switch (str(raw.mode)) {
    case 'raw':
      return { body: str(raw.raw) }
    case 'urlencoded':
      return { body: '', bodyForm: { mode: 'urlencoded', fields: parseFields(raw.urlencoded) } }
    case 'formdata': {
      const fields = parseFields(raw.formdata)
      if (fields.some((f) => f.type === 'file')) {
        warnings.push(`"${name}": los archivos de form-data deben volver a seleccionarse.`)
      }
      return { body: '', bodyForm: { mode: 'form-data', fields } }
    }
    case 'graphql': {
      const gql = isObj(raw.graphql) ? raw.graphql : {}
      let variables: unknown = {}
      try {
        if (str(gql.variables).trim()) variables = JSON.parse(str(gql.variables))
      } catch {
        // variables mal formadas: se envían vacías
      }
      return { body: JSON.stringify({ query: str(gql.query), variables }, null, 2) }
    }
    case 'file':
      warnings.push(`"${name}": el body de tipo archivo (binary) no está soportado.`)
      return { body: '' }
    default:
      return { body: '' }
  }
}

interface Ctx {
  requests: PostmanEndpoint[]
  warnings: string[]
  scripts: number
}

function walk(items: unknown[], path: string[], inherited: AuthConfig | null, ctx: Ctx): void {
  for (const item of items) {
    if (!isObj(item)) continue

    if (Array.isArray(item.event) && item.event.length > 0) ctx.scripts++
    // Auth propia del folder o de la petición; si no hay, hereda la del nivel superior
    const own = parseAuth(item.auth, ctx.warnings)
    const auth = own === undefined ? inherited : own

    // Carpeta
    if (Array.isArray(item.item)) {
      walk(item.item, [...path, str(item.name) || 'Carpeta'], auth, ctx)
      continue
    }

    // Petición (`request` puede ser solo la URL en texto)
    const req = isObj(item.request) ? item.request : { url: item.request }
    const rawName = str(item.name).trim() || 'Sin nombre'

    // Sonda soporta un nivel de carpetas: lo demás se aplana en el nombre
    const folder = path[0] ?? ''
    const name = [...path.slice(1), rawName].join(' / ')

    const method = str(req.method).toUpperCase() || 'GET'
    if (!METHODS.has(method)) {
      ctx.warnings.push(`"${name}": el método ${method} no está soportado, se importó como GET.`)
    }

    const { body, bodyForm } = parseBody(req.body, name, ctx.warnings)
    const description = isObj(req.description) ? str(req.description.content) : str(req.description)
    const requestAuth = parseAuth(req.auth, ctx.warnings)
    const finalAuth = requestAuth === undefined ? auth : requestAuth

    const request: SavedRequest = {
      name,
      method: (METHODS.has(method) ? method : 'GET') as HttpMethod,
      url: parseUrl(req.url),
      headers: parseHeaders(req.header),
      body,
      ...(bodyForm ? { bodyForm } : {}),
      ...(description ? { description } : {}),
      ...(finalAuth ? { auth: finalAuth } : {})
    }
    ctx.requests.push({ folder, request })
  }
}

/** Convierte una colección de Postman (v2.0 / v2.1) en peticiones de Sonda */
export function parsePostmanCollection(data: unknown): ParsedPostman {
  if (!isObj(data) || !isObj(data.info) || !Array.isArray(data.item)) {
    throw new Error('El archivo no parece una colección de Postman (v2.0 o v2.1)')
  }

  const ctx: Ctx = { requests: [], warnings: [], scripts: 0 }
  const rootAuth = parseAuth(data.auth, ctx.warnings) ?? null
  if (Array.isArray(data.event) && data.event.length > 0) ctx.scripts++
  walk(data.item, [], rootAuth, ctx)

  if (ctx.scripts > 0) {
    ctx.warnings.push(
      'Los scripts de Postman (pre-request y tests) no se importan; usa Aserciones y Extracciones.'
    )
  }

  const variables = (Array.isArray(data.variable) ? data.variable : [])
    .filter((v): v is Json => isObj(v) && !!str(v.key).trim() && v.disabled !== true)
    .map((v) => ({ key: str(v.key).trim(), value: str(v.value) }))

  return {
    name: str(data.info.name).trim() || 'Postman',
    variables,
    requests: ctx.requests,
    warnings: ctx.warnings
  }
}