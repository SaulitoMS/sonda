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

/* ---------- Archivos .env ---------- */

const DOTENV_KEY = /^[A-Za-z_][A-Za-z0-9_.-]*$/
/** Nombres que casi siempre guardan credenciales: se importan como secreto (cifrados en el keychain) */
const SECRET_KEY = /(secret|token|passw(or)?d|pwd|api[_-]?key|private|credential|auth)/i

const UNESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }

/** "staging.env" → "staging", ".env.production" → "production", ".env" → "env", "x.json" → "x" */
export function envNameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '')
  const name = /^\.env(\.|$)/i.test(base)
    ? base.replace(/^\.env\.?/i, '')
    : base.replace(/\.[^.]+$/, '')
  return name || 'env'
}

/** Posición de la comilla de cierre dentro de `text` (en comillas dobles se respeta \"), o -1 */
function findClosingQuote(text: string, quote: string): number {
  for (let i = 0; i < text.length; i++) {
    if (quote === '"' && text[i] === '\\') {
      i++
      continue
    }
    if (text[i] === quote) return i
  }
  return -1
}

/**
 * Lee un archivo .env: `CLAVE=valor`, `export CLAVE=valor`, comentarios con #, valores con
 * comillas dobles (con \n, \" y \\) o simples (literales), y valores entre comillas en varias líneas.
 * Las claves que parecen credenciales (token, password, api key…) se importan como secreto.
 */
export function parseDotenv(
  text: string,
  fallbackName: string
): { environments: Environment[]; warnings: string[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const warnings: string[] = []
  const seen = new Set<string>()
  const variables: EnvVariable[] = []
  let interpolated = false

  for (let i = 0; i < lines.length; i++) {
    const start = i
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue

    const match = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line)
    if (!match) {
      warnings.push(`Línea ${start + 1} ignorada: no tiene el formato CLAVE=valor`)
      continue
    }
    const key = match[1]
    const rest = match[2]

    let value: string
    let literal = false
    const quote = rest[0]
    if (quote === '"' || quote === "'") {
      let buffer = rest.slice(1)
      let closed = findClosingQuote(buffer, quote)
      let last = i
      while (closed === -1 && last + 1 < lines.length) {
        last++
        buffer += '\n' + lines[last]
        closed = findClosingQuote(buffer, quote)
      }
      i = last
      if (closed === -1) {
        warnings.push(`Línea ${start + 1}: comillas sin cerrar en "${key}"`)
        continue
      }
      const inner = buffer.slice(0, closed)
      literal = quote === "'"
      value = literal ? inner : inner.replace(/\\(n|r|t|"|\\)/g, (_m, c: string) => UNESCAPES[c])
    } else {
      value = rest.replace(/\s+#.*$/, '').trim()
    }

    if (!DOTENV_KEY.test(key)) {
      warnings.push(`Línea ${start + 1}: "${key}" no es un nombre de variable válido`)
      continue
    }
    if (seen.has(key)) {
      warnings.push(`"${key}" estaba repetida, se conservó la primera`)
      continue
    }
    seen.add(key)
    if (!literal && /\$\{[^}]+\}/.test(value)) interpolated = true
    variables.push({
      id: crypto.randomUUID(),
      key,
      value,
      secret: SECRET_KEY.test(key),
      enabled: true
    })
  }

  if (variables.length === 0) {
    throw new Error('No se encontraron variables CLAVE=valor en el archivo')
  }
  if (interpolated) {
    warnings.push('Algunos valores usan ${VAR}: Sonda no los expande, cámbialos por {{VAR}}')
  }
  return { environments: [{ id: crypto.randomUUID(), name: fallbackName, variables }], warnings }
}

const quoteDotenv = (value: string): string =>
  value === '' || /^[^\s"'#\\$`]+$/.test(value)
    ? value
    : `"${value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')}"`

/** Serializa un entorno como .env. Los secretos salen vacíos salvo que se pida lo contrario */
export function exportDotenv(env: Environment, includeSecrets: boolean): string {
  const lines = [`# Entorno: ${env.name.replace(/\s+/g, ' ')}`]
  for (const v of env.variables) {
    const key = v.key.trim()
    if (!key) continue
    if (!DOTENV_KEY.test(key)) {
      lines.push(`# (omitida: "${key}" no es un nombre válido para .env)`)
      continue
    }
    const value = v.secret && !includeSecrets ? '' : v.value
    lines.push(`${v.enabled ? '' : '# '}${key}=${quoteDotenv(value)}`)
  }
  return lines.join('\n') + '\n'
}

/** Lee un archivo de entornos según su contenido: JSON (Sonda o Postman) o .env */
export function parseEnvironmentFile(
  text: string,
  fileName: string
): { environments: Environment[]; warnings: string[] } {
  const name = envNameFromFile(fileName)
  const head = text.replace(/^\uFEFF/, '').trimStart()
  return head.startsWith('{') || head.startsWith('[')
    ? parseEnvironments(text, name)
    : parseDotenv(text, name)
}