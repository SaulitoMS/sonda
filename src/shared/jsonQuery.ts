/**
 * Consultas sobre JSON para el filtro de la respuesta.
 *
 * Sintaxis (subconjunto de JSONPath):
 *   data.items[0].name        ruta simple
 *   items[-1]                 último elemento
 *   items[*].id   items.*.id  todos los elementos
 *   ..email                   busca "email" a cualquier profundidad
 *   items[?(@.price > 10 && @.active == true)]   filtra por condición
 *   items[?(@.name ~= 'ana' || @.role == "admin")]
 *
 * Operadores: == != > >= < <= y ~= ("contiene", sin distinguir mayúsculas).
 * Un `@.campo` solo (sin operador) pide que el campo exista y no sea null/false.
 */

type Step =
  | { kind: 'key'; key: string }
  | { kind: 'index'; index: number }
  | { kind: 'wildcard' }
  | { kind: 'deep'; key: string }
  | { kind: 'filter'; test: (item: unknown) => boolean }

export interface QueryResult {
  found: boolean
  value?: unknown
  invalid?: boolean
}

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'

const children = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : isObject(v) ? Object.values(v) : []

/** Índice del `]` que cierra el `[` de la posición `start`, respetando comillas y corchetes anidados */
function closingBracket(s: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '[') depth++
    else if (c === ']' && --depth === 0) return i
  }
  return -1
}

/** Divide por un separador (&& o ||) ignorando los que estén dentro de comillas */
function splitTop(expr: string, sep: string): string[] {
  const parts: string[] = []
  let quote: string | null = null
  let last = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (expr.startsWith(sep, i)) {
      parts.push(expr.slice(last, i))
      i += sep.length - 1
      last = i + 1
    }
  }
  parts.push(expr.slice(last))
  return parts
}

function parseLiteral(raw: string): { value: unknown } | null {
  const t = raw.trim()
  const quoted = /^(['"])(.*)\1$/s.exec(t)
  if (quoted) return { value: quoted[2] }
  if (t === 'true') return { value: true }
  if (t === 'false') return { value: false }
  if (t === 'null') return { value: null }
  if (t !== '' && Number.isFinite(Number(t))) return { value: Number(t) }
  return null
}

const toNumber = (v: unknown): number =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN

function looseEquals(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'number' && typeof actual === 'string') return toNumber(actual) === expected
  if (typeof expected === 'string' && typeof actual === 'number') return String(actual) === expected
  return actual === expected
}

function compare(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case '==':
      return looseEquals(actual, expected)
    case '!=':
      return !looseEquals(actual, expected)
    case '~=':
      return (
        actual !== undefined &&
        actual !== null &&
        String(typeof actual === 'object' ? JSON.stringify(actual) : actual)
          .toLowerCase()
          .includes(String(expected).toLowerCase())
      )
  }
  const a = toNumber(actual)
  const b = toNumber(expected)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  if (op === '>') return a > b
  if (op === '>=') return a >= b
  if (op === '<') return a < b
  return a <= b
}

const CONDITION = /^@([^\s=!<>~]*)\s*(?:(==|!=|>=|<=|~=|>|<)\s*(.+))?$/s

function parseCondition(raw: string): ((item: unknown) => boolean) | null {
  const m = CONDITION.exec(raw.trim())
  if (!m) return null

  const path = parseQuery(m[1])
  if (!path) return null
  const read = (item: unknown): unknown => run(path, item).nodes[0]

  if (!m[2]) {
    return (item) => {
      const v = read(item)
      return v !== undefined && v !== null && v !== false
    }
  }
  const literal = parseLiteral(m[3])
  if (!literal) return null
  const op = m[2]
  return (item) => compare(read(item), op, literal.value)
}

function parseFilter(expr: string): ((item: unknown) => boolean) | null {
  const orGroups: ((item: unknown) => boolean)[][] = []
  for (const orPart of splitTop(expr, '||')) {
    const tests: ((item: unknown) => boolean)[] = []
    for (const andPart of splitTop(orPart, '&&')) {
      const test = parseCondition(andPart)
      if (!test) return null
      tests.push(test)
    }
    orGroups.push(tests)
  }
  return (item) => orGroups.some((tests) => tests.every((t) => t(item)))
}

function parseBracket(inner: string): Step | null {
  if (inner === '*') return { kind: 'wildcard' }
  if (/^-?\d+$/.test(inner)) return { kind: 'index', index: Number(inner) }
  const quoted = /^(['"])(.*)\1$/s.exec(inner)
  if (quoted) return { kind: 'key', key: quoted[2] }
  const filter = /^\?\((.*)\)$/s.exec(inner)
  if (filter) {
    const test = parseFilter(filter[1])
    return test ? { kind: 'filter', test } : null
  }
  return null
}

function parseQuery(expr: string): Step[] | null {
  let s = expr.trim()
  if (s.startsWith('$')) s = s.slice(1)

  const steps: Step[] = []
  let i = 0
  while (i < s.length) {
    if (s.startsWith('..', i)) {
      const m = /^[^.[\]*]+/.exec(s.slice(i + 2))
      if (!m) return null
      steps.push({ kind: 'deep', key: m[0] })
      i += 2 + m[0].length
    } else if (s[i] === '[') {
      const end = closingBracket(s, i)
      if (end === -1) return null
      const step = parseBracket(s.slice(i + 1, end).trim())
      if (!step) return null
      steps.push(step)
      i = end + 1
    } else {
      if (s[i] === '.') i++
      if (s[i] === '*') {
        steps.push({ kind: 'wildcard' })
        i++
        continue
      }
      const m = /^[^.[\]]+/.exec(s.slice(i))
      if (!m) return null
      steps.push({ kind: 'key', key: m[0] })
      i += m[0].length
    }
  }
  return steps
}

function collectDeep(node: unknown, key: string, out: unknown[]): void {
  if (!isObject(node)) return
  if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, key)) out.push(node[key])
  for (const child of children(node)) collectDeep(child, key, out)
}

function run(steps: Step[], root: unknown): { nodes: unknown[]; multi: boolean } {
  let nodes: unknown[] = [root]
  let multi = false

  for (const step of steps) {
    const next: unknown[] = []
    for (const node of nodes) {
      switch (step.kind) {
        case 'key':
          if (
            isObject(node) &&
            !Array.isArray(node) &&
            Object.prototype.hasOwnProperty.call(node, step.key)
          )
            next.push(node[step.key])
          break
        case 'index':
          if (Array.isArray(node)) {
            const i = step.index < 0 ? node.length + step.index : step.index
            if (i >= 0 && i < node.length) next.push(node[i])
          }
          break
        case 'wildcard':
          next.push(...children(node))
          break
        case 'deep':
          collectDeep(node, step.key, next)
          break
        case 'filter':
          next.push(...children(node).filter(step.test))
          break
      }
    }
    if (step.kind === 'wildcard' || step.kind === 'deep' || step.kind === 'filter') multi = true
    nodes = next
  }
  return { nodes, multi }
}

/** Evalúa la consulta. Con comodines, filtros o `..` devuelve un array con todos los resultados */
export function queryJson(root: unknown, expr: string): QueryResult {
  const steps = parseQuery(expr)
  if (!steps) return { found: false, invalid: true }

  const { nodes, multi } = run(steps, root)
  if (multi) return { found: true, value: nodes }
  return nodes.length > 0 ? { found: true, value: nodes[0] } : { found: false }
}