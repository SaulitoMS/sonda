import { diffJson, type DiffChange } from './responseDiff'

export const DEFAULT_IGNORE = ['createdAt', 'updatedAt', 'timestamp', 'requestId', 'traceId']
export const MAX_SNAPSHOT_CHARS = 200_000

export interface Snapshot {
  key: string
  method: string
  url: string
  status: number
  /** JSON de la respuesta, como texto */
  body: string
  savedAt: number
  /** Nombres de campo que se ignoran al comparar (en cualquier nivel, sin distinguir mayúsculas) */
  ignore: string[]
}

export type SnapshotComparison =
  | { state: 'invalid'; reason: string }
  | {
      state: 'ready'
      statusBefore: number
      statusAfter: number
      changes: DiffChange[]
      identical: boolean
    }

/** Una petición guardada se identifica por su archivo; una sin guardar, por método + URL */
export const snapshotKey = (currentFile: string | null, method: string, url: string): string =>
  currentFile ? `file:${currentFile}` : `req:${method} ${url.trim()}`

export function parseIgnore(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,\n]/)
        .map((n) => n.trim())
        .filter(Boolean)
    )
  ]
}

function strip(value: unknown, names: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => strip(v, names))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (!names.has(k.toLowerCase())) out[k] = strip(v, names)
    }
    return out
  }
  return value
}

export function compareSnapshot(
  snapshot: Snapshot,
  current: { status: number; body: string }
): SnapshotComparison {
  let before: unknown
  let after: unknown
  try {
    before = JSON.parse(snapshot.body)
  } catch {
    return { state: 'invalid', reason: 'La línea base guardada no es JSON válido.' }
  }
  try {
    after = JSON.parse(current.body)
  } catch {
    return { state: 'invalid', reason: 'La respuesta actual no es JSON, no se puede comparar.' }
  }

  const names = new Set(snapshot.ignore.map((n) => n.toLowerCase()))
  const changes = diffJson(strip(before, names), strip(after, names))
  return {
    state: 'ready',
    statusBefore: snapshot.status,
    statusAfter: current.status,
    changes,
    identical: changes.length === 0 && snapshot.status === current.status
  }
}

/** Lee lo guardado en localStorage ignorando entradas corruptas */
export function parseStoredSnapshots(raw: string | null): Record<string, Snapshot> {
  if (!raw) return {}
  try {
    const data: unknown = JSON.parse(raw)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {}
    const out: Record<string, Snapshot> = {}
    for (const [key, v] of Object.entries(data)) {
      const s = v as Partial<Snapshot> | null
      if (
        s &&
        typeof s.status === 'number' &&
        typeof s.body === 'string' &&
        typeof s.savedAt === 'number' &&
        Array.isArray(s.ignore)
      ) {
        out[key] = {
          key,
          method: String(s.method ?? ''),
          url: String(s.url ?? ''),
          status: s.status,
          body: s.body,
          savedAt: s.savedAt,
          ignore: s.ignore.filter((n): n is string => typeof n === 'string')
        }
      }
    }
    return out
  } catch {
    return {}
  }
}