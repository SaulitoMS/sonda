import type { JsonSchema, ResponseSchemas, SchemaIssue, SchemaValidation } from './types'

/**
 * Valida el body de una respuesta contra el schema que define la spec OpenAPI/Swagger.
 * Cubre el subconjunto de JSON Schema que usa OpenAPI y no usa eval, así que funciona
 * igual en main y en el renderer.
 */

interface Schema {
  type?: string | string[]
  nullable?: boolean
  readOnly?: boolean
  enum?: unknown[]
  format?: string
  pattern?: string
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number | boolean
  exclusiveMaximum?: number | boolean
  items?: Schema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: boolean | Schema
  allOf?: Schema[]
  anyOf?: Schema[]
  oneOf?: Schema[]
}

export interface ValidateInput {
  schemas: ResponseSchemas
  status: number
  method?: string
  /** Headers de la respuesta, con las claves en minúsculas */
  headers: Record<string, string>
  body: string
}

/** Máximo de errores (y de advertencias) que se reportan, para no inundar la UI */
const MAX_ISSUES = 50
const MAX_DEPTH = 64

interface Ctx {
  issues: SchemaIssue[]
  errors: number
  warnings: number
  truncated: boolean
}

const newCtx = (): Ctx => ({ issues: [], errors: 0, warnings: 0, truncated: false })

function report(
  ctx: Ctx,
  path: string,
  message: string,
  severity: SchemaIssue['severity'] = 'error'
): void {
  const count = severity === 'error' ? ctx.errors : ctx.warnings
  if (count >= MAX_ISSUES) {
    ctx.truncated = true
    return
  }
  if (severity === 'error') ctx.errors++
  else ctx.warnings++
  ctx.issues.push({ path, message, severity })
}

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key)

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** $.user.tags[0].name  /  $["content-type"] */
const join = (path: string, key: string): string =>
  IDENTIFIER.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'string':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return isPlainObject(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 40 ? text.slice(0, 37) + '…' : text
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const FORMAT_PATTERNS: Record<string, RegExp> = {
  'date-time': /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:?\d{2})?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
}

/** Los formatos que no conocemos (int64, binary, password…) se aceptan */
function validFormat(format: string, value: string): boolean {
  if (format === 'uri' || format === 'url') {
    try {
      return Boolean(new URL(value).protocol)
    } catch {
      return false
    }
  }
  const pattern = FORMAT_PATTERNS[format]
  return pattern ? pattern.test(value) : true
}

/** Nombres de propiedades que declara el schema, incluyendo los de allOf/anyOf/oneOf */
function collectProps(schema: Schema, into: Set<string>, depth = 0): void {
  if (depth > 8) return
  for (const key of Object.keys(schema.properties ?? {})) into.add(key)
  for (const list of [schema.allOf, schema.anyOf, schema.oneOf]) {
    for (const sub of list ?? []) collectProps(sub, into, depth + 1)
  }
}

function runVariants(variants: Schema[], value: unknown, path: string, depth: number): Ctx[] {
  return variants.map((variant) => {
    const sub = newCtx()
    check(variant, value, path, sub, depth + 1, true)
    return sub
  })
}

const closest = (subs: Ctx[]): Ctx =>
  subs.reduce((best, cur) => (cur.errors < best.errors ? cur : best))

function merge(ctx: Ctx, sub: Ctx): void {
  for (const issue of sub.issues) report(ctx, issue.path, issue.message, issue.severity)
}

/**
 * `quiet` evita avisar de campos no documentados dentro de una variante de allOf/anyOf/oneOf,
 * porque ahí los campos "extra" pueden pertenecer a otra variante.
 */
function check(
  schema: Schema | boolean | undefined,
  value: unknown,
  path: string,
  ctx: Ctx,
  depth = 0,
  quiet = false
): void {
  if (!schema || typeof schema !== 'object' || depth > MAX_DEPTH) return

  const types =
    schema.type === undefined ? undefined : Array.isArray(schema.type) ? schema.type : [schema.type]

  if (value === null) {
    if (schema.nullable === true || types?.includes('null')) return
    if (types) {
      report(ctx, path, `Se esperaba ${types.join(' | ')} pero llegó null`)
      return
    }
  } else if (types && !types.some((t) => matchesType(value, t))) {
    report(ctx, path, `Se esperaba ${types.join(' | ')} pero llegó ${typeOf(value)}`)
    return
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((e) => sameValue(e, value))) {
    const allowed = schema.enum.slice(0, 10).map(preview).join(', ')
    report(ctx, path, `Valor no permitido ${preview(value)}. Permitidos: ${allowed}`)
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      report(
        ctx,
        path,
        `Debe tener al menos ${schema.minLength} caracteres (tiene ${value.length})`
      )
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      report(
        ctx,
        path,
        `Debe tener como máximo ${schema.maxLength} caracteres (tiene ${value.length})`
      )
    }
    if (schema.pattern) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          report(ctx, path, `No cumple el patrón ${schema.pattern}`)
        }
      } catch {
        // patrón que JavaScript no entiende: se ignora
      }
    }
    if (schema.format && !validFormat(schema.format, value)) {
      report(ctx, path, `Formato inválido, se esperaba ${schema.format}`)
    }
  }

  if (typeof value === 'number') {
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = schema
    // En OpenAPI 3.0 exclusiveMinimum/Maximum son booleanos; en JSON Schema nuevo, números
    if (typeof minimum === 'number') {
      const exclusive = exclusiveMinimum === true
      if (exclusive ? value <= minimum : value < minimum) {
        report(ctx, path, `Debe ser ${exclusive ? 'mayor que' : 'mayor o igual a'} ${minimum}`)
      }
    }
    if (typeof exclusiveMinimum === 'number' && value <= exclusiveMinimum) {
      report(ctx, path, `Debe ser mayor que ${exclusiveMinimum}`)
    }
    if (typeof maximum === 'number') {
      const exclusive = exclusiveMaximum === true
      if (exclusive ? value >= maximum : value > maximum) {
        report(ctx, path, `Debe ser ${exclusive ? 'menor que' : 'menor o igual a'} ${maximum}`)
      }
    }
    if (typeof exclusiveMaximum === 'number' && value >= exclusiveMaximum) {
      report(ctx, path, `Debe ser menor que ${exclusiveMaximum}`)
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      report(ctx, path, `Debe tener al menos ${schema.minItems} elementos (tiene ${value.length})`)
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      report(
        ctx,
        path,
        `Debe tener como máximo ${schema.maxItems} elementos (tiene ${value.length})`
      )
    }
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size < value.length) {
      report(ctx, path, 'Los elementos deben ser únicos')
    }
    if (schema.items) {
      value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, ctx, depth + 1))
    }
  }

  if (isPlainObject(value)) {
    for (const key of schema.required ?? []) {
      if (!hasOwn(value, key)) report(ctx, join(path, key), 'Campo requerido ausente')
    }

    const props = schema.properties ?? {}
    for (const [key, sub] of Object.entries(props)) {
      if (hasOwn(value, key)) check(sub, value[key], join(path, key), ctx, depth + 1)
    }

    const extra = Object.keys(value).filter((key) => !hasOwn(props, key))
    const additional = schema.additionalProperties
    if (additional === false) {
      for (const key of extra) {
        report(ctx, join(path, key), 'Campo no permitido (additionalProperties: false)')
      }
    } else if (additional && typeof additional === 'object') {
      for (const key of extra) check(additional, value[key], join(path, key), ctx, depth + 1)
    } else if (additional === undefined && !quiet) {
      // Campos que la API devuelve pero la spec no documenta: avisa sin marcar error
      const known = new Set<string>()
      collectProps(schema, known)
      if (known.size > 0) {
        for (const key of Object.keys(value)) {
          if (!known.has(key)) {
            report(ctx, join(path, key), 'Campo no documentado en el schema', 'warning')
          }
        }
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) check(sub, value, path, ctx, depth + 1, true)
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const subs = runVariants(schema.anyOf, value, path, depth)
    const match = subs.find((s) => s.errors === 0)
    if (match) {
      merge(ctx, match)
    } else {
      report(ctx, path, `No coincide con ninguna de las ${subs.length} variantes (anyOf)`)
      merge(ctx, closest(subs))
    }
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const subs = runVariants(schema.oneOf, value, path, depth)
    const matches = subs.filter((s) => s.errors === 0)
    if (matches.length === 1) {
      merge(ctx, matches[0])
    } else if (matches.length > 1) {
      report(ctx, path, `Coincide con ${matches.length} variantes y oneOf exige exactamente una`)
    } else {
      report(ctx, path, `No coincide con ninguna de las ${subs.length} variantes (oneOf)`)
      merge(ctx, closest(subs))
    }
  }
}

/** Busca el schema por status exacto ("200"), por rango ("2XX") o "default" */
function pickSchema(
  schemas: ResponseSchemas,
  status: number
): { key: string; schema: JsonSchema | null } | null {
  const keys = Object.keys(schemas)
  const code = String(status)
  const key =
    keys.find((k) => k === code) ??
    keys.find((k) => k.toUpperCase() === `${code[0]}XX`) ??
    keys.find((k) => k.toLowerCase() === 'default')
  return key === undefined ? null : { key, schema: schemas[key] }
}

const invalid = (matched: string, message: string): SchemaValidation => ({
  verdict: 'invalid',
  matched,
  issues: [{ path: '$', message, severity: 'error' }],
  truncated: false
})

const skipped = (matched: string, message: string): SchemaValidation => ({
  verdict: 'skipped',
  matched,
  message,
  issues: [],
  truncated: false
})

/** Errores primero, advertencias después (el orden dentro de cada grupo se conserva) */
function summarize(ctx: Ctx, matched: string): SchemaValidation {
  const issues = [
    ...ctx.issues.filter((i) => i.severity === 'error'),
    ...ctx.issues.filter((i) => i.severity === 'warning')
  ]
  return {
    verdict: ctx.errors > 0 ? 'invalid' : 'valid',
    matched,
    issues,
    truncated: ctx.truncated
  }
}

function validate(input: ValidateInput): SchemaValidation | null {
  const { schemas, status, method, headers, body } = input
  if (Object.keys(schemas).length === 0) return null

  const picked = pickSchema(schemas, status)
  if (!picked) {
    const declared = Object.keys(schemas).join(', ')
    return {
      verdict: 'undocumented',
      message: `El status ${status} no está documentado en la spec (documentados: ${declared}).`,
      issues: [],
      truncated: false
    }
  }

  const { key, schema } = picked
  if (schema === null) {
    return {
      verdict: 'no-schema',
      matched: key,
      message: `El status ${status} está documentado sin schema de body JSON.`,
      issues: [],
      truncated: false
    }
  }

  if (method === 'HEAD') return skipped(key, 'Las respuestas a HEAD no llevan body.')
  if (!body.trim()) return invalid(key, 'La respuesta está vacía pero la spec define un body')

  const contentType = (headers['content-type'] ?? '').toLowerCase()
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    if (contentType.includes('json')) return invalid(key, 'El body no es JSON válido')
    return skipped(key, `La respuesta no es JSON (content-type: ${contentType || 'ninguno'}).`)
  }

  const ctx = newCtx()
  check(schema as unknown as Schema, parsed, '$', ctx)
  return summarize(ctx, key)
}

/**
 * Devuelve null si la petición no tiene schemas contra los que validar.
 * Nunca lanza: si algo de la spec está mal formado, el resultado es "skipped".
 */
export function validateResponse(input: ValidateInput): SchemaValidation | null {
  try {
    return validate(input)
  } catch (err) {
    return skipped(
      '',
      `No se pudo validar: ${err instanceof Error ? err.message : 'error desconocido'}`
    )
  }
}

// ---------- Validación del request ----------

export interface ValidateRequestInput {
  /** Schema del requestBody de la spec. Sin schema no hay nada que validar */
  schema: JsonSchema | null | undefined
  method: string
  /** Body tal como se va a enviar, con las {{variables}} ya resueltas */
  body: string
}

/**
 * Los campos readOnly los pone el servidor: aunque la spec los marque como required,
 * el cliente no tiene que enviarlos. Devuelve una copia del schema sin esa exigencia.
 */
function relaxReadOnly(schema: Schema, depth = 0): Schema {
  if (depth > MAX_DEPTH) return schema
  const out: Schema = { ...schema }

  if (schema.properties) {
    const entries = Object.entries(schema.properties)
    out.properties = Object.fromEntries(
      entries.map(([name, sub]) => [name, relaxReadOnly(sub, depth + 1)])
    )
    const readOnly = new Set(entries.filter(([, sub]) => sub.readOnly === true).map(([n]) => n))
    if (readOnly.size > 0 && schema.required) {
      out.required = schema.required.filter((name) => !readOnly.has(name))
    }
  }
  if (schema.items) out.items = relaxReadOnly(schema.items, depth + 1)
  for (const list of ['allOf', 'anyOf', 'oneOf'] as const) {
    const variants = schema[list]
    if (variants) out[list] = variants.map((v) => relaxReadOnly(v, depth + 1))
  }
  return out
}

/**
 * Revisa el body que se va a enviar contra el schema del requestBody de la spec.
 * Devuelve null si no hay nada que validar (sin schema, o método sin body como GET).
 * Nunca lanza: si algo falla, el resultado es "skipped".
 */
export function validateRequestBody(input: ValidateRequestInput): SchemaValidation | null {
  const { schema, body } = input
  if (!schema || Object.keys(schema).length === 0) return null
  const method = input.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return null

  try {
    if (!body.trim()) return skipped('requestBody', 'No hay body para validar.')

    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      return invalid('requestBody', 'El body no es JSON válido')
    }

    const ctx = newCtx()
    check(relaxReadOnly(schema as unknown as Schema), parsed, '$', ctx)
    return summarize(ctx, 'requestBody')
  } catch (err) {
    return skipped(
      'requestBody',
      `No se pudo validar: ${err instanceof Error ? err.message : 'error desconocido'}`
    )
  }
}
