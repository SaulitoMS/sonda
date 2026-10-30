import type { Assertion, AuthConfig, Extraction, HttpMethod } from './types'

export interface SignatureInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string; enabled: boolean }[]
  body: string
  auth: AuthConfig
  assertions: Assertion[]
  extractions: Extraction[]
}

/**
 * Texto que representa lo que se guardaría en el archivo de la petición.
 * Si dos firmas son iguales, no hay cambios sin guardar.
 */
export function requestSignature(r: SignatureInput): string {
  return JSON.stringify({
    method: r.method,
    url: r.url.trim(),
    headers: r.headers
      .filter((h) => h.key.trim())
      .map((h) => ({ key: h.key, value: h.value, enabled: h.enabled })),
    body: r.body,
    auth: r.auth.type === 'none' ? null : r.auth,
    assertions: r.assertions,
    extractions: r.extractions
  })
}

/** true si la petición difiere de su línea base (lo último guardado o abierto) */
export const isDirtyState = (s: SignatureInput & { baseline: string }): boolean =>
  requestSignature(s) !== s.baseline
