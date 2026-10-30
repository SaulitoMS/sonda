import { toBodyFormData } from './bodyForm'
import type { Assertion, AuthConfig, BodyFormData, Extraction, HttpMethod } from './types'

export interface SignatureInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  bodyForm?: BodyFormData
  auth: AuthConfig
  assertions: Assertion[]
  extractions: Extraction[]
}

export function requestSignature(r: SignatureInput): string {
  const bodyForm = r.bodyForm ? toBodyFormData(r.bodyForm) : undefined
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
    // Solo entra a la firma si existe, así las pestañas guardadas antes no aparecen como modificadas
    ...(bodyForm ? { bodyForm } : {})
  })
}

/** true si la petición difiere de su línea base (lo último guardado o abierto) */
export const isDirtyState = (s: SignatureInput & { baseline: string }): boolean =>
  requestSignature(s) !== s.baseline