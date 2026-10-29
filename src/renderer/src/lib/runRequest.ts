import { buildAuth } from '../../../shared/auth'
import { appendQuery } from '../../../shared/params'
import type {
  AuthConfig,
  Environment,
  HttpMethod,
  ResponseSchemas,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { validateResponse } from '../../../shared/validate'
import { buildVarMap, interpolate } from '../../../shared/variables'

export interface RequestDraft {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  auth?: AuthConfig | null
  responseSchemas?: ResponseSchemas | null
}

export interface ExecuteResult {
  response: SendRequestResult
  validation: SchemaValidation | null
  /** Avisos que no impiden enviar (ej: la auth quedó vacía y se omitió) */
  warnings: string[]
}

const looksLikeJson = (text: string): boolean => {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Resuelve {{variables}}, envía la petición y valida la respuesta contra su schema.
 * Lo usan tanto el botón "Enviar" como el runner de colecciones.
 */
export async function executeRequest(
  draft: RequestDraft,
  env: Environment | null
): Promise<ExecuteResult> {
  const vars = buildVarMap(env)
  const missing = new Set<string>()

  const resolve = (text: string): string => {
    const result = interpolate(text, vars)
    result.missing.forEach((m) => missing.add(m))
    return result.text
  }

  let finalUrl = resolve(draft.url.trim())
  const finalBody = draft.body.trim() ? resolve(draft.body) : undefined
  const headers = draft.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => ({ key: resolve(h.key), value: resolve(h.value) }))

  // La auth se resuelve antes de revisar variables faltantes para reportarlas también
  const authParts = buildAuth(draft.auth, resolve)

  if (missing.size > 0) {
    const names = [...missing].map((n) => `{{${n}}}`).join(', ')
    const hint = env
      ? `Defínelas en el entorno "${env.name}".`
      : 'Selecciona o crea un entorno en la cabecera.'
    return {
      response: { ok: false, error: `Variables sin definir: ${names}. ${hint}`, timeMs: 0 },
      validation: null,
      warnings: []
    }
  }

  // Un header escrito a mano tiene prioridad sobre el que genera la pestaña Auth
  for (const h of authParts.headers) {
    if (!headers.some((x) => x.key.toLowerCase() === h.key.toLowerCase())) headers.push(h)
  }
  finalUrl = appendQuery(finalUrl, authParts.query)

  const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
  if (finalBody && !hasContentType && looksLikeJson(finalBody)) {
    headers.push({ key: 'Content-Type', value: 'application/json' })
  }

  const response = await window.api.sendRequest({
    method: draft.method,
    url: finalUrl,
    headers,
    body: finalBody
  })

  const validation =
    response.ok && draft.responseSchemas
      ? validateResponse({
          schemas: draft.responseSchemas,
          status: response.status,
          method: draft.method,
          headers: response.headers,
          body: response.body
        })
      : null

   return { response, validation, warnings: authParts.warnings }
}