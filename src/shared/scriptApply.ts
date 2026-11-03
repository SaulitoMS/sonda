import type {
  AssertionResult,
  ExtractionResult,
  HttpMethod,
  ScriptOutput,
  ScriptRequest
} from './types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

interface HeaderRow {
  key: string
  value: string
  enabled: boolean
}

export interface RequestParts {
  method: HttpMethod
  url: string
  headers: HeaderRow[]
  body: string
}

/** Headers activos como objeto, que es como los ve un script */
export function headersToObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of rows) if (h.enabled && h.key.trim()) out[h.key.trim()] = h.value
  return out
}

/**
 * Aplica a la petición lo que el pre-script dejó en sonda.request.
 * Los headers solo se reescriben si el script los cambió; los desactivados se conservan.
 */
export function applyScriptRequest(
  before: RequestParts,
  after: ScriptRequest
): { ok: true; request: RequestParts } | { ok: false; error: string } {
  const method = after.method.trim().toUpperCase()
  if (!METHODS.includes(method as HttpMethod)) {
    return { ok: false, error: `método inválido "${after.method}"` }
  }

  const changed = JSON.stringify(headersToObject(before.headers)) !== JSON.stringify(after.headers)
  const headers = changed
    ? [
        ...before.headers.filter((h) => !h.enabled),
        ...Object.entries(after.headers).map(([key, value]) => ({ key, value, enabled: true }))
      ]
    : before.headers

  return {
    ok: true,
    request: { method: method as HttpMethod, url: after.url, headers, body: after.body }
  }
}

/** Variables que asignó el script, con la forma de una extracción para guardarlas en el entorno */
export const scriptEnvResults = (envSet: Record<string, string>): ExtractionResult[] =>
  Object.entries(envSet).map(([variable, value]) => ({
    id: `script:${variable}`,
    variable,
    ok: true,
    value,
    secret: false,
    message: ''
  }))

/** Cada sonda.test(...) del script, y su error si lo hubo, como una aserción más */
export function scriptAssertionResults(out: ScriptOutput): AssertionResult[] {
  const rows: AssertionResult[] = out.tests.map((t, i) => ({
    id: `script:test:${i}`,
    label: `Script: ${t.name}`,
    passed: t.passed,
    message: t.message
  }))
  if (!out.ok) {
    rows.push({ id: 'script:error', label: 'Script de respuesta', passed: false, message: out.error })
  }
  return rows
}

/** Lo que el script escribió con console.log, como avisos (máximo 20) */
export const scriptLogWarnings = (logs: string[], phase: 'pre' | 'post'): string[] =>
  logs
    .slice(0, 20)
    .map((l) => `console (${phase === 'pre' ? 'pre-script' : 'post-script'}): ${l}`)