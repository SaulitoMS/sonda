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
