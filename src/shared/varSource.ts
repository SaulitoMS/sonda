import type { Environment, EnvVariable, KeyValueData } from './types'

export type VarSource = 'environment' | 'collection' | 'global'

const has = (list: { key: string; enabled: boolean }[] | undefined, name: string): boolean =>
  (list ?? []).some((v) => v.enabled && v.key.trim() === name)

/**
 * De dónde sale el valor de una {{variable}}, con la misma prioridad que usa Sonda al enviar:
 * entorno activo > colección > globales. Devuelve null si no está definida.
 */
export function variableSource(
  name: string,
  env: Environment | null | undefined,
  collectionVars: KeyValueData[] | undefined,
  globals: EnvVariable[] | undefined
): VarSource | null {
  if (has(env?.variables, name)) return 'environment'
  if (has(collectionVars, name)) return 'collection'
  if (has(globals, name)) return 'global'
  return null
}
