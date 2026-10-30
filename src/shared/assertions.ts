import type {
  Assertion,
  AssertionKind,
  AssertionOp,
  AssertionResult,
  SendRequestResult
} from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

export const KIND_LABELS: Record<AssertionKind, string> = {
  status: 'Status',
  time: 'Tiempo (ms)',
  header: 'Header',
  body: 'Body (JSON)'
}

export const OP_LABELS: Record<AssertionOp, string> = {
  eq: 'es igual a',
  neq: 'es distinto de',
  lt: 'es menor que',
  lte: 'es menor o igual que',
  gt: 'es mayor que',
  gte: 'es mayor o igual que',
  contains: 'contiene',
  notContains: 'no contiene',
  matches: 'coincide con (regex)',
  exists: 'existe',
  notExists: 'no existe'
}

const NUMERIC_OPS: AssertionOp[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte']
const TEXT_OPS: AssertionOp[] = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'matches',
  'exists',
  'notExists'
]
const BODY_OPS: AssertionOp[] = [...TEXT_OPS, 'lt', 'lte', 'gt', 'gte']

/** Operadores que tienen sentido para cada tipo de aserción */
export function opsForKind(kind: AssertionKind): AssertionOp[] {
  if (kind === 'status' || kind === 'time') return NUMERIC_OPS
  if (kind === 'header') return TEXT_OPS
  return BODY_OPS
}

export const needsExpected = (op: AssertionOp): boolean => op !== 'exists' && op !== 'notExists'

export const needsTarget = (kind: AssertionKind): boolean => kind === 'header' || kind === 'body'

export function emptyAssertion(kind: AssertionKind = 'status'): Assertion {
  const defaults: Record<AssertionKind, Pick<Assertion, 'op' | 'expected'>> = {
    status: { op: 'eq', expected: '200' },
    time: { op: 'lt', expected: '500' },
    header: { op: 'exists', expected: '' },
    body: { op: 'exists', expected: '' }
  }
  return { id: crypto.randomUUID(), enabled: true, kind, target: '', ...defaults[kind] }
}

/** Cambia el tipo de una aserción y deja operador y valor coherentes con el nuevo tipo */
export function changeKind(a: Assertion, kind: AssertionKind): Assertion {
  return { ...emptyAssertion(kind), id: a.id, enabled: a.enabled }
}

export function describeAssertion(a: Assertion): string {
  const op = OP_LABELS[a.op]
  const value = needsExpected(a.op) ? ` ${a.expected}` : ''
  switch (a.kind) {
    case 'status':
      return `Status ${op}${value}`
    case 'time':
      return `Tiempo ${op}${value} ms`
    case 'header':
      return `Header "${a.target.trim()}" ${op}${value}`
    case 'body':
      return `Body ${a.target.trim() || '$'} ${op}${value}`
  }
}

export function summarizeAssertions(results: AssertionResult[]): { passed: number; total: number } {
  return { passed: results.filter((r) => r.passed).length, total: results.length }
}

// ---------- Rutas dentro del JSON ----------

/**
 * Convierte "data.items[0].id" (o "$.data.items[0].id") en ['data', 'items', 0, 'id'].
 * Devuelve null si la ruta está mal escrita. Una ruta vacía o "$" apunta al body completo.
 */
export function parsePath(path: string): (string | number)[] | null {
  let p = path.trim()
  if (p.startsWith('$')) p = p.slice(1)
  if (p.startsWith('.')) p = p.slice(1)

  const tokens: (string | number)[] = []
  const re = /\.?([^.[\]]+)|\[(\d+)\]/y
  let pos = 0
  while (pos < p.length) {
    re.lastIndex = pos
    const m = re.exec(p)
    if (!m) return null
    tokens.push(m[2] !== undefined ? Number(m[2]) : m[1])
    pos = re.lastIndex
  }
  return tokens
}

interface Found {
  found: boolean
  value?: unknown
}

export function getByPath(root: unknown, tokens: (string | number)[]): Found {
  let current = root
  for (const token of tokens) {
    if (current === null || typeof current !== 'object') return { found: false }
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token >= current.length) return { found: false }
      current = current[token]
    } else {
      if (Array.isArray(current) || !Object.prototype.hasOwnProperty.call(current, token)) {
        return { found: false }
      }
      current = (current as Record<string, unknown>)[token]
    }
  }
  return { found: true, value: current }
}

// ---------- Comparación ----------

const show = (v: unknown): string =>
  typeof v === 'string' ? v : (JSON.stringify(v) ?? 'undefined')

const short = (text: string): string => (text.length > 60 ? `${text.slice(0, 57)}…` : text)

const isNumeric = (text: string): boolean => text.trim() !== '' && Number.isFinite(Number(text))

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && isNumeric(v)) return Number(v)
  return NaN
}

interface Check {
  passed: boolean
  actual?: string
  message: string
}

function check(op: AssertionOp, target: Found, expected: string): Check {
  if (op === 'exists') {
    const ok = target.found && target.value !== undefined
    return { passed: ok, message: ok ? '' : 'no existe' }
  }
  if (op === 'notExists') {
    const ok = !target.found || target.value === undefined
    return {
      passed: ok,
      actual: ok ? undefined : short(show(target.value)),
      message: ok ? '' : 'existe y no debería'
    }
  }
  if (!target.found) return { passed: false, message: 'no existe' }

  const actual = short(show(target.value))
  const text = show(target.value)
  const miss = (reason: string): Check => ({ passed: false, actual, message: reason })
  const result = (ok: boolean, reason: string): Check =>
    ok ? { passed: true, actual, message: '' } : miss(reason)

  switch (op) {
    case 'eq':
    case 'neq': {
      const equal =
        typeof target.value === 'number' && isNumeric(expected)
          ? target.value === Number(expected)
          : text === expected
      const ok = op === 'eq' ? equal : !equal
      return result(ok, `se obtuvo ${actual}`)
    }
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const a = toNumber(target.value)
      const b = Number(expected)
      if (Number.isNaN(a)) return miss(`${actual} no es un número`)
      if (!isNumeric(expected)) return miss(`"${expected}" no es un número`)
      const ok = op === 'lt' ? a < b : op === 'lte' ? a <= b : op === 'gt' ? a > b : a >= b
      return result(ok, `se obtuvo ${actual}`)
    }
    case 'contains':
      return result(text.includes(expected), `se obtuvo ${actual}`)
    case 'notContains':
      return result(!text.includes(expected), `se obtuvo ${actual}`)
    case 'matches': {
      let re: RegExp
      try {
        re = new RegExp(expected)
      } catch {
        return miss(`la regex "${expected}" no es válida`)
      }
      return result(re.test(text), `se obtuvo ${actual}`)
    }
  }
}

// ---------- Evaluación ----------

/**
 * Evalúa las aserciones activas contra una respuesta recibida.
 * Las desactivadas se omiten; el resultado conserva el orden de la lista.
 */
export function evaluateAssertions(
  assertions: Assertion[] | null | undefined,
  response: OkResponse
): AssertionResult[] {
  if (!assertions?.length) return []

  // El body solo se parsea si alguna aserción lo necesita, y una sola vez
  let json: { ok: true; value: unknown } | { ok: false } | undefined
  const parseBody = (): NonNullable<typeof json> => {
    if (!json) {
      try {
        json = { ok: true, value: JSON.parse(response.body) }
      } catch {
        json = { ok: false }
      }
    }
    return json
  }

  return assertions
    .filter((a) => a.enabled)
    .map((a): AssertionResult => {
      const label = describeAssertion(a)
      const fail = (message: string): AssertionResult => ({
        id: a.id,
        label,
        passed: false,
        message
      })
      const done = (c: Check): AssertionResult => ({
        id: a.id,
        label,
        passed: c.passed,
        actual: c.actual,
        message: c.message
      })

      switch (a.kind) {
        case 'status':
          return done(check(a.op, { found: true, value: response.status }, a.expected.trim()))
        case 'time':
          return done(check(a.op, { found: true, value: response.timeMs }, a.expected.trim()))
        case 'header': {
          const name = a.target.trim().toLowerCase()
          if (!name) return fail('falta el nombre del header')
          const key = Object.keys(response.headers).find((k) => k.toLowerCase() === name)
          const target: Found =
            key === undefined ? { found: false } : { found: true, value: response.headers[key] }
          return done(check(a.op, target, a.expected))
        }
        case 'body': {
          const tokens = parsePath(a.target)
          if (!tokens) return fail(`la ruta "${a.target}" no es válida`)
          const body = parseBody()
          if (!body.ok) {
            // Sin JSON solo se puede revisar el texto completo
            if (tokens.length > 0) return fail('el body no es JSON')
            return done(check(a.op, { found: true, value: response.body }, a.expected))
          }
          return done(check(a.op, getByPath(body.value, tokens), a.expected))
        }
      }
    })
}
