import type { JsonSchema } from './types'
import { validateRequestBody } from './validate'

type Schema = Record<string, unknown>
type Path = (string | number)[]

export type FuzzCategory =
  | 'estructura'
  | 'requerido'
  | 'tipo'
  | 'nulo'
  | 'enum'
  | 'formato'
  | 'rango'
  | 'longitud'

export interface FuzzCase {
  id: string
  category: FuzzCategory
  title: string
  /** Ruta al campo alterado: $.user.tags[0].name */
  path: string
  /** Body completo a enviar (puede ser JSON inválido a propósito) */
  body: string
}

export type FuzzVerdict = 'rechazada' | 'aceptada' | 'fallo' | 'dudosa'

export interface FuzzPlan {
  cases: FuzzCase[]
  error?: string
}

const MAX_CASES = 80
const MAX_DEPTH = 4
const REMOVE = Symbol('remove')
const CATEGORY_ORDER: FuzzCategory[] = [
  'estructura',
  'requerido',
  'tipo',
  'nulo',
  'enum',
  'formato',
  'rango',
  'longitud'
]

interface Mutation {
  category: FuzzCategory
  title: string
  value: unknown
}
interface RawCase extends Mutation {
  path: Path
}

const isObj = (v: unknown): v is Schema => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Une los allOf en un solo schema para poder leer sus properties / required */
function flatten(schema: Schema): Schema {
  if (!Array.isArray(schema.allOf)) return schema
  const merged: Schema = { ...schema }
  delete merged.allOf
  let props: Schema = isObj(merged.properties) ? { ...merged.properties } : {}
  let required: string[] = Array.isArray(merged.required) ? [...(merged.required as string[])] : []
  for (const part of (schema.allOf as unknown[]).filter(isObj).map(flatten)) {
    if (isObj(part.properties)) props = { ...props, ...part.properties }
    if (Array.isArray(part.required)) required = [...required, ...(part.required as string[])]
    for (const [k, v] of Object.entries(part)) {
      if (k !== 'properties' && k !== 'required' && !(k in merged)) merged[k] = v
    }
  }
  if (Object.keys(props).length) merged.properties = props
  if (required.length) merged.required = required
  return merged
}

function typeOf(s: Schema): string | null {
  const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : s.type
  if (typeof t === 'string') return t
  if (isObj(s.properties)) return 'object'
  if (s.items) return 'array'
  return null
}

const allowsNull = (s: Schema): boolean =>
  s.nullable === true || (Array.isArray(s.type) && s.type.includes('null'))

function wrongType(type: string | null): unknown {
  switch (type) {
    case 'string':
      return 12345
    case 'integer':
    case 'number':
      return 'abc'
    case 'boolean':
      return 'true'
    case 'object':
      return []
    case 'array':
      return {}
    default:
      return undefined
  }
}

const BAD_FORMATS: Record<string, string> = {
  email: 'no-es-un-email',
  'date-time': 'ayer por la tarde',
  date: '31/12/2024',
  uuid: '123',
  uri: 'no es una url'
}

/** Valores inválidos para un solo nodo del schema */
function nodeMutations(s: Schema, value: unknown): Mutation[] {
  const out: Mutation[] = []
  const type = typeOf(s)

  const bad = wrongType(type)
  if (bad !== undefined) {
    out.push({ category: 'tipo', title: `Tipo incorrecto (se esperaba ${type})`, value: bad })
  }
  if (!allowsNull(s)) out.push({ category: 'nulo', title: 'Valor null', value: null })
  if (Array.isArray(s.enum)) {
    out.push({ category: 'enum', title: 'Valor fuera del enum', value: '__valor_invalido__' })
  }

  if (type === 'string') {
    if (typeof s.maxLength === 'number' && s.maxLength < 5000) {
      out.push({
        category: 'longitud',
        title: `Excede maxLength (${s.maxLength})`,
        value: 'a'.repeat(s.maxLength + 1)
      })
    }
    if (typeof s.minLength === 'number' && s.minLength > 0) {
      out.push({ category: 'longitud', title: `Menor que minLength (${s.minLength})`, value: '' })
    }
    const fmt = typeof s.format === 'string' ? BAD_FORMATS[s.format] : undefined
    if (fmt) out.push({ category: 'formato', title: `Formato ${s.format} inválido`, value: fmt })
  }

  if (type === 'integer' || type === 'number') {
    if (typeof s.maximum === 'number') {
      out.push({ category: 'rango', title: `Mayor que maximum (${s.maximum})`, value: s.maximum + 1 })
    }
    if (typeof s.minimum === 'number') {
      out.push({ category: 'rango', title: `Menor que minimum (${s.minimum})`, value: s.minimum - 1 })
    }
    if (type === 'integer') {
      out.push({ category: 'tipo', title: 'Decimal en un campo entero', value: 1.5 })
    }
  }

  if (type === 'array') {
    if (typeof s.minItems === 'number' && s.minItems > 0) {
      out.push({ category: 'longitud', title: `Menos de minItems (${s.minItems})`, value: [] })
    }
    if (
      typeof s.maxItems === 'number' &&
      s.maxItems <= 200 &&
      Array.isArray(value) &&
      value.length > 0
    ) {
      out.push({
        category: 'longitud',
        title: `Más de maxItems (${s.maxItems})`,
        value: Array.from({ length: s.maxItems + 1 }, () => value[0])
      })
    }
  }
  return out
}

function walk(schema: Schema, value: unknown, path: Path, depth: number, out: RawCase[]): void {
  const s = flatten(schema)
  for (const m of nodeMutations(s, value)) out.push({ ...m, path })
  if (depth >= MAX_DEPTH) return

  if (isObj(value) && isObj(s.properties)) {
    const required = Array.isArray(s.required) ? (s.required as string[]) : []
    for (const [key, child] of Object.entries(s.properties)) {
      if (!(key in value) || !isObj(child)) continue
      if (required.includes(key)) {
        out.push({
          category: 'requerido',
          title: 'Falta un campo requerido',
          path: [...path, key],
          value: REMOVE
        })
      }
      walk(child, value[key], [...path, key], depth + 1, out)
    }
  } else if (Array.isArray(value) && value.length > 0 && isObj(s.items)) {
    walk(s.items, value[0], [...path, 0], depth + 1, out)
  }
}

function withChange(base: unknown, path: Path, value: unknown): string {
  if (path.length === 0) return JSON.stringify(value)
  const copy = structuredClone(base)
  let node = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (value === REMOVE) delete node[last]
  else node[last] = value
  return JSON.stringify(copy)
}

const pathToString = (path: Path): string =>
  '$' + path.map((p) => (typeof p === 'number' ? `[${p}]` : `.${p}`)).join('')

/** Genera los bodies inválidos a partir del schema y de un body de ejemplo válido y completo */
export function buildFuzzCases(input: {
  schema: JsonSchema | null | undefined
  method: string
  baseBody: string
}): FuzzPlan {
  const { schema, baseBody } = input
  const method = input.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return { cases: [], error: `${method} no lleva body.` }
  if (!schema || Object.keys(schema).length === 0) {
    return {
      cases: [],
      error: 'Esta petición no tiene schema de body. Impórtala desde una spec OpenAPI.'
    }
  }

  let base: unknown
  try {
    base = JSON.parse(baseBody)
  } catch {
    return {
      cases: [],
      error: 'El body actual no es JSON válido. Escribe un ejemplo completo para usarlo de base.'
    }
  }
  if (typeof base !== 'object' || base === null) {
    return { cases: [], error: 'El body base debe ser un objeto o un array JSON.' }
  }

  const stillInvalid = (body: string): boolean =>
    validateRequestBody({ schema, method: 'POST', body })?.verdict === 'invalid'

  const found: { raw: Omit<FuzzCase, 'id'>; verify: boolean }[] = [
    { raw: { category: 'estructura', title: 'Body vacío', path: '$', body: '' }, verify: false },
    {
      raw: { category: 'estructura', title: 'JSON malformado', path: '$', body: '{"roto":' },
      verify: false
    },
    { raw: { category: 'estructura', title: 'Objeto vacío {}', path: '$', body: '{}' }, verify: true }
  ]

  const raws: RawCase[] = []
  walk(schema, base, [], 0, raws)
  for (const r of raws) {
    found.push({
      raw: {
        category: r.category,
        title: r.title,
        path: pathToString(r.path),
        body: withChange(base, r.path, r.value)
      },
      verify: true
    })
  }

  const seen = new Set<string>()
  const cases = found
    .filter(({ raw, verify }) => {
      if (seen.has(raw.body)) return false
      seen.add(raw.body)
      return !verify || stillInvalid(raw.body)
    })
    .map((f) => f.raw)
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .slice(0, MAX_CASES)
    .map((c, i) => ({ ...c, id: `${c.category}-${i}` }))

  return cases.length
    ? { cases }
    : { cases: [], error: 'No se pudo generar ningún caso inválido con este schema y body.' }
}

/** Qué significa el status que devolvió la API ante un body inválido */
export function classifyFuzzResponse(status: number | null): FuzzVerdict {
  if (status === null) return 'dudosa'
  if (status >= 500) return 'fallo'
  if ([401, 403, 404, 405, 429].includes(status)) return 'dudosa'
  if (status >= 400) return 'rechazada'
  return 'aceptada'
}