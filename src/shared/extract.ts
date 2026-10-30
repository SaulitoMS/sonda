import { getByPath, parsePath } from './assertions'
import type {
  Environment,
  Extraction,
  ExtractionResult,
  ExtractionSource,
  SendRequestResult
} from './types'

type OkResponse = Extract<SendRequestResult, { ok: true }>

export const SOURCE_LABELS: Record<ExtractionSource, string> = {
  body: 'Body (JSON)',
  header: 'Header'
}

// Mismo alfabeto que reconoce {{variable}}; el $ queda reservado a las dinámicas
const VARIABLE_NAME = /^[\w.-]+$/

export const isValidVariableName = (name: string): boolean => VARIABLE_NAME.test(name.trim())

export function emptyExtraction(): Extraction {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    source: 'body',
    path: '',
    variable: '',
    secret: false
  }
}

const toText = (value: unknown): string =>
  typeof value === 'string' ? value : (JSON.stringify(value) ?? '')

/**
 * Lee de la respuesta los valores pedidos. No modifica nada: solo calcula qué se extrajo.
 * Las reglas desactivadas se omiten; el resultado conserva el orden de la lista.
 */
export function evaluateExtractions(
  extractions: Extraction[] | null | undefined,
  response: OkResponse
): ExtractionResult[] {
  if (!extractions?.length) return []

  // El body solo se parsea si alguna regla lo necesita, y una sola vez
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

  return extractions
    .filter((e) => e.enabled)
    .map((e): ExtractionResult => {
      const variable = e.variable.trim()
      const base = { id: e.id, variable, secret: e.secret }
      const fail = (message: string): ExtractionResult => ({ ...base, ok: false, message })
      const done = (value: string): ExtractionResult => ({ ...base, ok: true, value, message: '' })

      if (!variable) return fail('falta el nombre de la variable')
      if (!isValidVariableName(variable)) {
        return fail(`"${variable}" no es un nombre válido (usa letras, números, _ . -)`)
      }

      if (e.source === 'header') {
        const name = e.path.trim().toLowerCase()
        if (!name) return fail('falta el nombre del header')
        const key = Object.keys(response.headers).find((k) => k.toLowerCase() === name)
        if (key === undefined) return fail(`el header "${e.path.trim()}" no existe`)
        return done(response.headers[key])
      }

      const tokens = parsePath(e.path)
      if (!tokens) return fail(`la ruta "${e.path}" no es válida`)

      const body = parseBody()
      if (!body.ok) {
        if (tokens.length > 0) return fail('el body no es JSON')
        return done(response.body)
      }

      const found = getByPath(body.value, tokens)
      if (!found.found || found.value === undefined) {
        return fail(`la ruta "${e.path.trim() || '$'}" no existe en la respuesta`)
      }
      return done(toText(found.value))
    })
}

/**
 * Escribe los valores extraídos en un entorno: actualiza la variable si existe (y la activa)
 * o la crea. Devuelve el mismo objeto si nada cambió, para poder evitar guardados inútiles.
 */
export function applyExtractions(
  env: Environment,
  results: ExtractionResult[]
): { env: Environment; changed: boolean } {
  let variables = env.variables
  let changed = false

  for (const r of results) {
    if (!r.ok || r.value === undefined) continue
    const value = r.value
    const index = variables.findIndex((v) => v.key.trim() === r.variable)

    if (index === -1) {
      variables = [
        ...variables,
        { id: crypto.randomUUID(), key: r.variable, value, secret: r.secret, enabled: true }
      ]
      changed = true
    } else if (variables[index].value !== value || !variables[index].enabled) {
      variables = variables.map((v, i) => (i === index ? { ...v, value, enabled: true } : v))
      changed = true
    }
  }

  return { env: changed ? { ...env, variables } : env, changed }
}