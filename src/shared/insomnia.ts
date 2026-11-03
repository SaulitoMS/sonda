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

/** Export de Insomnia v4 (JSON): { _type: 'export', resources: [...] } */
export function looksLikeInsomnia(data: unknown): boolean {
  return isObj(data) && data._type === 'export' && Array.isArray(data.resources)
}

/** Insomnia escribe {{ _.baseUrl }}; Sonda usa {{baseUrl}} */
const convertVars = (text: string): string => text.replace(/\{\{\s*_\.([\w.-]+)\s*\}\}/g, '{{$1}}')

const sortKey = (r: Json): number => (typeof r.metaSortKey === 'number' ? r.metaSortKey : 0)

/** undefined = sin auth propia (hereda); null = explícitamente sin auth */
function parseAuth(raw: unknown, warnings: string[]): AuthConfig | null | undefined {
  if (!isObj(raw)) return undefined
  const type = str(raw.type)
  if (!type) return undefined
  if (type === 'none' || raw.disabled === true) return null

  const base = emptyAuth()
  switch (type) {
    case 'bearer': {
      const prefix = str(raw.prefix).trim()
      if (prefix && prefix.toLowerCase() !== 'bearer') {
        warnings.push(`Auth Bearer con prefijo "${prefix}": Sonda siempre usa "Bearer".`)
      }
      return { ...base, type: 'bearer', token: convertVars(str(raw.token)) }
    }
    case 'basic':
      return {
        ...base,
        type: 'basic',
        username: convertVars(str(raw.username)),
        password: convertVars(str(raw.password))
      }
    case 'apikey':
      return {
        ...base,
        type: 'apikey',
        keyName: convertVars(str(raw.key)),
        keyValue: convertVars(str(raw.value)),
        keyIn: str(raw.addTo) === 'queryParams' ? 'query' : 'header'
      }
    default:
      warnings.push(`Auth "${type}" no está soportada: se importó sin autenticación.`)
      return undefined
  }
}

function parseHeaders(raw: unknown): KeyValueData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is Json => isObj(h) && !!str(h.name).trim())
    .filter((h) => !SKIPPED_HEADERS.has(str(h.name).trim().toLowerCase()))
    .map((h) => ({
      key: str(h.name).trim(),
      value: convertVars(str(h.value)),
      enabled: h.disabled !== true
    }))
}

/** Insomnia guarda los query params aparte de la URL: se agregan al final */
function buildUrl(rawUrl: string, params: unknown): string {
  const query = (Array.isArray(params) ? params : [])
    .filter((p): p is Json => isObj(p) && p.disabled !== true && !!str(p.name))
    .map((p) => `${str(p.name)}=${str(p.value)}`)
    .join('&')
  const url = convertVars(rawUrl)
  if (!query) return url
  return url + (url.includes('?') ? '&' : '?') + convertVars(query)
}

function parseFields(raw: unknown): FormFieldData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Json => isObj(f) && !!str(f.name).trim())
    .map((f) => {
      const isFile = f.type === 'file'
      return {
        key: str(f.name).trim(),
        value: isFile ? str(f.fileName) : convertVars(str(f.value)),
        type: isFile ? ('file' as const) : ('text' as const),
        enabled: f.disabled !== true
      }
    })
}

function parseBody(
  raw: unknown,
  name: string,
  warnings: string[]
): { body: string; mimeType: string; bodyForm?: BodyFormData } {
  if (!isObj(raw)) return { body: '', mimeType: '' }
  const mimeType = str(raw.mimeType).toLowerCase()

  if (mimeType === 'application/x-www-form-urlencoded') {
    return {
      body: '',
      mimeType,
      bodyForm: { mode: 'urlencoded', fields: parseFields(raw.params) }
    }
  }
  if (mimeType === 'multipart/form-data') {
    const fields = parseFields(raw.params)
    if (fields.some((f) => f.type === 'file')) {
      warnings.push(`"${name}": los archivos de form-data deben volver a seleccionarse.`)
    }
    return { body: '', mimeType, bodyForm: { mode: 'form-data', fields } }
  }
  if (mimeType === 'application/octet-stream') {
    warnings.push(`"${name}": el body de tipo archivo (binary) no está soportado.`)
    return { body: '', mimeType: '' }
  }
  return { body: convertVars(str(raw.text)), mimeType }
}

/** Convierte un export de Insomnia (v4, JSON) en peticiones de Sonda */
export function parseInsomnia(data: unknown): ParsedPostman {
  if (!looksLikeInsomnia(data)) {
    throw new Error('El archivo no parece un export de Insomnia (v4, JSON)')
  }
  const resources = ((data as Json).resources as unknown[]).filter(isObj)
  const warnings: string[] = []

  const workspace = resources.find((r) => r._type === 'workspace')
  const workspaceId = str(workspace?._id)

  const childrenOf = (parentId: string): Json[] =>
    resources
      .filter(
        (r) => r.parentId === parentId && (r._type === 'request' || r._type === 'request_group')
      )
      .sort((a, b) => sortKey(a) - sortKey(b))

  const requests: PostmanEndpoint[] = []
  let withTemplateTags = 0

  const walk = (parentId: string, path: string[], inherited: AuthConfig | null): void => {
    for (const item of childrenOf(parentId)) {
      const own = parseAuth(item.authentication, warnings)
      const auth = own === undefined ? inherited : own

      if (item._type === 'request_group') {
        walk(str(item._id), [...path, str(item.name) || 'Carpeta'], auth)
        continue
      }

      const folder = path[0] ?? ''
      const rawName = str(item.name).trim() || 'Sin nombre'
      // Sonda soporta un nivel de carpetas: lo demás se aplana en el nombre
      const name = [...path.slice(1), rawName].join(' / ')

      const method = str(item.method).toUpperCase() || 'GET'
      if (!METHODS.has(method)) {
        warnings.push(`"${name}": el método ${method} no está soportado, se importó como GET.`)
      }

      const { body, mimeType, bodyForm } = parseBody(item.body, name, warnings)
      const headers = parseHeaders(item.headers)
      const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
      // Insomnia deduce el Content-Type del tipo de body; Sonda lo necesita explícito
      if (body && mimeType && !hasContentType) {
        headers.push({ key: 'Content-Type', value: mimeType, enabled: true })
      }

      const url = buildUrl(str(item.url), item.parameters)
      if (/\{%/.test(url + body + JSON.stringify(headers))) withTemplateTags++

      const description = str(item.description).trim()
      const request: SavedRequest = {
        name,
        method: (METHODS.has(method) ? method : 'GET') as HttpMethod,
        url,
        headers,
        body,
        ...(bodyForm ? { bodyForm } : {}),
        ...(description ? { description } : {}),
        ...(auth ? { auth } : {})
      }
      requests.push({ folder, request })
    }
  }

  const rootAuth = parseAuth(workspace?.authentication, warnings) ?? null
  walk(workspaceId, [], rootAuth)

  if (withTemplateTags > 0) {
    warnings.push(
      `${withTemplateTags} petición(es) usan etiquetas de plantilla de Insomnia ({% … %}); revísalas a mano.`
    )
  }

  // Variables: solo el entorno base (los sub-entornos no se importan)
  const envs = resources.filter((r) => r._type === 'environment')
  const base = envs.find((e) => e.parentId === workspaceId)
  const variables: { key: string; value: string }[] = []
  if (base && isObj(base.data)) {
    for (const [key, value] of Object.entries(base.data)) {
      if (!key.trim()) continue
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        variables.push({ key: key.trim(), value: String(value) })
      }
    }
  }
  const subEnvs = envs.filter((e) => e.parentId === str(base?._id)).length
  if (subEnvs > 0) {
    warnings.push(`${subEnvs} sub-entorno(s) de Insomnia no se importaron (solo el entorno base).`)
  }

  return {
    name: str(workspace?.name).trim() || 'Insomnia',
    variables,
    requests,
    warnings
  }
}
