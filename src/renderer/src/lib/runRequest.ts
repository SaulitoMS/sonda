import { evaluateAssertions } from '../../../shared/assertions'
import { buildAuth } from '../../../shared/auth'
import { clearOAuthCache, getOAuthToken } from './oauth'
import { binaryBodyPath, formDataParts, urlencodedBody } from '../../../shared/bodyForm'
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
  RequestOverrides,
  ResponseSchemas,
  SchemaValidation,
  SendRequestResult
} from '../../../shared/types'
import { validateRequestBody, validateResponse } from '../../../shared/validate'
import {
  buildVarMap,
  interpolate,
  withCollectionVariables,
  withGlobalVariables
} from '../../../shared/variables'
import { useEnvironmentStore } from '../store/useEnvironmentStore'
import { looksLikeXml } from '../../../shared/bodyType'
import { collectionVarsForPath } from './collectionVariables'
import { resolveHeadersForPath } from './inheritedHeaders'
import { resolveScriptForPath } from './inheritedScripts'
import { retryDelayMs, shouldRetry } from '../../../shared/retry'
import { isCancelled } from './inFlight'
import {
  applyScriptRequest,
  headersToObject,
  scriptAssertionResults,
  scriptEnvResults,
  scriptLogWarnings
} from '../../../shared/scriptApply'
import { buildDigestAuthorization, findDigestChallenge } from '../../../shared/digest'
import { signAwsV4 } from '../../../shared/awsSigV4'
import { decodeJwt, describeExpiry } from '../../../shared/jwt'

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
  /** Script que corre antes de resolver variables y enviar */
  preScript?: string | null
  /** Script que corre con la respuesta ya recibida */
  postScript?: string | null
  /** Tiempo límite y redirecciones propios de la petición (si faltan, valen los ajustes globales) */
  overrides?: RequestOverrides | null
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
  input: RequestDraft,
  env: Environment | null,
  options: { requestId?: string; path?: string | null; live?: boolean } = {}
): Promise<ExecuteResult> {
  // Las variables de la colección valen solo si el entorno no define la misma clave
  const vars = buildVarMap(
    withGlobalVariables(
      withCollectionVariables(env, collectionVarsForPath(options.path)),
      useEnvironmentStore.getState().data.globals
    )
  )
  const missing = new Set<string>()
  const warnings: string[] = []
  // Variables que asignaron los scripts: se guardan en el entorno igual que las extracciones
  let scriptEnv: ExtractionResult[] = []

  const failed = (error: string): ExecuteResult => ({
    response: { ok: false, error, timeMs: 0 },
    validation: null,
    requestValidation: null,
    assertionResults: [],
    extractions: scriptEnv,
    warnings
  })

  // ---- Pre-script: puede cambiar la petición y asignar variables ----
  // Corren primero los de la colección, luego los de la carpeta y al final el de la petición
  let draft = input
  const preCode = resolveScriptForPath(options.path, 'pre', input.preScript)
  if (preCode) {
    const out = await window.api.runScript({
      phase: 'pre',
      code: preCode,
      vars,
      request: {
        method: input.method,
        url: input.url,
        headers: headersToObject(input.headers),
        body: input.body
      }
    })
    warnings.push(...scriptLogWarnings(out.logs, 'pre'))
    if (!out.ok || !out.request) {
      return failed(`Error en el pre-script: ${out.error || 'sin resultado'}`)
    }
    const applied = applyScriptRequest(input, out.request)
    if (!applied.ok) return failed(`Error en el pre-script: ${applied.error}`)

    Object.assign(vars, out.envSet)
    scriptEnv = scriptEnvResults(out.envSet)
    draft = { ...input, ...applied.request }
  }

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
  // Modo archivo: la ruta puede llevar {{variables}} y el proceso principal lee el archivo
  const binaryFile = mode === 'binary' ? binaryBodyPath(formFields, resolve) : undefined
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
          grant: auth.oauthGrant ?? 'client_credentials',
          tokenUrl: resolve((auth.oauthTokenUrl ?? '').trim()),
          clientId: resolve((auth.oauthClientId ?? '').trim()),
          clientSecret: resolve(auth.oauthClientSecret ?? ''),
          scope: resolve(auth.oauthScope ?? ''),
          username: resolve((auth.oauthUsername ?? '').trim()),
          password: resolve(auth.oauthPassword ?? ''),
          authUrl: resolve((auth.oauthAuthUrl ?? '').trim()),
          redirectPort: Number(resolve((auth.oauthRedirectPort ?? '').trim())) || 0
        }
      : null

  const digest =
    auth?.type === 'digest'
      ? { username: resolve(auth.username), password: resolve(auth.password) }
      : null

  const aws =
    auth?.type === 'awsv4'
      ? {
          accessKey: resolve(auth.username).trim(),
          secretKey: resolve(auth.password),
          sessionToken: resolve(auth.token).trim(),
          region: resolve(auth.awsRegion ?? '').trim(),
          service: resolve(auth.awsService ?? '').trim()
        }
      : null

  if (missing.size > 0) {
    const names = [...missing].map((n) => `{{${n}}}`).join(', ')
    const hint = env
      ? `Defínelas en el entorno "${env.name}".`
      : 'Selecciona o crea un entorno en la cabecera.'
    return failed(`Variables sin definir: ${names}. ${hint}`)
  }

  if (mode === 'binary' && !binaryFile) {
    return failed('Modo archivo: elige el archivo que se enviará como body (pestaña Body).')
  }

  // OAuth 2.0: pide el token (o reutiliza el que sigue vigente) y lo manda como Bearer
  let oauthFromCache = false
  if (oauth) {
    const result = await getOAuthToken(oauth)
    if (!result.ok) return failed(result.error)
    oauthFromCache = result.cached
    authParts.headers.push({ key: 'Authorization', value: `Bearer ${result.token}` })
  }

  // Un header escrito a mano tiene prioridad sobre el que genera la pestaña Auth
  for (const h of authParts.headers) {
    if (!headers.some((x) => x.key.toLowerCase() === h.key.toLowerCase())) headers.push(h)
  }
  finalUrl = appendQuery(finalUrl, authParts.query)

  // Avisa si el Bearer que se va a enviar es un JWT ya vencido (la petición se envía igual)
  const bearer = headers.find((h) => h.key.toLowerCase() === 'authorization')?.value ?? ''
  if (/^Bearer\s/i.test(bearer)) {
    const jwt = decodeJwt(bearer)
    if (jwt?.expiresAt) {
      const { expired, label } = describeExpiry(jwt.expiresAt)
      if (expired) {
        warnings.push(
          `El token JWT de Authorization ya venció (${label.toLowerCase()}). Renuévalo antes de enviar.`
        )
      }
    }
  }

  const hasContentType = headers.some((h) => h.key.toLowerCase() === 'content-type')
  if (finalBody && !hasContentType) {
    if (mode === 'urlencoded') {
      headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' })
    } else if (mode === 'raw' && looksLikeJson(finalBody)) {
      headers.push({ key: 'Content-Type', value: 'application/json' })
    } else if (mode === 'raw' && looksLikeXml(finalBody)) {
      headers.push({ key: 'Content-Type', value: 'application/xml' })
    }
  }

  if (binaryFile && !hasContentType) {
    headers.push({ key: 'Content-Type', value: 'application/octet-stream' })
  }

  // AWS Signature V4: se firma al final, cuando URL, headers y body ya son los definitivos
  if (aws) {
    if (!aws.accessKey || !aws.secretKey || !aws.region || !aws.service) {
      warnings.push(
        'Auth AWS: faltan Access Key, Secret Key, región o servicio, no se firmó la petición.'
      )
    } else if (formParts || binaryFile) {
      warnings.push(
        'Auth AWS: no se puede firmar un body form-data o de archivo, no se firmó la petición.'
      )
    } else {
      try {
        const signedHeaders = await signAwsV4({
          method: draft.method,
          url: finalUrl,
          headers,
          body: finalBody ?? '',
          accessKey: aws.accessKey,
          secretKey: aws.secretKey,
          sessionToken: aws.sessionToken || undefined,
          region: aws.region,
          service: aws.service
        })
        for (const h of signedHeaders) {
          const i = headers.findIndex((x) => x.key.toLowerCase() === h.key.toLowerCase())
          if (i >= 0) headers.splice(i, 1)
          headers.push(h)
        }
      } catch {
        warnings.push('Auth AWS: no se pudo firmar la petición (revisa la URL).')
      }
    }
  }

  // Solo avisa: la petición se envía igual, para poder probar cómo reacciona la API a un body malo
  const requestValidation = validateRequestBody({
    schema: draft.requestSchema,
    method: draft.method,
    // El schema de la spec es de JSON: solo tiene sentido con el body de texto
    body: mode === 'raw' ? (finalBody ?? '') : ''
  })
  warnings.push(...authParts.warnings)
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
    bodyFile: binaryFile,
    requestId: options.requestId,
    live: options.live,
    timeoutMs: draft.overrides?.timeoutSeconds ? draft.overrides.timeoutSeconds * 1000 : undefined,
    followRedirects: draft.overrides?.followRedirects
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

  // Digest: el servidor responde 401 con un desafío y la petición se reenvía firmada
  if (
    digest &&
    response.ok &&
    response.status === 401 &&
    !headers.some((h) => h.key.toLowerCase() === 'authorization') &&
    !(options.requestId && isCancelled(options.requestId))
  ) {
    const challenge = findDigestChallenge(response.headers)
    if (!challenge) {
      warnings.push(
        'Auth Digest: el servidor respondió 401 sin un desafío Digest compatible (MD5 o SHA-256 con qop=auth).'
      )
    } else {
      try {
        const u = new URL(finalUrl)
        const authorization = await buildDigestAuthorization({
          challenge,
          username: digest.username,
          password: digest.password,
          method: draft.method,
          uri: u.pathname + u.search
        })
        response = await window.api.sendRequest({
          ...sendInput,
          headers: [...headers, { key: 'Authorization', value: authorization }]
        })
      } catch {
        warnings.push('Auth Digest: no se pudo firmar la petición (revisa la URL).')
      }
    }
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

  // ---- Post-script: tests y variables a partir de la respuesta ----
  const postCode = resolveScriptForPath(options.path, 'post', draft.postScript)
  if (response.ok && postCode) {
    const out = await window.api.runScript({
      phase: 'post',
      code: postCode,
      vars,
      response: {
        status: response.status,
        statusText: response.statusText,
        timeMs: response.timeMs,
        headers: response.headers,
        body: response.body
      }
    })
    warnings.push(...scriptLogWarnings(out.logs, 'post'))
    assertionResults.push(...scriptAssertionResults(out))
    scriptEnv = [...scriptEnv, ...scriptEnvResults(out.envSet)]
  }

  return {
    response,
    validation,
    requestValidation,
    assertionResults,
    // Primero lo de los scripts: si una extracción asigna la misma variable, esa gana
    extractions: [...scriptEnv, ...extractions],
    warnings
  }
}
