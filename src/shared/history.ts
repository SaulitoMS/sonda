import { parseBodyFormData } from './bodyForm'
import type { AuthConfig, BodyFormData, HttpMethod, KeyValueData, SendRequestResult } from './types'

export const HISTORY_LIMIT = 50
export const MAX_BODY_CHARS = 30_000

export interface HistoryEntry {
  id: string
  /** Momento del envío (ms desde epoch) */
  at: number
  method: HttpMethod
  /** URL tal como se escribió, con {{variables}} sin resolver */
  url: string
  headers: KeyValueData[]
  body: string
  /** Body de formulario (urlencoded / form-data). Si no existe, el body es el texto de `body` */
  bodyForm?: BodyFormData
  auth?: AuthConfig
  response: SendRequestResult
}

/** Recorta el body de la respuesta para no llenar el almacenamiento */
/** Recorta el body de la respuesta y descarta el binario para no llenar el almacenamiento */
export function truncateResponse(
  response: SendRequestResult,
  max = MAX_BODY_CHARS
): SendRequestResult {
  if (!response.ok) return response

  let slim = response
  if (response.binary?.base64) {
    slim = { ...response, binary: { ...response.binary, base64: '' } }
  }
  return slim.body.length <= max ? slim : { ...slim, body: slim.body.slice(0, max) }
}

/** Headers cuyo valor casi siempre es una credencial */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token'
])

/** Parámetros de query que suelen llevar credenciales */
const SENSITIVE_QUERY =
  /([?&](?:access_token|refresh_token|id_token|token|api[-_]?key|apikey|secret|client_secret|password|pwd|signature)=)([^&#]*)/gi

/** Una {{variable}} no es un secreto: su valor vive en el entorno (y los secretos, cifrados) */
const blankUnlessVariable = (value: string | undefined): string =>
  value && value.includes('{{') ? value : ''

/** Nombres de campo cuyo valor es una credencial (en JSON, urlencoded o formularios) */
const SECRET_FIELD =
  'password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[-_]?key|apikey|authorization'

// El valor puede estar sin cerrar: el body del historial se recorta a 30 000 caracteres
const JSON_SECRET = new RegExp(
  `("(?:${SECRET_FIELD})"\\s*:\\s*)"((?:[^"\\\\]|\\\\.)*)(?:"|$)`,
  'gi'
)
const FORM_SECRET = new RegExp(`((?:^|&)(?:${SECRET_FIELD})=)([^&]*)`, 'gi')
const SECRET_KEY = new RegExp(`^(?:${SECRET_FIELD})$`, 'i')
const isSecretField = (key: string): boolean => SECRET_KEY.test(key.trim())

/**
 * Oculta los valores de campos sensibles en un body JSON o urlencoded, sin reformatearlo
 * (funciona aunque el texto esté recortado). `mask` es lo que queda en su lugar.
 */
const redactBodyText = (text: string, mask: string): string =>
  text
    .replace(JSON_SECRET, (match, prefix: string, value: string) =>
      value.startsWith('{{') ? match : `${prefix}"${mask}"`
    )
    .replace(FORM_SECRET, (match, prefix: string, value: string) =>
      value.startsWith('{{') ? match : `${prefix}${mask}`
    )

/**
 * Copia de la entrada sin credenciales en texto plano, pensada para escribirla en disco.
 * Se conservan las referencias {{variable}} para que la petición siga siendo reutilizable.
 */
export function redactEntry(entry: HistoryEntry): HistoryEntry {
  const auth: AuthConfig | undefined = entry.auth && {
    ...entry.auth,
    token: blankUnlessVariable(entry.auth.token),
    password: blankUnlessVariable(entry.auth.password),
    keyValue: blankUnlessVariable(entry.auth.keyValue),
    ...(entry.auth.oauthClientSecret !== undefined
      ? { oauthClientSecret: blankUnlessVariable(entry.auth.oauthClientSecret) }
      : {})
  }

  const bodyForm: BodyFormData | undefined = entry.bodyForm && {
    ...entry.bodyForm,
    fields: entry.bodyForm.fields.map((f) =>
      f.type === 'text' && isSecretField(f.key) ? { ...f, value: blankUnlessVariable(f.value) } : f
    )
  }

  const response: SendRequestResult = entry.response.ok
    ? {
        ...entry.response,
        headers: Object.fromEntries(
          Object.entries(entry.response.headers).map(([key, value]) => [
            key,
            SENSITIVE_HEADERS.has(key.toLowerCase()) ? '[oculto]' : value
          ])
        ),
        body: redactBodyText(entry.response.body, '[oculto]')
      }
    : entry.response

  return {
    ...entry,
    url: entry.url.replace(SENSITIVE_QUERY, (match, prefix: string, value: string) =>
      value.startsWith('{{') ? match : prefix
    ),
    headers: entry.headers.map((h) =>
      SENSITIVE_HEADERS.has(h.key.trim().toLowerCase())
        ? { ...h, value: blankUnlessVariable(h.value) }
        : h
    ),
    body: redactBodyText(entry.body, ''),
    ...(bodyForm ? { bodyForm } : {}),
    ...(auth ? { auth } : {}),
    response
  }
}

/** Agrega al inicio (lo más reciente primero) y respeta el límite */
export function pushEntry(
  list: HistoryEntry[],
  entry: HistoryEntry,
  limit = HISTORY_LIMIT
): HistoryEntry[] {
  return [entry, ...list].slice(0, limit)
}

/** Busca por método, URL o status */
export function filterHistory(list: HistoryEntry[], query: string): HistoryEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((e) => {
    const status = e.response.ok ? String(e.response.status) : 'error'
    return `${e.method} ${e.url} ${status}`.toLowerCase().includes(q)
  })
}

/** "Hoy", "Ayer" o la fecha en español */
export function dayLabel(at: number, now = new Date()): string {
  const d = new Date(at)
  const startOf = (x: Date): number =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Ayer'
  return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false
  const x = value as Record<string, unknown>
  return (
    typeof x.id === 'string' &&
    typeof x.at === 'number' &&
    typeof x.method === 'string' &&
    typeof x.url === 'string' &&
    Array.isArray(x.headers) &&
    typeof x.body === 'string' &&
    !!x.response &&
    typeof x.response === 'object'
  )
}

/** Descarta un bodyForm dañado sin perder el resto de la entrada */
function sanitizeBodyForm(entry: HistoryEntry): HistoryEntry {
  const { bodyForm: raw, ...rest } = entry
  const bodyForm = parseBodyFormData(raw)
  return bodyForm ? { ...rest, bodyForm } : rest
}

/** Lee lo guardado ignorando datos corruptos o de versiones viejas */
export function parseStored(raw: string | null): HistoryEntry[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(isEntry).slice(0, HISTORY_LIMIT).map(sanitizeBodyForm)
  } catch {
    return []
  }
}
