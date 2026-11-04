import { toBodyFormData } from './bodyForm'
import { cleanOverrides, hasOverrides } from './requestOverrides'
import type {
  Assertion,
  AuthConfig,
  BodyFormData,
  Extraction,
  HttpMethod,
  RequestOverrides
} from './types'

export interface SignatureInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  bodyForm?: BodyFormData
  auth: AuthConfig
  assertions: Assertion[]
  extractions: Extraction[]
  /** Notas o documentación de la petición */
  description?: string
  /** Scripts de la petición */
  preScript?: string
  postScript?: string
  /** Tiempo límite y redirecciones propios de la petición */
  overrides?: RequestOverrides
}

export function requestSignature(r: SignatureInput): string {
  const bodyForm = r.bodyForm ? toBodyFormData(r.bodyForm) : undefined
  const description = r.description?.trim()
  const overrides = cleanOverrides(r.overrides)
  return JSON.stringify({
    method: r.method,
    url: r.url.trim(),
    headers: r.headers
      .filter((h) => h.key.trim())
      .map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })),
    body: r.body,
    auth: r.auth.type === 'inherit' ? null : r.auth,
    assertions: r.assertions,
    extractions: r.extractions,
    // Solo entran a la firma si existen, así las pestañas guardadas antes no aparecen como modificadas
    ...(bodyForm ? { bodyForm } : {}),
    ...(description ? { description } : {}),
    ...(r.preScript?.trim() ? { preScript: r.preScript } : {}),
    ...(r.postScript?.trim() ? { postScript: r.postScript } : {}),
    ...(hasOverrides(overrides) ? { overrides } : {})
  })
}

/** true si la petición difiere de su línea base (lo último guardado o abierto) */
export const isDirtyState = (s: SignatureInput & { baseline: string }): boolean =>
  requestSignature(s) !== s.baseline
