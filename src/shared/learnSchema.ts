import type { JsonSchema } from './types'

type Obj = Record<string, unknown>

const MAX_DEPTH = 8
/** Elementos de un array que se revisan para deducir su forma */
const MAX_SAMPLES = 50

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

type Kind = 'object' | 'array' | 'string' | 'boolean' | 'number'

const kindOf = (v: unknown): Kind =>
  Array.isArray(v)
    ? 'array'
    : isObj(v)
      ? 'object'
      : typeof v === 'number'
        ? 'number'
        : typeof v === 'boolean'
          ? 'boolean'
          : 'string'

function forKind(kind: Kind, values: unknown[], depth: number): JsonSchema {
  switch (kind) {
    case 'boolean':
      return { type: 'boolean' }
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: values.every((v) => Number.isInteger(v)) ? 'integer' : 'number' }
    case 'array': {
      const items = (values as unknown[][]).flat().slice(0, MAX_SAMPLES)
      return depth >= MAX_DEPTH || items.length === 0
        ? { type: 'array' }
        : { type: 'array', items: fromSamples(items, depth + 1) }
    }
    case 'object': {
      if (depth >= MAX_DEPTH) return { type: 'object' }
      const objs = values as Obj[]
      const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))]
      const properties: Obj = {}
      for (const k of keys) {
        properties[k] = fromSamples(
          objs.filter((o) => k in o).map((o) => o[k]),
          depth + 1
        )
      }
      // Solo es obligatorio lo que aparece en todas las muestras
      const required = keys.filter((k) => objs.every((o) => k in o))
      return { type: 'object', properties, ...(required.length ? { required } : {}) }
    }
  }
}

function fromSamples(samples: unknown[], depth: number): JsonSchema {
  const nullable = samples.some((s) => s === null)
  const present = samples.filter((s) => s !== null)
  if (present.length === 0) return { nullable: true }

  const kinds = [...new Set(present.map(kindOf))]
  const variants = kinds.map((k) => ({
    ...forKind(
      k,
      present.filter((s) => kindOf(s) === k),
      depth
    ),
    ...(nullable ? { nullable: true } : {})
  }))
  return variants.length === 1 ? variants[0] : { anyOf: variants }
}

/**
 * Deduce un schema a partir de una respuesta real: tipos, campos obligatorios
 * (los que aparecen en todos los elementos de un array) y valores null.
 * Es lo que se observó, no lo que la API promete: sirve como línea base contra regresiones.
 */
export function learnSchema(value: unknown): JsonSchema {
  return fromSamples([value], 0)
}
