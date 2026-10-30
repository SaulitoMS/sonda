import { emptyAssertion } from './assertions'
import type { Assertion, SendRequestResult } from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

const MAX_BODY_RULES = 12
const MAX_DEPTH = 2

/** Textos cortos y estables (ej: "active") sí se fijan; fechas, ids y números largos no */
const isStableText = (v: string): boolean =>
  v.length > 0 && v.length <= 20 && !/\d/.test(v) && !/\s/.test(v)

const make = (
  kind: Assertion['kind'],
  patch: Partial<Pick<Assertion, 'target' | 'op' | 'expected'>>
): Assertion => ({ ...emptyAssertion(kind), ...patch })

/** Camina el JSON y junta rutas (data.items[0].id) hasta un máximo, sin entrar a más de MAX_DEPTH niveles */
function collectBodyRules(value: unknown, path: string, depth: number, out: Assertion[]): void {
  if (out.length >= MAX_BODY_RULES) return

  if (Array.isArray(value)) {
    if (path) out.push(make('body', { target: `${path}[0]`, op: 'exists' }))
    if (value.length > 0 && depth < MAX_DEPTH)
      collectBodyRules(value[0], `${path}[0]`, depth + 1, out)
    return
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (out.length >= MAX_BODY_RULES) return
      // Claves con puntos o corchetes no se pueden escribir en una ruta simple
      if (/[.[\]]/.test(key)) continue
      const childPath = path ? `${path}.${key}` : key

      if (child !== null && typeof child === 'object') {
        if (depth < MAX_DEPTH) collectBodyRules(child, childPath, depth + 1, out)
        else out.push(make('body', { target: childPath, op: 'exists' }))
        continue
      }

      if (typeof child === 'boolean' || (typeof child === 'string' && isStableText(child))) {
        out.push(make('body', { target: childPath, op: 'eq', expected: String(child) }))
      } else {
        out.push(make('body', { target: childPath, op: 'exists' }))
      }
    }
  }
}

/**
 * Propone aserciones a partir de una respuesta real:
 * status exacto, tiempo con margen, content-type y la forma del JSON.
 * Solo verifica lo estable: no fija valores que cambian en cada llamada (ids, fechas, contadores).
 */
export function generateAssertions(response: OkResponse): Assertion[] {
  const rules: Assertion[] = [make('status', { op: 'eq', expected: String(response.status) })]

  // Margen de 3x redondeado a los 500 ms siguientes, para no fallar por un pico de red
  const limit = Math.max(500, Math.ceil((response.timeMs * 3) / 500) * 500)
  rules.push(make('time', { op: 'lt', expected: String(limit) }))

  const contentType = Object.entries(response.headers).find(
    ([k]) => k.toLowerCase() === 'content-type'
  )?.[1]
  const mediaType = contentType?.split(';')[0].trim().toLowerCase()
  if (mediaType) {
    rules.push(make('header', { target: 'content-type', op: 'contains', expected: mediaType }))
  }

  if (response.body.trim()) {
    try {
      const parsed: unknown = JSON.parse(response.body)
      const bodyRules: Assertion[] = []
      collectBodyRules(parsed, '', 0, bodyRules)
      rules.push(...bodyRules)
    } catch {
      // No es JSON: solo se verifican status, tiempo y content-type
    }
  }

  return rules
}

/** Agrega solo las reglas que no existan ya (mismo tipo, destino, operador y valor) */
export function mergeAssertions(current: Assertion[], generated: Assertion[]): Assertion[] {
  const signature = (a: Assertion): string => `${a.kind}|${a.target.trim()}|${a.op}|${a.expected}`
  const existing = new Set(current.map(signature))
  return [...current, ...generated.filter((a) => !existing.has(signature(a)))]
}
