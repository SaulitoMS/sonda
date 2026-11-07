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
const REQUEST_TYPES = new Set(['http-request', 'graphql-request'])

const isItem = (x: unknown): boolean =>
  isObj(x) && (x.type === 'folder' ? Array.isArray(x.items) : REQUEST_TYPES.has(str(x.type)))

/**
 * Un export de Bruno (Colección → Exportar → formato Bruno JSON):
 * { name, version: "1", items: [{ type: "folder" | "http-request" | "graphql-request", ... }] }
 */
export function looksLikeBruno(data: unknown): boolean {
  if (!isObj(data) || 'info' in data || typeof data.name !== 'string') return false
  if (!Array.isArray(data.items) || !data.items.every(isItem)) return false
  return typeof data.version === 'string' || isObj(data.brunoConfig)
}

const isEnabled = (x: Json): boolean => x.enabled !== false

/** undefined = hereda; null = sin autenticación */
function parseAuth(raw: unknown, name: string, warnings: string[]): AuthConfig | null | undefined {
  if (!isObj(raw)) return undefined
  const mode = str(raw.mode)
  if (!mode || mode === 'inherit') return undefined
  if (mode === 'none') return null

  const base = emptyAuth()
  const data: Json = isObj(raw[mode]) ? raw[mode] : {}
  switch (mode) {
    case 'bearer':
      return { ...base, type: 'bearer', token: str(data.token) }
    case 'basic':
      return { ...base, type: 'basic', username: str(data.username), password: str(data.password) }
    case 'digest':
      return { ...base, type: 'digest', username: str(data.username), password: str(data.password) }
    case 'apikey':
      return {
        ...base,
        type: 'apikey',
        keyName: str(data.key),
        keyValue: str(data.value),
        keyIn: str(data.placement).toLowerCase().startsWith('query') ? 'query' : 'header'
      }
    case 'awsv4':
      return {
        ...base,
        type: 'awsv4',
        username: str(data.accessKeyId),
        password: str(data.secretAccessKey),
        token: str(data.sessionToken),
        awsRegion: str(data.region),
        awsService: str(data.service)
      }
    default:
      warnings.push(`"${name}": la auth "${mode}" no está soportada, se importó sin autenticación.`)
      return undefined
  }
}

function parseHeaders(raw: unknown): KeyValueData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is Json => isObj(h) && !!str(h.name).trim())
    .filter((h) => !SKIPPED_HEADERS.has(str(h.name).trim().toLowerCase()))
    .map((h) => ({ key: str(h.name).trim(), value: str(h.value), enabled: isEnabled(h) }))
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Bruno guarda los params aparte: los de path (:id) se sustituyen y los de query
 * se agregan solo si la URL todavía no los trae
 */
function buildUrl(rawUrl: string, params: unknown): string {
  let url = rawUrl
  const list = (Array.isArray(params) ? params : []).filter(
    (p): p is Json => isObj(p) && isEnabled(p) && !!str(p.name)
  )

  for (const p of list.filter((p) => p.type === 'path')) {
    url = url.replace(
      new RegExp(`/:${escapeRegExp(str(p.name))}(?=[/?#]|$)`),
      () => `/${str(p.value)}`
    )
  }

  const query = list
    .filter((p) => p.type !== 'path')
    .map((p) => `${str(p.name)}=${str(p.value)}`)
    .join('&')
  if (!query || url.includes('?')) return url
  return `${url}?${query}`
}

function parseFormFields(raw: unknown, warnings: string[], name: string): FormFieldData[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Json => isObj(f) && !!str(f.name).trim())
    .map((f) => {
      const isFile = f.type === 'file' || Array.isArray(f.value)
      if (isFile) {
        warnings.push(`"${name}": los archivos de form-data deben volver a seleccionarse.`)
      }
      return {
        key: str(f.name).trim(),
        value: isFile ? '' : str(f.value),
        type: isFile ? ('file' as const) : ('text' as const),
        enabled: isEnabled(f)
      }
    })
}

function parseBody(
  raw: unknown,
  graphql: boolean,
  name: string,
  warnings: string[]
): { body: string; contentType: string; bodyForm?: BodyFormData } {
  if (!isObj(raw)) return { body: '', contentType: '' }
  const mode = str(raw.mode)

  switch (mode) {
    case 'json':
      return { body: str(raw.json), contentType: 'application/json' }
    case 'text':
      return { body: str(raw.text), contentType: 'text/plain' }
    case 'xml':
      return { body: str(raw.xml), contentType: 'application/xml' }
    case 'formUrlEncoded':
      return {
        body: '',
        contentType: 'application/x-www-form-urlencoded',
        bodyForm: {
          mode: 'urlencoded',
          fields: parseFormFields(raw.formUrlEncoded, warnings, name)
        }
      }
    case 'multipartForm':
      return {
        body: '',
        contentType: 'multipart/form-data',
        bodyForm: { mode: 'form-data', fields: parseFormFields(raw.multipartForm, warnings, name) }
      }
    case 'graphql': {
      const gql: Json = isObj(raw.graphql) ? raw.graphql : {}
      const variables = str(gql.variables).trim()
      let parsed: unknown = undefined
      if (variables) {
        try {
          parsed = JSON.parse(variables)
        } catch {
          warnings.push(`"${name}": las variables de GraphQL no son JSON válido, se omitieron.`)
        }
      }
      const payload = {
        query: str(gql.query),
        ...(parsed === undefined ? {} : { variables: parsed })
      }
      return { body: JSON.stringify(payload, null, 2), contentType: 'application/json' }
    }
    case 'none':
    case '':
      return { body: '', contentType: '' }
    default:
      // Peticiones GraphQL sin modo explícito ya se cubren arriba; el resto no tiene equivalente
      if (!graphql) {
        warnings.push(`"${name}": el body "${mode}" no está soportado, se importó vacío.`)
      }
      return { body: '', contentType: '' }
  }
}

/** Convierte un export de Bruno (JSON) en peticiones de Sonda */
export function parseBruno(data: unknown): ParsedPostman {
  if (!looksLikeBruno(data)) {
    throw new Error('El archivo no parece un export de Bruno (JSON)')
  }
  const root = data as Json
  const warnings: string[] = []
  const requests: PostmanEndpoint[] = []
  let withScripts = 0

  const walk = (items: Json[], path: string[]): void => {
    // Bruno ordena con "seq"; las carpetas van al final para no mezclar niveles
    const requestsOnly = items
      .filter((i) => i.type !== 'folder')
      .sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0))

    for (const item of requestsOnly) {
      const req: Json = isObj(item.request) ? item.request : {}
      const folder = path[0] ?? ''
      const rawName = str(item.name).trim() || 'Sin nombre'
      // Sonda soporta un nivel de carpetas: lo demás se aplana en el nombre
      const name = [...path.slice(1), rawName].join(' / ')

      const method = str(req.method).toUpperCase() || 'GET'
      if (!METHODS.has(method)) {
        warnings.push(`"${name}": el método ${method} no está soportado, se importó como GET.`)
      }

      const { body, contentType, bodyForm } = parseBody(
        req.body,
        item.type === 'graphql-request',
        name,
        warnings
      )
      const headers = parseHeaders(req.headers)
      const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
      if (contentType && !hasContentType && !bodyForm) {
        headers.push({ key: 'Content-Type', value: contentType, enabled: true })
      }

      const script: Json = isObj(req.script) ? req.script : {}
      if (str(script.req).trim() || str(script.res).trim() || str(req.tests).trim()) withScripts++

      const auth = parseAuth(req.auth, name, warnings)
      const docs = str(req.docs).trim()

      const request: SavedRequest = {
        name,
        method: (METHODS.has(method) ? method : 'GET') as HttpMethod,
        url: buildUrl(str(req.url), req.params),
        headers,
        body,
        ...(bodyForm ? { bodyForm } : {}),
        ...(docs ? { description: docs } : {}),
        ...(auth ? { auth } : {})
      }
      requests.push({ folder, request })
    }

    for (const sub of items.filter((i) => i.type === 'folder')) {
      walk(sub.items as Json[], [...path, str(sub.name).trim() || 'Carpeta'])
    }
  }
  walk(root.items as Json[], [])

  // Sonda importa un solo entorno: el primero. Los secretos no viajan en el export
  const environments = (Array.isArray(root.environments) ? root.environments : []).filter(isObj)
  const variables: { key: string; value: string }[] = []
  if (environments.length > 0) {
    const [first, ...rest] = environments
    let secrets = 0
    for (const v of Array.isArray(first.variables) ? first.variables : []) {
      if (!isObj(v) || !str(v.name).trim() || !isEnabled(v)) continue
      if (v.secret === true) {
        secrets++
        continue
      }
      variables.push({ key: str(v.name).trim(), value: str(v.value) })
    }
    if (rest.length > 0) {
      const kept = str(first.name) || 'el primero'
      warnings.push(`El export trae ${environments.length} entornos; solo se importó "${kept}".`)
    }
    if (secrets > 0) {
      warnings.push(
        `${secrets} variable(s) secretas no se importaron; créalas a mano como secretos.`
      )
    }
  }

  if (withScripts > 0) {
    warnings.push(
      `${withScripts} petición(es) tenían scripts o tests de Bruno; no se importaron, ` +
        'revísalas a mano.'
    )
  }

  return { name: str(root.name).trim() || 'Bruno', variables, requests, warnings }
}
