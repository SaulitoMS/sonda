import type { HttpMethod, ResponseSchemas } from './types'

/** Un endpoint que el servidor mock sabe responder */
export interface MockRoute {
  method: HttpMethod
  /** Ruta con parámetros, ej: /pet/{petId} */
  path: string
  status: number
  /** JSON ya serializado. Vacío = responder sin body */
  body: string
}

export interface CompiledRoute extends MockRoute {
  regex: RegExp
}

const MAX_DEPTH = 6

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Genera un valor de ejemplo (siempre el mismo) a partir de un schema JSON */
export function sampleFromSchema(schema: unknown, depth = 0): unknown {
  if (!isObject(schema) || depth > MAX_DEPTH) return null
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]

  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce<Record<string, unknown>>((acc, part) => {
      const value = sampleFromSchema(part, depth + 1)
      return isObject(value) ? { ...acc, ...value } : acc
    }, {})
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    const options = schema[key]
    if (Array.isArray(options) && options.length > 0) {
      return sampleFromSchema(options[0], depth + 1)
    }
  }

  // OpenAPI 3.1 permite type: ['string', 'null']
  const rawType = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type
  const type = rawType ?? (schema.properties ? 'object' : undefined)

  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {}
      const props = isObject(schema.properties) ? schema.properties : {}
      for (const [name, prop] of Object.entries(props)) {
        out[name] = sampleFromSchema(prop, depth + 1)
      }
      return out
    }
    case 'array': {
      const min = typeof schema.minItems === 'number' ? schema.minItems : 1
      const count = Math.min(Math.max(min, 1), 3)
      return Array.from({ length: count }, () => sampleFromSchema(schema.items, depth + 1))
    }
    case 'integer':
      return typeof schema.minimum === 'number' ? Math.ceil(schema.minimum) : 1
    case 'number':
      return typeof schema.minimum === 'number' ? schema.minimum : 1
    case 'boolean':
      return true
    case 'string': {
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
        default: {
          const min = typeof schema.minLength === 'number' ? schema.minLength : 0
          return 'string'.padEnd(min, 'x')
        }
      }
    }
    default:
      return null
  }
}

/** Elige qué respuesta devuelve el mock: el primer 2xx documentado */
export function pickMockResponse(schemas?: ResponseSchemas): { status: number; body: string } {
  const codes = Object.keys(schemas ?? {})
  if (!schemas || codes.length === 0) return { status: 200, body: '{}' }

  const code =
    codes.filter((c) => /^2\d\d$/.test(c)).sort()[0] ??
    codes.find((c) => /^2xx$/i.test(c)) ??
    codes.find((c) => c === 'default') ??
    codes[0]

  const status = /^\d{3}$/.test(code) ? Number(code) : 200
  const schema = schemas[code]
  if (!schema || status === 204) return { status, body: '' }
  return { status, body: JSON.stringify(sampleFromSchema(schema), null, 2) }
}

/** "{{baseUrl}}/pet/1?x=2" → "/pet/1". Una {{variable}} dentro del path se vuelve comodín */
export function pathFromRequestUrl(url: string): string {
  let rest = url.trim().replace(/^\{\{[^}]+\}\}/, '')
  if (/^https?:\/\//i.test(rest)) {
    try {
      rest = new URL(rest).pathname
    } catch {
      rest = rest.replace(/^https?:\/\/[^/]*/i, '')
    }
  }
  rest = rest.split(/[?#]/)[0].replace(/\{\{([^}]+)\}\}/g, '{$1}')
  return rest.startsWith('/') ? rest : `/${rest}`
}

const paramCount = (path: string): number => (path.match(/\{/g) ?? []).length

/** "/pet/{petId}" → /^\/pet\/[^/]+\/?$/ */
export function pathToRegExp(template: string): RegExp {
  const source = template
    .split(/(\{[^}]+\})/)
    .map((part) =>
      /^\{[^}]+\}$/.test(part) ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('')
  return new RegExp(`^${source}/?$`)
}

/** Las rutas con menos parámetros van primero: /pet/findByStatus gana a /pet/{petId} */
export function compileRoutes(routes: MockRoute[]): CompiledRoute[] {
  return routes
    .map((r) => ({ ...r, regex: pathToRegExp(r.path) }))
    .sort((a, b) => paramCount(a.path) - paramCount(b.path) || b.path.length - a.path.length)
}

export function matchRoute(
  routes: CompiledRoute[],
  method: string,
  pathname: string
): CompiledRoute | undefined {
  const m = method.toUpperCase()
  return routes.find((r) => r.method === m && r.regex.test(pathname))
}
