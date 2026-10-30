import { resolveDynamic } from './dynamicVariables'
import type { Environment } from './types'

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
