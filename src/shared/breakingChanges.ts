import type { ApiChange, ChangeArea, ChangeImpact, JsonSchema, SavedRequest } from './types'

/** Desde quién se mira el schema: lo que el cliente envía o lo que el servidor devuelve */
type Side = 'request' | 'response'

const COMPOSITIONS = ['allOf', 'anyOf', 'oneOf']

const asObj = (v: unknown): JsonSchema | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonSchema) : null

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

function typesOf(s: JsonSchema): string[] {
  const list = Array.isArray(s.type) ? strList(s.type) : typeof s.type === 'string' ? [s.type] : []
  if (s.nullable === true && !list.includes('null')) list.push('null')
  return list.sort()
}

const fmt = (v: unknown): string => JSON.stringify(v)

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function diffSchema(
  a: JsonSchema,
  b: JsonSchema,
  path: string,
  side: Side,
  out: ApiChange[]
): void {
  const push = (impact: ChangeImpact, message: string): void => {
    out.push({ impact, area: side, message: `${path}: ${message}` })
  }

  // allOf / anyOf / oneOf: no se compara variante por variante, solo se avisa
  if (COMPOSITIONS.some((k) => k in a || k in b)) {
    if (!sameJson(a, b)) push('breaking', 'cambió una combinación allOf/anyOf/oneOf (revisar)')
    return
  }

  // Tipo. Al enviar, achicar los tipos rompe; al recibir, ampliarlos rompe
  const ta = typesOf(a)
  const tb = typesOf(b)
  if (ta.length > 0 && tb.length > 0 && !sameJson(ta, tb)) {
    const removed = ta.some((t) => !tb.includes(t))
    const added = tb.some((t) => !ta.includes(t))
    const breaking = side === 'request' ? removed : added
    push(
      breaking ? 'breaking' : 'compatible',
      `el tipo cambió de ${ta.join('|')} a ${tb.join('|')}`
    )
  }

  // Enum
  const ea = Array.isArray(a.enum) ? a.enum : null
  const eb = Array.isArray(b.enum) ? b.enum : null
  if (ea && eb) {
    const gone = ea.filter((v) => !eb.some((x) => sameJson(x, v)))
    const fresh = eb.filter((v) => !ea.some((x) => sameJson(x, v)))
    if (gone.length > 0) {
      push(
        side === 'request' ? 'breaking' : 'compatible',
        side === 'request'
          ? `ya no acepta ${gone.map(fmt).join(', ')}`
          : `la API ya no devuelve ${gone.map(fmt).join(', ')}`
      )
    }
    if (fresh.length > 0) {
      push(
        side === 'response' ? 'breaking' : 'compatible',
        side === 'response'
          ? `la API puede devolver valores nuevos: ${fresh.map(fmt).join(', ')}`
          : `ahora también acepta ${fresh.map(fmt).join(', ')}`
      )
    }
  } else if (ea && !eb) {
    push(
      side === 'response' ? 'breaking' : 'compatible',
      'se quitó la restricción de valores (enum)'
    )
  } else if (!ea && eb) {
    push(side === 'request' ? 'breaking' : 'compatible', 'ahora solo admite ciertos valores (enum)')
  }

  // Objetos
  const pa = asObj(a.properties) ?? {}
  const pb = asObj(b.properties) ?? {}
  const ra = new Set(strList(a.required))
  const rb = new Set(strList(b.required))

  for (const key of Object.keys(pa)) {
    if (!(key in pb)) {
      push(side === 'response' ? 'breaking' : 'compatible', `el campo "${key}" ya no existe`)
    }
  }
  for (const key of Object.keys(pb)) {
    if (!(key in pa)) {
      const mandatory = side === 'request' && rb.has(key)
      push(
        mandatory ? 'breaking' : 'compatible',
        `campo nuevo "${key}"${mandatory ? ' (obligatorio)' : ''}`
      )
    }
  }
  for (const key of Object.keys(pb)) {
    if (!(key in pa)) continue
    if (side === 'request' && rb.has(key) && !ra.has(key)) {
      push('breaking', `"${key}" ahora es obligatorio`)
    } else if (side === 'request' && ra.has(key) && !rb.has(key)) {
      push('compatible', `"${key}" ahora es opcional`)
    } else if (side === 'response' && ra.has(key) && !rb.has(key)) {
      push('breaking', `"${key}" ya no está garantizado (pasó a opcional)`)
    } else if (side === 'response' && rb.has(key) && !ra.has(key)) {
      push('compatible', `"${key}" ahora siempre viene`)
    }
    const sa = asObj(pa[key])
    const sb = asObj(pb[key])
    if (sa && sb) diffSchema(sa, sb, `${path}.${key}`, side, out)
  }

  // Arrays
  const ia = asObj(a.items)
  const ib = asObj(b.items)
  if (ia && ib) diffSchema(ia, ib, `${path}[]`, side, out)
}

const splitUrl = (url: string): { path: string; query: string[] } => {
  const i = url.indexOf('?')
  const path = i === -1 ? url : url.slice(0, i)
  const query = i === -1 ? [] : url.slice(i + 1).split('&')
  return { path, query: query.map((q) => q.split('=')[0]).filter(Boolean) }
}

/**
 * Qué cambió entre lo que hay en la colección y lo que dice la spec ahora,
 * clasificado según si rompe a un cliente existente o no.
 * @param oldUrl URL tal como se importó (no la del usuario, que pudo editarla)
 */
export function diffRequests(
  oldReq: SavedRequest,
  newReq: SavedRequest,
  oldUrl: string = oldReq.url
): ApiChange[] {
  const out: ApiChange[] = []
  const add = (impact: ChangeImpact, area: ChangeArea, message: string): void => {
    out.push({ impact, area, message })
  }

  // URL
  const ou = splitUrl(oldUrl)
  const nu = splitUrl(newReq.url)
  if (ou.path !== nu.path) add('breaking', 'url', `la ruta cambió de ${ou.path} a ${nu.path}`)
  const gone = ou.query.filter((q) => !nu.query.includes(q))
  const fresh = nu.query.filter((q) => !ou.query.includes(q))
  if (gone.length > 0) add('compatible', 'url', `parámetros de query quitados: ${gone.join(', ')}`)
  if (fresh.length > 0) add('compatible', 'url', `parámetros de query nuevos: ${fresh.join(', ')}`)

  // Body que se envía
  const qa = oldReq.requestSchema
  const qb = newReq.requestSchema
  if (!qa && qb) add('breaking', 'request', 'ahora la spec espera un body')
  else if (qa && !qb) add('compatible', 'request', 'la spec ya no espera body')
  else if (qa && qb) diffSchema(qa, qb, '$', 'request', out)

  // Respuestas por status
  const sa = oldReq.responseSchemas ?? {}
  const sb = newReq.responseSchemas ?? {}
  for (const status of Object.keys(sa)) {
    if (!(status in sb)) {
      const success = status.startsWith('2')
      add(success ? 'breaking' : 'compatible', 'response', `[${status}] ya no está documentado`)
    }
  }
  for (const status of Object.keys(sb)) {
    if (!(status in sa)) {
      add('compatible', 'response', `[${status}] nuevo status documentado`)
      continue
    }
    const a = sa[status]
    const b = sb[status]
    if (a && !b) add('breaking', 'response', `[${status}] ya no devuelve body JSON`)
    else if (!a && b) add('compatible', 'response', `[${status}] ahora devuelve body JSON`)
    else if (a && b) diffSchema(a, b, `[${status}] $`, 'response', out)
  }

  return out
}

export const hasBreaking = (changes: ApiChange[]): boolean =>
  changes.some((c) => c.impact === 'breaking')
