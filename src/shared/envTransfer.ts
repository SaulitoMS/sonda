import type { EnvVariable, Environment } from './types'

const FORMAT = 'sonda-environment'

type Raw = Record<string, unknown>

const isObj = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x)

/** Serializa un entorno a JSON. Los secretos salen vacíos salvo que se pida lo contrario */
export function exportEnvironment(env: Environment, includeSecrets: boolean): string {
  return (
    JSON.stringify(
      {
        format: FORMAT,
        version: 1,
        name: env.name,
        variables: env.variables
          .filter((v) => v.key.trim())
          .map((v) => ({
            key: v.key.trim(),
            value: v.secret && !includeSecrets ? '' : v.value,
            secret: v.secret,
            enabled: v.enabled
          }))
      },
      null,
      2
    ) + '\n'
  )
}

function toVariables(list: unknown, envName: string, warnings: string[]): EnvVariable[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: EnvVariable[] = []
  for (const item of list) {
    if (!isObj(item) || typeof item.key !== 'string' || !item.key.trim()) continue
    const key = item.key.trim()
    if (seen.has(key)) {
      warnings.push(`"${envName}": "${key}" estaba repetida, se conservó la primera`)
      continue
    }
    seen.add(key)
    out.push({
      id: crypto.randomUUID(),
      key,
      value: item.value == null ? '' : String(item.value),
      secret: item.secret === true || item.type === 'secret',
      enabled: item.enabled !== false
    })
  }
  return out
}

/**
 * Lee entornos desde texto JSON. Acepta:
 *  - un entorno exportado por Sonda
 *  - el environments.json de Sonda (varios entornos)
 *  - un entorno exportado desde Postman (campo "values")
 */
export function parseEnvironments(
  text: string,
  fallbackName: string
): { environments: Environment[]; warnings: string[] } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }

  const candidates: unknown[] =
    isObj(json) && Array.isArray(json.environments) ? json.environments : [json]

  const warnings: string[] = []
  const environments: Environment[] = []

  for (const c of candidates) {
    if (!isObj(c)) continue
    const rawList = Array.isArray(c.variables) ? c.variables : c.values
    if (!Array.isArray(rawList)) continue
    const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : fallbackName
    environments.push({
      id: crypto.randomUUID(),
      name,
      variables: toVariables(rawList, name, warnings)
    })
  }

  if (environments.length === 0) {
    throw new Error('No se encontró ningún entorno en el archivo (formato Sonda o Postman)')
  }
  return { environments, warnings }
}
