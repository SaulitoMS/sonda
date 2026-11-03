import type { AuthConfig, HttpMethod, JsonSchema, SavedRequest } from './types'

export interface OpenApiFile {
  /** Ruta relativa a la colección, con "/" (ej: "pet/get-pet.json" o "get-pet.json") */
  path: string
  request: SavedRequest
}

export interface OpenApiBuild {
  spec: Record<string, unknown>
  /** Peticiones que quedaron en la spec */
  count: number
  /** Cosas que no se pudieron exportar (peticiones repetidas, etc.) */
  warnings: string[]
}

type Json = Record<string, unknown>

const SENSITIVE = /password|passwd|secret|token|api[-_]?key|authorization/i
// OpenAPI ignora estos como parámetros de header; el resto no pinta nada en una spec
const SKIP_HEADERS = new Set([
  'accept',
  'content-type',
  'authorization',
  'cookie',
  'host',
  'content-length'
])
const STATUS_TEXT: Record<string, string> = {
  '200': 'OK',
  '201': 'Creado',
  '202': 'Aceptado',
  '204': 'Sin contenido',
  '400': 'Petición inválida',
  '401': 'No autenticado',
  '403': 'Sin permiso',
  '404': 'No encontrado',
  '409': 'Conflicto',
  '422': 'Entidad no procesable',
  '500': 'Error del servidor',
  default: 'Respuesta por defecto'
}

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Deduce un schema sencillo a partir de un ejemplo */
export function schemaFromExample(value: unknown, depth = 0): JsonSchema {
  if (value === null) return { nullable: true }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      items: value.length && depth < 8 ? schemaFromExample(value[0], depth + 1) : {}
    }
  }
  switch (typeof value) {
    case 'boolean':
      return { type: 'boolean' }
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' }
    case 'object': {
      if (depth >= 8) return { type: 'object' }
      const properties: Json = {}
      for (const [k, v] of Object.entries(value as Json)) {
        properties[k] = schemaFromExample(v, depth + 1)
      }
      return { type: 'object', properties }
    }
    default:
      return { type: 'string' }
  }
}

/** Copia el ejemplo ocultando los valores de campos que parecen secretos */
function maskExample(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskExample)
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE.test(k) && typeof v === 'string' && v ? '<oculto>' : maskExample(v)
      ])
    )
  }
  return value
}

const scalarSchema = (raw: string): JsonSchema => {
  if (/^-?\d+$/.test(raw)) return { type: 'integer' }
  if (/^-?\d*\.\d+$/.test(raw)) return { type: 'number' }
  if (/^(true|false)$/i.test(raw)) return { type: 'boolean' }
  return { type: 'string' }
}

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '))
  } catch {
    return s
  }
}

/** Saca la ruta (con {parámetros}) y los parámetros de query de la URL de una petición */
export function splitUrl(
  url: string,
  baseUrl?: string
): { path: string; query: [string, string][] } {
  let u = url.trim()
  u = u.replace(/^\{\{\s*baseUrl\s*\}\}/i, '')
  if (baseUrl && u.startsWith(baseUrl)) u = u.slice(baseUrl.length)
  u = u.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i, '')
  u = u.replace(/^\{\{[^}]+\}\}(?=[/?#]|$)/, '') // otra variable usada como host
  u = u.split('#')[0]

  const q = u.indexOf('?')
  const rawPath = q === -1 ? u : u.slice(0, q)
  const rawQuery = q === -1 ? '' : u.slice(q + 1)

  let path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  path = path.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, '{$1}').replace(/\/:([A-Za-z_][\w-]*)/g, '/{$1}')

  const query: [string, string][] = []
  for (const part of rawQuery.split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    const key = decode(eq === -1 ? part : part.slice(0, eq))
    if (key && !query.some(([k]) => k === key)) {
      query.push([key, eq === -1 ? '' : decode(part.slice(eq + 1))])
    }
  }
  return { path, query }
}

function operationName(name: string, method: string, path: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  const base = words.length
    ? words.map((w, i) => (i === 0 ? w[0].toLowerCase() : w[0].toUpperCase()) + w.slice(1)).join('')
    : `${method.toLowerCase()}${path.replace(/[^A-Za-z0-9]+/g, '_')}`
  return /^[A-Za-z]/.test(base) ? base : `op${base}`
}

interface SchemeDef {
  name: string
  def: Json
}

function securityFor(
  auth: AuthConfig | undefined,
  schemes: Map<string, SchemeDef>
): { requirement: Json; headerName?: string } | null {
  if (!auth || auth.type === 'none' || auth.type === 'inherit') return null

  let base: string
  let def: Json
  let headerName: string | undefined
  let scopes: string[] = []

  switch (auth.type) {
    case 'bearer':
      base = 'bearerAuth'
      def = { type: 'http', scheme: 'bearer' }
      break
    case 'basic':
      base = 'basicAuth'
      def = { type: 'http', scheme: 'basic' }
      break
    case 'apikey': {
      if (!auth.keyName.trim()) return null
      base = 'apiKeyAuth'
      def = { type: 'apiKey', in: auth.keyIn, name: auth.keyName.trim() }
      if (auth.keyIn === 'header') headerName = auth.keyName.trim().toLowerCase()
      break
    }
    case 'oauth2':
      base = 'oauth2Auth'
      scopes = (auth.oauthScope ?? '').split(/\s+/).filter(Boolean)
      def = {
        type: 'oauth2',
        flows: {
          clientCredentials: {
            tokenUrl: (auth.oauthTokenUrl ?? '').trim(),
            scopes: Object.fromEntries(scopes.map((s) => [s, '']))
          }
        }
      }
      break
    default:
      return null
  }

  // Nunca se exportan credenciales: solo el tipo de esquema
  const key = JSON.stringify(def)
  let entry = schemes.get(key)
  if (!entry) {
    const same = [...schemes.values()].filter((s) => s.name.startsWith(base)).length
    entry = { name: same === 0 ? base : `${base}${same + 1}`, def }
    schemes.set(key, entry)
  }
  return { requirement: { [entry.name]: scopes }, headerName }
}

function requestBodyFor(req: SavedRequest): Json | null {
  const mode = req.bodyForm?.mode ?? 'raw'

  if (mode === 'urlencoded' || mode === 'form-data') {
    const fields = (req.bodyForm?.fields ?? []).filter((f) => f.enabled && f.key.trim())
    if (fields.length === 0) return null
    const properties: Json = {}
    for (const f of fields) {
      properties[f.key.trim()] =
        f.type === 'file' ? { type: 'string', format: 'binary' } : scalarSchema(f.value)
    }
    const media = mode === 'form-data' ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
    return { content: { [media]: { schema: { type: 'object', properties } } } }
  }

  if (!req.body.trim()) return null
  try {
    const parsed: unknown = JSON.parse(req.body)
    return {
      content: {
        'application/json': {
          schema: req.requestSchema ?? schemaFromExample(parsed),
          example: maskExample(parsed)
        }
      }
    }
  } catch {
    const ct = req.headers.find((h) => h.enabled && h.key.trim().toLowerCase() === 'content-type')
    const media = ct?.value.split(';')[0].trim() || 'text/plain'
    return { content: { [media]: { schema: { type: 'string' } } } }
  }
}

function responsesFor(req: SavedRequest): Json {
  const entries = Object.entries(req.responseSchemas ?? {})
  if (entries.length === 0) return { '200': { description: STATUS_TEXT['200'] } }
  const out: Json = {}
  for (const [status, schema] of entries) {
    const description = STATUS_TEXT[status] ?? `Respuesta ${status}`
    out[status] = schema
      ? { description, content: { 'application/json': { schema } } }
      : { description }
  }
  return out
}

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/** Convierte las peticiones de una colección en una spec OpenAPI 3.0 */
export function buildOpenApi(
  name: string,
  baseUrl: string | undefined,
  files: OpenApiFile[]
): OpenApiBuild {
  const warnings: string[] = []
  const paths: Record<string, Json> = {}
  const schemes = new Map<string, SchemeDef>()
  const usedIds = new Set<string>()
  let count = 0

  const sorted = [...files].sort(
    (a, b) => a.path.localeCompare(b.path) || a.request.name.localeCompare(b.request.name)
  )

  for (const file of sorted) {
    const req = file.request
    if (!METHODS.includes(req.method)) continue
    const { path, query } = splitUrl(req.url, baseUrl)
    const method = req.method.toLowerCase()

    if (paths[path]?.[method]) {
      warnings.push(`Se omitió «${req.name}»: ya existe ${req.method} ${path}`)
      continue
    }

    const security = securityFor(req.auth, schemes)
    const parameters: Json[] = []

    for (const m of path.matchAll(/\{([^}]+)\}/g)) {
      parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })
    }
    for (const [key, value] of query) {
      parameters.push({
        name: key,
        in: 'query',
        schema: scalarSchema(value),
        ...(value && !value.includes('{{') ? { example: value } : {})
      })
    }
    for (const h of req.headers) {
      const key = h.key.trim()
      const lower = key.toLowerCase()
      if (!h.enabled || !key || SKIP_HEADERS.has(lower) || lower === security?.headerName) continue
      parameters.push({
        name: key,
        in: 'header',
        schema: { type: 'string' },
        ...(h.value && !h.value.includes('{{') && !SENSITIVE.test(key) ? { example: h.value } : {})
      })
    }

    let id = operationName(req.name, req.method, path)
    for (let i = 2; usedIds.has(id); i++) id = `${operationName(req.name, req.method, path)}${i}`
    usedIds.add(id)

    const folder = file.path.includes('/') ? file.path.split('/')[0] : ''
    const hasBody = !['GET', 'HEAD'].includes(req.method)
    const requestBody = hasBody ? requestBodyFor(req) : null

    const operation: Json = {
      operationId: id,
      summary: req.name,
      ...(req.description?.trim() ? { description: req.description.trim() } : {}),
      ...(folder ? { tags: [folder] } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      ...(security ? { security: [security.requirement] } : {}),
      responses: responsesFor(req)
    }

    paths[path] = { ...(paths[path] ?? {}), [method]: operation }
    count++
  }

  const spec: Record<string, unknown> = {
    openapi: '3.0.3',
    info: { title: name, version: '1.0.0' },
    ...(baseUrl ? { servers: [{ url: baseUrl }] } : {}),
    paths,
    ...(schemes.size
      ? {
          components: {
            securitySchemes: Object.fromEntries([...schemes.values()].map((s) => [s.name, s.def]))
          }
        }
      : {})
  }
  return { spec, count, warnings }
}
