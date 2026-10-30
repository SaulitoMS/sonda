import type {
  Assertion,
  AuthConfig,
  BodyFormData,
  BodyMode,
  Extraction,
  HttpMethod,
  JsonSchema,
  ResponseSchemas
} from './types'

export const SESSION_VERSION = 1 as const
export const MAX_TABS = 30

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const BODY_MODE_IDS = ['raw', 'urlencoded', 'form-data']

/** Lo que se guarda de cada pestaña: la petición, sin respuestas ni resultados */
export interface PersistedRequest {
  method: HttpMethod
  url: string
  headers: { id: string; key: string; value: string; enabled: boolean }[]
  body: string
  /** Body de formulario (urlencoded / form-data). Si no existe, el body es el texto de `body` */
  bodyForm?: BodyFormData
  auth: AuthConfig | null
  assertions: Assertion[]
  extractions: Extraction[]
  requestSchema: JsonSchema | null
  responseSchemas: ResponseSchemas | null
  currentFile: string | null
  name: string
  /** Firma de lo último guardado, para saber si sigue habiendo cambios sin guardar */
  baseline: string
}

export interface PersistedTab {
  id: string
  request: PersistedRequest
}

export interface PersistedSession {
  version: typeof SESSION_VERSION
  activeId: string
  tabs: PersistedTab[]
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

function parseBodyForm(x: unknown): BodyFormData | undefined {
  if (!isObject(x) || typeof x.mode !== 'string' || !BODY_MODE_IDS.includes(x.mode)) {
    return undefined
  }
  if (!Array.isArray(x.fields)) return undefined

  const fields = x.fields
    .filter(isObject)
    .filter((f) => typeof f.key === 'string' && typeof f.value === 'string')
    .map((f) => ({
      key: f.key as string,
      value: f.value as string,
      type: f.type === 'file' ? ('file' as const) : ('text' as const),
      enabled: f.enabled !== false
    }))

  return { mode: x.mode as BodyMode, fields }
}

function parseRequest(x: unknown): PersistedRequest | null {
  if (!isObject(x)) return null
  if (
    typeof x.method !== 'string' ||
    !METHODS.includes(x.method) ||
    typeof x.url !== 'string' ||
    typeof x.body !== 'string' ||
    typeof x.baseline !== 'string' ||
    !Array.isArray(x.headers)
  ) {
    return null
  }

  const headers = x.headers
    .filter(isObject)
    .filter((h) => typeof h.key === 'string' && typeof h.value === 'string')
    .map((h) => ({
      id: typeof h.id === 'string' ? h.id : '',
      key: h.key as string,
      value: h.value as string,
      enabled: h.enabled !== false
    }))

  const bodyForm = parseBodyForm(x.bodyForm)

  return {
    method: x.method as HttpMethod,
    url: x.url,
    headers,
    body: x.body,
    ...(bodyForm ? { bodyForm } : {}),
    auth: isObject(x.auth) ? (x.auth as unknown as AuthConfig) : null,
    assertions: Array.isArray(x.assertions) ? (x.assertions as Assertion[]) : [],
    extractions: Array.isArray(x.extractions) ? (x.extractions as Extraction[]) : [],
    requestSchema: isObject(x.requestSchema) ? x.requestSchema : null,
    responseSchemas: isObject(x.responseSchemas) ? (x.responseSchemas as ResponseSchemas) : null,
    currentFile: typeof x.currentFile === 'string' ? x.currentFile : null,
    name: typeof x.name === 'string' ? x.name : '',
    baseline: x.baseline
  }
}

/** Lee la sesión guardada ignorando datos corruptos o de otra versión */
export function parseSession(raw: string | null): PersistedSession | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isObject(data) || data.version !== SESSION_VERSION || !Array.isArray(data.tabs)) {
      return null
    }

    const tabs: PersistedTab[] = []
    for (const t of data.tabs) {
      if (!isObject(t)) continue
      const request = parseRequest(t.request)
      if (typeof t.id === 'string' && request) tabs.push({ id: t.id, request })
      if (tabs.length >= MAX_TABS) break
    }
    if (tabs.length === 0) return null

    const wanted = data.activeId
    const activeId =
      typeof wanted === 'string' && tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id

    return { version: SESSION_VERSION, activeId, tabs }
  } catch {
    return null
  }
}
