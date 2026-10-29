/* eslint-disable @typescript-eslint/no-explicit-any */
import SwaggerParser from '@apidevtools/swagger-parser'
import type { HttpMethod, KeyValueData, ResponseSchemas, SavedRequest } from '../shared/types'

export interface ImportedRequest {
  folder: string
  /** Texto base para el nombre del archivo, ej: "get /pet/{petId}" */
  fileHint: string
  request: SavedRequest
}

export interface ImportedSpec {
  name: string
  baseUrl: string
  source: string
  requests: ImportedRequest[]
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

const COMMON_SPEC_PATHS = [
  '/v3/api-docs', // Spring Boot (springdoc)
  '/v2/api-docs', // Spring Boot (springfox)
  '/openapi.json', // FastAPI y otros
  '/swagger.json',
  '/openapi.yaml',
  '/api-docs',
  '/swagger/v1/swagger.json', // .NET
  '/api/openapi.json',
  '/docs/openapi.json'
]

/** La URL tal cual, y si no es una spec (ej: la página de Swagger UI), rutas comunes */
function buildCandidates(input: URL): string[] {
  const dir = input.pathname.replace(/\/[^/]*$/, '')
  const bases = [...new Set([input.origin + dir, input.origin])]
  const list = [input.toString()]
  for (const base of bases) {
    for (const p of COMMON_SPEC_PATHS) list.push(base + p)
  }
  return [...new Set(list)]
}

/** Genera un valor de ejemplo a partir de un schema JSON */
function sample(schema: any, depth = 0): unknown {
  if (!schema || depth > 5) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0]

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((acc: any, s: any) => {
      const v = sample(s, depth + 1)
      return v && typeof v === 'object' && !Array.isArray(v) ? { ...acc, ...v } : acc
    }, {})
  }
  if (Array.isArray(schema.oneOf) && schema.oneOf.length) return sample(schema.oneOf[0], depth + 1)
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) return sample(schema.anyOf[0], depth + 1)

  const type = schema.type ?? (schema.properties ? 'object' : undefined)
  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries<any>(schema.properties ?? {})) {
        if (value?.readOnly) continue
        out[key] = sample(value, depth + 1)
      }
      return out
    }
    case 'array':
      return [sample(schema.items, depth + 1)]
    case 'integer':
    case 'number':
      return schema.minimum ?? 1
    case 'boolean':
      return true
    case 'string':
      switch (schema.format) {
        case 'date-time':
          return '2024-01-01T00:00:00Z'
        case 'date':
          return '2024-01-01'
        case 'email':
          return 'user@example.com'
        case 'uuid':
          return '00000000-0000-0000-0000-000000000000'
        case 'uri':
        case 'url':
          return 'https://example.com'
        default:
          return 'string'
      }
    default:
      return null
  }
}

function paramValue(p: any): unknown {
  return (
    p?.example ??
    p?.schema?.example ??
    p?.default ??
    p?.schema?.default ??
    sample(p?.schema ?? p) ??
    1
  )
}

/** Claves que no aportan a la validación y solo inflan los archivos guardados */
const SCHEMA_NOISE = new Set([
  'description',
  'title',
  'example',
  'examples',
  'default',
  'xml',
  'externalDocs',
  'deprecated',
  'writeOnly',
  'discriminator'
])
const MAX_SCHEMA_DEPTH = 12

/**
 * Copia un schema (ya dereferenciado) a JSON plano y serializable: quita el ruido,
 * convierte x-nullable (Swagger 2) en nullable y corta las referencias circulares
 * (un schema que se contiene a sí mismo se vuelve {}, que acepta cualquier valor).
 */
function cleanSchema(schema: any, stack: object[] = []): any {
  if (Array.isArray(schema)) return schema.map((item) => cleanSchema(item, stack))
  if (!schema || typeof schema !== 'object') return schema
  if (stack.includes(schema) || stack.length >= MAX_SCHEMA_DEPTH) return {}

  const next = [...stack, schema]
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries<any>(schema)) {
    if (key === 'x-nullable') {
      if (value === true) out.nullable = true
      continue
    }
    if (key.startsWith('x-') || SCHEMA_NOISE.has(key)) continue

    if (key === 'enum') {
      out.enum = value
    } else if (key === 'properties' && value && typeof value === 'object') {
      // Las claves de "properties" son nombres de campos, no palabras clave del schema
      out.properties = Object.fromEntries(
        Object.entries<any>(value).map(([name, prop]) => [name, cleanSchema(prop, next)])
      )
    } else {
      out[key] = cleanSchema(value, next)
    }
  }
  return out
}

/** Schemas JSON de las respuestas de una operación, por código de status */
function extractResponseSchemas(isV3: boolean, op: any): ResponseSchemas | undefined {
  const out: ResponseSchemas = {}
  for (const [code, res] of Object.entries<any>(op.responses ?? {})) {
    if (code.startsWith('x-')) continue

    let schema: any
    if (isV3) {
      const content = res?.content
      const jsonKey = content ? Object.keys(content).find((k) => k.includes('json')) : undefined
      schema = jsonKey ? content[jsonKey]?.schema : undefined
    } else {
      schema = res?.schema
    }
    out[code] = schema ? cleanSchema(schema) : null
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function resolveBaseUrl(api: any, specUrl: string): string {
  const spec = new URL(specUrl)

  if (api.openapi) {
    const server = api.servers?.[0]
    if (!server?.url) return spec.origin
    let url: string = server.url
    for (const [key, v] of Object.entries<any>(server.variables ?? {})) {
      url = url.split(`{${key}}`).join(String(v.default))
    }
    return new URL(url, specUrl).toString().replace(/\/$/, '')
  }

  // Swagger 2.0
  const scheme = api.schemes?.includes('https')
    ? 'https'
    : (api.schemes?.[0] ?? spec.protocol.replace(':', ''))
  const host = api.host ?? spec.host
  return `${scheme}://${host}${api.basePath ?? ''}`.replace(/\/$/, '')
}

function buildRequest(
  api: any,
  baseUrl: string,
  path: string,
  method: string,
  pathItem: any,
  op: any
): ImportedRequest {
  const isV3 = Boolean(api.openapi)

  // Parámetros del path + de la operación (la operación pisa al path)
  const params = new Map<string, any>()
  for (const p of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
    params.set(`${p.in}:${p.name}`, p)
  }

  const resolvedPath = path.replace(/\{([^}]+)\}/g, (_m, name: string) =>
    encodeURIComponent(String(paramValue(params.get(`path:${name}`))))
  )

  const query = new URLSearchParams()
  const headers: KeyValueData[] = []
  for (const p of params.values()) {
    if (!p.required) continue
    if (p.in === 'query') query.set(p.name, String(paramValue(p)))
    if (p.in === 'header')
      headers.push({ key: p.name, value: String(paramValue(p)), enabled: true })
  }
  const qs = query.toString()

  // Body de ejemplo (solo JSON)
  let body = ''
  if (isV3) {
    const content = op.requestBody?.content
    const jsonKey = content ? Object.keys(content).find((k) => k.includes('json')) : undefined
    if (content && jsonKey) {
      const media = content[jsonKey]
      const example =
        media.example ?? Object.values<any>(media.examples ?? {})[0]?.value ?? sample(media.schema)
      body = JSON.stringify(example ?? null, null, 2)
      headers.push({ key: 'Content-Type', value: jsonKey, enabled: true })
    }
  } else {
    const bodyParam = [...params.values()].find((p) => p.in === 'body')
    if (bodyParam) {
      const example = bodyParam.schema?.example ?? sample(bodyParam.schema)
      body = JSON.stringify(example ?? null, null, 2)
      headers.push({ key: 'Content-Type', value: 'application/json', enabled: true })
    }
  }

  const upper = method.toUpperCase()
  return {
    folder: op.tags?.[0] ?? '',
    fileHint: `${method} ${path}`,
    request: {
      name: op.summary || op.operationId || `${upper} ${path}`,
      method: upper as HttpMethod,
      url: baseUrl + resolvedPath + (qs ? `?${qs}` : ''),
      headers,
      body,
      description: op.description,
      responseSchemas: extractResponseSchemas(isV3, op)
    }
  }
}

export async function importFromUrl(rawUrl: string): Promise<ImportedSpec> {
  let input: URL
  try {
    input = new URL(rawUrl.trim())
  } catch {
    throw new Error('URL inválida. Incluye http:// o https://')
  }
  if (input.protocol !== 'http:' && input.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs http y https')
  }

  let api: any = null
  let specUrl = ''
  let firstError = ''

  for (const candidate of buildCandidates(input)) {
    try {
      api = await SwaggerParser.dereference(candidate, { resolve: { http: { timeout: 8000 } } })
      specUrl = candidate
      break
    } catch (err) {
      if (!firstError && err instanceof Error) firstError = err.message
    }
  }

  if (!api) {
    throw new Error(
      'No encontré una especificación OpenAPI/Swagger en esa URL. ' +
        'Prueba con el link directo al JSON/YAML (ej: .../openapi.json). ' +
        (firstError ? `Detalle: ${firstError}` : '')
    )
  }

  const baseUrl = resolveBaseUrl(api, specUrl)
  const requests: ImportedRequest[] = []

  for (const [path, pathItem] of Object.entries<any>(api.paths ?? {})) {
    for (const method of METHODS) {
      const op = pathItem?.[method]
      if (op) requests.push(buildRequest(api, '{{baseUrl}}', path, method, pathItem, op))
    }
  }

  if (requests.length === 0) throw new Error('La especificación no tiene endpoints')

  return {
    name: api.info?.title || new URL(specUrl).hostname,
    baseUrl,
    source: specUrl,
    requests
  }
}
