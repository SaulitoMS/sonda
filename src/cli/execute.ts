import { evaluateAssertions } from '../shared/assertions'
import { buildAuth, resolveAuth, toBase64 } from '../shared/auth'
import { formDataParts, urlencodedBody } from '../shared/bodyForm'
import { evaluateExtractions } from '../shared/extract'
import { inheritedHeaders } from '../shared/headers'
import { appendQuery } from '../shared/params'
import { validateRequestBody, validateResponse } from '../shared/validate'
import { buildVarMap, interpolate } from '../shared/variables'
import type {
  AssertionResult,
  CollectionItem,
  Environment,
  ExtractionResult,
  SavedRequest,
  SchemaValidation,
  SendRequestInput,
  SendRequestResult
} from '../shared/types'

type Send = (input: SendRequestInput) => Promise<SendRequestResult>

export interface ExecuteResult {
  response: SendRequestResult
  validation: SchemaValidation | null
  requestValidation: SchemaValidation | null
  assertionResults: AssertionResult[]
  extractions: ExtractionResult[]
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

const failed = (error: string): ExecuteResult => ({
  response: { ok: false, error, timeMs: 0 },
  validation: null,
  requestValidation: null,
  assertionResults: [],
  extractions: [],
  warnings: []
})

/** Tokens OAuth ya pedidos en esta ejecución (client_credentials), por credenciales */
const oauthCache = new Map<string, { token: string; expiresAt: number }>()

async function getOAuthToken(
  send: Send,
  p: { tokenUrl: string; clientId: string; clientSecret: string; scope: string }
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!p.tokenUrl) return { ok: false, error: 'OAuth 2.0: falta la URL del token.' }
  if (!p.clientId) return { ok: false, error: 'OAuth 2.0: falta el Client ID.' }

  const key = JSON.stringify([p.tokenUrl, p.clientId, p.clientSecret, p.scope])
  const hit = oauthCache.get(key)
  if (hit && hit.expiresAt > Date.now()) return { ok: true, token: hit.token }

  const body = new URLSearchParams({ grant_type: 'client_credentials' })
  if (p.scope.trim()) body.set('scope', p.scope.trim())

  const res = await send({
    method: 'POST',
    url: p.tokenUrl,
    headers: [
      { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
      { key: 'Accept', value: 'application/json' },
      { key: 'Authorization', value: `Basic ${toBase64(`${p.clientId}:${p.clientSecret}`)}` }
    ],
    body: body.toString()
  })
  if (!res.ok) return { ok: false, error: `OAuth 2.0: no se pudo pedir el token (${res.error})` }

  let json: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(res.body)
    if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>
  } catch {
    // se reporta abajo, junto con el status
  }
  const token = typeof json.access_token === 'string' ? json.access_token : ''
  if (res.status < 200 || res.status >= 300 || !token) {
    const detail =
      typeof json.error_description === 'string'
        ? json.error_description
        : typeof json.error === 'string'
          ? json.error
          : res.body.slice(0, 200) || res.statusText
    return {
      ok: false,
      error: `OAuth 2.0: el servidor respondió ${res.status}${detail ? ` · ${detail}` : ''}`
    }
  }

  const ttl = Number(json.expires_in)
  const ttlMs = (Number.isFinite(ttl) && ttl > 0 ? ttl : 3600) * 1000
  oauthCache.set(key, { token, expiresAt: Date.now() + ttlMs - 30_000 })
  return { ok: true, token }
}

/**
 * Misma lógica que `executeRequest` del renderer (resolver variables, heredar headers y auth,
 * enviar, validar contra el schema y evaluar aserciones y extracciones), pero sin ventana.
 */
export async function executeRequest(
  draft: SavedRequest,
  env: Environment | null,
  options: { path: string; collections: CollectionItem[]; send: Send }
): Promise<ExecuteResult> {
  const vars = buildVarMap(env)
  const missing = new Set<string>()
  const resolve = (text: string): string => {
    const result = interpolate(text, vars)
    result.missing.forEach((m) => missing.add(m))
    return result.text
  }

  // La colección y la carpeta salen de la ruta: "coleccion/carpeta/peticion.json"
  const parts = options.path.split('/')
  const collection = options.collections.find((c) => c.id === parts[0])
  const folder = parts.length > 2 ? collection?.folders.find((f) => f.name === parts[1]) : undefined

  const mode = draft.bodyForm?.mode ?? 'raw'
  const formFields = draft.bodyForm?.fields ?? []

  let finalUrl = resolve(draft.url.trim())
  const finalBody =
    mode === 'urlencoded'
      ? urlencodedBody(formFields, resolve) || undefined
      : mode === 'raw' && draft.body.trim()
        ? resolve(draft.body)
        : undefined
  const formParts = mode === 'form-data' ? formDataParts(formFields, resolve) : undefined

  const headers = draft.headers
    .filter((h) => h.enabled && h.key.trim())
    .map((h) => ({ key: resolve(h.key), value: resolve(h.value) }))

  // Headers heredados: los de la petición tienen prioridad
  for (const h of inheritedHeaders(folder?.headers, collection?.headers)) {
    const key = resolve(h.key)
    if (!headers.some((x) => x.key.toLowerCase() === key.toLowerCase())) {
      headers.push({ key, value: resolve(h.value) })
    }
  }

  const auth = resolveAuth(draft.auth, folder?.auth, collection?.auth).auth
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
      ? `Defínelas en el entorno "${env.name}", con --var o con SONDA_VAR_<nombre>.`
      : 'Usa --env, --var o SONDA_VAR_<nombre>.'
    return failed(`Variables sin definir: ${names}. ${hint}`)
  }

  if (oauth) {
    const result = await getOAuthToken(options.send, oauth)
    if (!result.ok) return failed(result.error)
    authParts.headers.push({ key: 'Authorization', value: `Bearer ${result.token}` })
  }

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

  const requestValidation = validateRequestBody({
    schema: draft.requestSchema,
    method: draft.method,
    body: mode === 'raw' ? (finalBody ?? '') : ''
  })
  const warnings = [...authParts.warnings]
  if (requestValidation?.verdict === 'invalid') {
    const n = requestValidation.issues.filter((i) => i.severity === 'error').length
    warnings.push(`El body enviado no cumple el schema de la spec (${n} errores).`)
  }

  const response = await options.send({
    method: draft.method,
    url: finalUrl,
    headers,
    body: finalBody,
    formData: formParts
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

  return {
    response,
    validation,
    requestValidation,
    assertionResults: response.ok ? evaluateAssertions(draft.assertions, response) : [],
    extractions: response.ok ? evaluateExtractions(draft.extractions, response) : [],
    warnings
  }
}
