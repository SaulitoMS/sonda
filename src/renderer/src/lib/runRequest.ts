import { evaluateAssertions } from '../../../shared/assertions'
import { buildAuth } from '../../../shared/auth'
import { clearOAuthCache, getOAuthToken } from './oauth'
import { formDataParts, urlencodedBody } from '../../../shared/bodyForm'
import { evaluateExtractions } from '../../../shared/extract'
import { appendQuery } from '../../../shared/params'
import { resolveAuthForPath } from './inheritedAuth'
import type {
  Assertion,
  AssertionResult,
  AuthConfig,
  BodyFormData,
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
import { resolveHeadersForPath } from './inheritedHeaders'
import { retryDelayMs, shouldRetry } from '../../../shared/retry'
import { isCancelled } from './inFlight'

export interface RequestDraft {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  /** Body de formulario. Si no viene o su modo es "raw", se envía `body` */
  bodyForm?: BodyFormData | null
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
  env: Environment | null,
  options: { requestId?: string; path?: string | null } = {}
): Promise<ExecuteResult> {
  const vars = buildVarMap(env)
  const missing = new Set<string>()

  const resolve = (text: string): string => {
    const result = interpolate(text, vars)
    result.missing.forEach((m) => missing.add(m))
    return result.text
  }

  const mode = draft.bodyForm?.mode ?? 'raw'
  const formFields = draft.bodyForm?.fields ?? []

  let finalUrl = resolve(draft.url.trim())
  const finalBody =
    mode === 'urlencoded'
      ? urlencodedBody(formFields, resolve) || undefined
      : mode === 'raw' && draft.body.trim()
        ? resolve(draft.body)
        : undefined
  // En form-data no hay body de texto: el proceso principal arma el multipart
  const formParts = mode === 'form-data' ? formDataParts(formFields, resolve) : undefined
  const headers = draft.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => ({ key: resolve(h.key), value: resolve(h.value) }))

  // Headers heredados de la colección / carpeta: los de la petición tienen prioridad
  for (const h of resolveHeadersForPath(options.path)) {
    const key = resolve(h.key)
    if (!headers.some((x) => x.key.toLowerCase() === key.toLowerCase())) {
      headers.push({ key, value: resolve(h.value) })
    }
  }

  // La auth se resuelve antes de revisar variables faltantes para reportarlas también.
  // Auth efectiva: la de la petición o, si hereda, la de su carpeta / colección
  const auth = resolveAuthForPath(draft.auth, options.path).auth
  const authParts = buildAuth(auth, resolve)
  const oauth =
    auth?.type === 'oauth2'
      ? {
          tokenUrl: resolve((auth.oauthTokenUrl ?? '').trim()),
          clientId: resolve((auth.oauthClientId ?? '').trim()),
          clientSecret: resolve(auth.oauthClientSecret ?? ''),
          scope: resolve(auth.oauthScope ?? '')
        }
      : null

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

  // OAuth 2.0: pide el token (o reutiliza el que sigue vigente) y lo manda como Bearer
  let oauthFromCache = false
  if (oauth) {
    const result = await getOAuthToken(oauth)
    if (!result.ok) {
      return {
        response: { ok: false, error: result.error, timeMs: 0 },
        validation: null,
        requestValidation: null,
        assertionResults: [],
        extractions: [],
        warnings: []
      }
    }
    oauthFromCache = result.cached
    authParts.headers.push({ key: 'Authorization', value: `Bearer ${result.token}` })
  }

  // Un header escrito a mano tiene prioridad sobre el que genera la pestaña Auth
  for (const h of authParts.headers) {
    if (!headers.some((x) => x.key.toLowerCase() === h.key.toLowerCase())) headers.push(h)
  }
  finalUrl = appendQuery(finalUrl, authParts.query)

  const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
  if (finalBody && !hasContentType) {
    if (mode === 'urlencoded') {
      headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
    } else if (mode === 'raw' && looksLikeJson(finalBody)) {
      headers.push({ key: 'Content-Type', value: 'application/json' })
    }
  }

  // Solo avisa: la petición se envía igual, para poder probar cómo reacciona la API a un body malo
  const requestValidation = validateRequestBody({
    schema: draft.requestSchema,
    method: draft.method,
    // El schema de la spec es de JSON: solo tiene sentido con el body de texto
    body: mode === 'raw' ? (finalBody ?? '') : ''
  })
  const warnings = [...authParts.warnings]
  if (requestValidation?.verdict === 'invalid') {
    const n = requestValidation.issues.filter((i) => i.severity === 'error').length
    warnings.push(
      `El body enviado no cumple el schema de la spec (${n} ${n === 1 ? 'error' : 'errores'}). Revísalo en la pestaña Body.`
    )
  }

  const settings = await window.api.loadSettings()
  const sendInput = {
    method: draft.method,
    url: finalUrl,
    headers,
    body: finalBody,
    formData: formParts,
    requestId: options.requestId
  }

  let response = await window.api.sendRequest(sendInput)

  // Reintentos automáticos (solo métodos idempotentes, ver shared/retry.ts)
  let retried = 0
  while (retried < settings.retries && shouldRetry(draft.method, response)) {
    const wait = retryDelayMs(retried + 1, settings.retryDelayMs, response)
    await new Promise((resolve) => setTimeout(resolve, wait))
    // Si el usuario canceló mientras esperaba, se conserva la última respuesta y no se reintenta
    if (options.requestId && isCancelled(options.requestId)) break
    retried++
    response = await window.api.sendRequest(sendInput)
  }
  if (retried > 0) {
    warnings.push(
      `Se reintentó ${retried} ${retried === 1 ? 'vez' : 'veces'} antes de obtener esta respuesta.`
    )
  }

  // Un 401 con un token reutilizado suele ser un token caducado: se descarta para que el próximo envío pida otro
  if (oauth && oauthFromCache && response.ok && response.status === 401) {
    clearOAuthCache()
    warnings.push('El token OAuth guardado fue rechazado (401). Se descartó: vuelve a enviar.')
  }

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
