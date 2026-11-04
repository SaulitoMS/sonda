import { diffJson, type DiffChange, type DiffKind } from './responseDiff'
import type { SendRequestResult } from './types'

/** Headers que cambian en cada petición aunque la API sea idéntica: compararlos solo mete ruido */
const VOLATILE_HEADERS = new Set([
  'date',
  'age',
  'etag',
  'expires',
  'last-modified',
  'set-cookie',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'server-timing',
  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
  'x-amzn-trace-id',
  'cf-ray'
])

export interface HeaderDiff {
  name: string
  kind: DiffKind
  /** Valor en el entorno A */
  a?: string
  /** Valor en el entorno B */
  b?: string
}

export type EnvComparison =
  | {
      kind: 'error'
      /** Mensaje de error del entorno A (null si respondió bien) */
      errorA: string | null
      errorB: string | null
    }
  | {
      kind: 'compared'
      statusA: number
      statusB: number
      timeA: number
      timeB: number
      bodyMode: 'json' | 'text'
      bodyEqual: boolean
      /** Solo con bodyMode "json". "added" = solo en B, "removed" = solo en A */
      bodyChanges: DiffChange[]
      headerDiffs: HeaderDiff[]
      /** Status, body y headers (sin los volátiles) coinciden */
      identical: boolean
    }

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v
  return out
}

export function diffHeaders(a: Record<string, string>, b: Record<string, string>): HeaderDiff[] {
  const ha = lowerKeys(a)
  const hb = lowerKeys(b)
  const names = [...new Set([...Object.keys(ha), ...Object.keys(hb)])]
    .filter((n) => !VOLATILE_HEADERS.has(n))
    .sort()

  const out: HeaderDiff[] = []
  for (const name of names) {
    if (!(name in ha)) out.push({ name, kind: 'added', b: hb[name] })
    else if (!(name in hb)) out.push({ name, kind: 'removed', a: ha[name] })
    else if (ha[name] !== hb[name]) out.push({ name, kind: 'changed', a: ha[name], b: hb[name] })
  }
  return out
}

/** Compara la respuesta de la misma petición enviada a dos entornos (por ejemplo staging y producción) */
export function compareResponses(a: SendRequestResult, b: SendRequestResult): EnvComparison {
  if (!a.ok || !b.ok) {
    return { kind: 'error', errorA: a.ok ? null : a.error, errorB: b.ok ? null : b.error }
  }

  const pa = parseJson(a.body)
  const pb = parseJson(b.body)
  const json = pa.ok && pb.ok
  const bodyChanges = pa.ok && pb.ok ? diffJson(pa.value, pb.value) : []
  const bodyEqual = json ? bodyChanges.length === 0 : a.body === b.body
  const headerDiffs = diffHeaders(a.headers, b.headers)

  return {
    kind: 'compared',
    statusA: a.status,
    statusB: b.status,
    timeA: a.timeMs,
    timeB: b.timeMs,
    bodyMode: json ? 'json' : 'text',
    bodyEqual,
    bodyChanges,
    headerDiffs,
    identical: a.status === b.status && bodyEqual && headerDiffs.length === 0
  }
}
