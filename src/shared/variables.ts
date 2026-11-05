import { resolveDynamic } from './dynamicVariables'
import type { Environment, EnvVariable, KeyValueData } from './types'

// El $ inicial es opcional: {{nombre}} es del entorno, {{$nombre}} es dinámica
const VAR_RE = /\{\{\s*(\$?[\w.-]+)\s*\}\}/g

/** Convierte un entorno en un mapa clave → valor (solo variables activas) */
export function buildVarMap(env: Environment | null | undefined): Record<string, string> {
  const map: Record<string, string> = {}
  if (!env) return map
  for (const v of env.variables) {
    if (v.enabled && v.key.trim()) map[v.key.trim()] = v.value
  }
  return map
}

/**
 * Suma las variables de una colección a un entorno. Tienen la prioridad más baja:
 * si el entorno define la misma clave, gana el entorno.
 */
export function withCollectionVariables(
  env: Environment | null,
  collectionVars: KeyValueData[] | undefined
): Environment | null {
  const extra = (collectionVars ?? []).filter((v) => v.enabled && v.key.trim())
  if (extra.length === 0) return env

  const base = env?.variables ?? []
  const taken = new Set(base.filter((v) => v.enabled && v.key.trim()).map((v) => v.key.trim()))
  const added = extra
    .filter((v) => !taken.has(v.key.trim()))
    .map((v) => ({
      id: `collection:${v.key.trim()}`,
      key: v.key.trim(),
      value: v.value,
      secret: false,
      enabled: true
    }))

  return {
    id: env?.id ?? 'collection',
    name: env?.name ?? 'Colección',
    variables: [...base, ...added]
  }
}

/** Id reservado para mostrar las variables globales como una entrada más del editor de entornos */
export const GLOBALS_ID = '__globals__'

/**
 * Suma las variables globales a un entorno. Tienen la prioridad más baja:
 * si el entorno (o la colección ya mezclada en él) define la misma clave, gana esa.
 */
export function withGlobalVariables(
  env: Environment | null,
  globals: EnvVariable[] | undefined
): Environment | null {
  const extra = (globals ?? []).filter((v) => v.enabled && v.key.trim())
  if (extra.length === 0) return env

  const base = env?.variables ?? []
  const taken = new Set(base.filter((v) => v.enabled && v.key.trim()).map((v) => v.key.trim()))
  const added = extra
    .filter((v) => !taken.has(v.key.trim()))
    .map((v) => ({ ...v, key: v.key.trim() }))
  if (added.length === 0) return env

  return env
    ? { ...env, variables: [...base, ...added] }
    : { id: 'globals', name: 'Globales', variables: added }
}

export interface InterpolateOptions {
  /** Resolver también las {{$dinámicas}} (por defecto sí) */
  dynamic?: boolean
}

/** Reemplaza {{nombre}} por su valor y reporta las variables que no existen */
export function interpolate(
  text: string,
  vars: Record<string, string>,
  options: InterpolateOptions = {}
): { text: string; missing: string[] } {
  const dynamic = options.dynamic ?? true
  const missing = new Set<string>()
  const out = text.replace(VAR_RE, (match, name: string) => {
    if (dynamic && name.startsWith('$')) {
      const value = resolveDynamic(name)
      if (value !== undefined) return value
    } else if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name]
    }
    missing.add(name)
    return match
  })
  return { text: out, missing: [...missing] }
}
