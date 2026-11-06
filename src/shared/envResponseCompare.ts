import { diffJson, type DiffChange, type DiffKind } from './responseDiff'
import type { SendRequestResult } from './types'

/** Headers que cambian en cada petición aunque la API sea idéntica: no cuentan como diferencia */
const VOLATILE_HEADERS = new Set([
  'date',
  'age',
  'etag',
  'set-cookie',
  'content-length',
  'connection',
  'keep-alive',
  'via',
  'server-timing',
  'cf-ray',
  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
  'x-amzn-requestid',
  'x-amz-request-id',
  'x-amz-cf-id'
])

const MAX_TEXT = 300

export interface HeaderChange {
  name: string
  kind: DiffKind
  before?: string
  after?: string
}

export interface ResponseComparison {
  /** Alguna de las dos peticiones no llegó a responder */
  errors: string[]
  statusA: number | null
  statusB: number | null
  statusSame: boolean
  headerChanges: HeaderChange[]
  /** `json` si ambos bodies son JSON; `text` en cualquier otro caso */
  bodyKind: 'json' | 'text'
  bodyChanges: DiffChange[]
  /** Todo igual: status, headers estables y body */
  identical: boolean
}

const tryParse = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

const cut = (s: string): string => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s)

const lower = (headers: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))

/** `data.items` ignora también `data.items[0].id` y `data.items.total` */
const isIgnored = (path: string, ignore: string[]): boolean =>
  ignore.some((p) => path === p || path.startsWith(`${p}.`) || path.startsWith(`${p}[`))

/**
 * Compara la respuesta de la misma petición enviada a dos entornos.
 * `ignore` son rutas del body JSON que se saltan (ej: `data.updatedAt`).
 */
export function compareResponses(
  a: SendRequestResult,
  b: SendRequestResult,
  ignore: string[] = []
): ResponseComparison {
  const empty: ResponseComparison = {
    errors: [],
    statusA: null,
    statusB: null,
    statusSame: false,
    headerChanges: [],
    bodyKind: 'text',
    bodyChanges: [],
    identical: false
  }

  if (!a.ok || !b.ok) {
    return {
      ...empty,
      errors: [
        ...(a.ok ? [] : [`Entorno A: ${a.error}`]),
        ...(b.ok ? [] : [`Entorno B: ${b.error}`])
      ]
    }
  }

  const ha = lower(a.headers)
  const hb = lower(b.headers)
  const headerChanges: HeaderChange[] = []
  for (const name of new Set([...ha.keys(), ...hb.keys()])) {
    if (VOLATILE_HEADERS.has(name)) continue
    const before = ha.get(name)
    const after = hb.get(name)
    if (before === after) continue
    headerChanges.push({
      name,
      kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
      before,
      after
    })
  }

  const pa = tryParse(a.body)
  const pb = tryParse(b.body)
  let bodyKind: 'json' | 'text' = 'text'
  let bodyChanges: DiffChange[] = []
  if (pa.ok && pb.ok) {
    bodyKind = 'json'
    bodyChanges = diffJson(pa.value, pb.value).filter((c) => !isIgnored(c.path, ignore))
  } else if (a.body.trim() !== b.body.trim()) {
    bodyChanges = [{ path: '$', kind: 'changed', before: cut(a.body), after: cut(b.body) }]
  }

  const statusSame = a.status === b.status
  return {
    errors: [],
    statusA: a.status,
    statusB: b.status,
    statusSame,
    headerChanges,
    bodyKind,
    bodyChanges,
    identical: statusSame && headerChanges.length === 0 && bodyChanges.length === 0
  }
}
