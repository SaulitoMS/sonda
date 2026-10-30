import { evaluateAssertions } from '../../../shared/assertions'
import { buildAuth } from '../../../shared/auth'
import { evaluateExtractions } from '../../../shared/extract'
import { appendQuery } from '../../../shared/params'
import type {
  Assertion,
  AssertionResult,
  AuthConfig,
  Environment,
  Extraction,
  ExtractionResult,
  HttpMethod,
  JsonSchema,
  ResponseSchemas,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { validateRequestBody, validateResponse } from '../../../shared/validate'
import { buildVarMap, interpolate } from '../../../shared/variables'

export interface RequestDraft {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  auth?: AuthConfig | null
  responseSchemas?: ResponseSchemas | null
  /** Schema del body que espera la spec; si existe, se valida lo que se va a enviar */
  requestSchema?: JsonSchema | null
  assertions?: Assertion[] | null
  /** Valores de la respuesta que se guardarán en el entorno (lo hace quien llama) */
  extractions?: Extraction[] | null
}

export interface ExecuteResult {
  response: SendRequestResult
  validation: SchemaValidation | null
  /** Resultado de validar el body enviado contra el schema del requestBody (null si no aplica) */
  requestValidation: SchemaValidation | null
  /** Resultado de cada aserción activa (vacío si no hay o si la petición no llegó a responder) */
  assertionResults: AssertionResult[]
  /** Qué se pudo (o no) extraer de la respuesta. Aquí solo se calcula: guardarlo en el entorno es cosa de quien llama */
  extractions: ExtractionResult[]
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
      requestValidation: null,
      assertionResults: [],
      extractions: [],
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

  // Solo avisa: la petición se envía igual, para poder probar cómo reacciona la API a un body malo
  const requestValidation = validateRequestBody({
    schema: draft.requestSchema,
    method: draft.method,
    body: finalBody ?? ''
  })
  const warnings = [...authParts.warnings]
  if (requestValidation?.verdict === 'invalid') {
    const n = requestValidation.issues.filter((i) => i.severity === 'error').length
    warnings.push(
      `El body enviado no cumple el schema de la spec (${n} ${n === 1 ? 'error' : 'errores'}). Revísalo en la pestaña Body.`
    )
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

  const assertionResults = response.ok ? evaluateAssertions(draft.assertions, response) : []

  const extractions = response.ok ? evaluateExtractions(draft.extractions, response) : []

  return { response, validation, requestValidation, assertionResults, extractions, warnings }
}
