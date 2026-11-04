import type { CurlRequest } from './curl'
import { SENSITIVE_HEADERS, SENSITIVE_QUERY, isSecretField, redactBodyText } from './history'

/** Lo que queda en lugar de una credencial */
export const REDACTED = '<oculto>'

/** Una {{variable}} no es un secreto: su valor vive en el entorno, así que se deja tal cual */
const isVariable = (value: string): boolean => value.includes('{{')

/** "Bearer abc123" → "Bearer <oculto>"; sin esquema, todo el valor se oculta */
function redactHeaderValue(key: string, value: string): string {
  if (isVariable(value)) return value
  const lower = key.trim().toLowerCase()
  if (lower === 'authorization' || lower === 'proxy-authorization') {
    const scheme = /^(\S+)\s+\S/.exec(value.trim())
    if (scheme) return `${scheme[1]} ${REDACTED}`
  }
  return REDACTED
}

/** Oculta tokens en la query y la contraseña incrustada en la URL (https://usuario:clave@host) */
function redactUrl(url: string): string {
  return url
    .replace(SENSITIVE_QUERY, (match, prefix: string, value: string) =>
      isVariable(value) ? match : `${prefix}${REDACTED}`
    )
    .replace(/^(https?:\/\/[^/@\s:]+):([^@/\s]+)@/i, (match, start: string, pass: string) =>
      isVariable(pass) ? match : `${start}:${REDACTED}@`
    )
}

/**
 * Copia de la petición sin credenciales en texto plano, pensada para compartirla
 * (chat, ticket, documentación). Las referencias {{variable}} se conservan.
 */
export function redactRequest(req: CurlRequest): CurlRequest {
  let user = req.user
  if (user) {
    const i = user.indexOf(':')
    if (i !== -1 && !isVariable(user.slice(i + 1))) user = `${user.slice(0, i)}:${REDACTED}`
  }

  return {
    ...req,
    url: redactUrl(req.url),
    headers: req.headers.map((h) =>
      SENSITIVE_HEADERS.has(h.key.trim().toLowerCase())
        ? { ...h, value: redactHeaderValue(h.key, h.value) }
        : h
    ),
    body: redactBodyText(req.body, REDACTED),
    ...(req.formData
      ? {
          formData: req.formData.map((p) =>
            p.kind === 'text' && isSecretField(p.key) && !isVariable(p.value)
              ? { ...p, value: REDACTED }
              : p
          )
        }
      : {}),
    ...(user !== undefined ? { user } : {})
  }
}
