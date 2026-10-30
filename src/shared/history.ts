import type { AuthConfig, HttpMethod, KeyValueData, SendRequestResult } from './types'

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
  auth?: AuthConfig
  response: SendRequestResult
}

/** Recorta el body de la respuesta para no llenar el almacenamiento */
export function truncateResponse(
  response: SendRequestResult,
  max = MAX_BODY_CHARS
): SendRequestResult {
  if (!response.ok || response.body.length <= max) return response
  return { ...response, body: response.body.slice(0, max) }
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
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
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

/** Lee lo guardado ignorando datos corruptos o de versiones viejas */
export function parseStored(raw: string | null): HistoryEntry[] {
  if (!raw) return []
  try {
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter(isEntry).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}