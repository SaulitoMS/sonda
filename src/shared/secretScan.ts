import { SENSITIVE_HEADERS, SENSITIVE_QUERY, isSecretField } from './history'
import type { AuthConfig, KeyValueData, SavedRequest } from './types'

export interface SecretFinding {
  /** Dónde está: "Header Authorization", "Auth · Bearer", "Body · password"… */
  field: string
  /** Valor tapado, nunca el secreto completo */
  preview: string
}

// Una {{variable}} no es un secreto: su valor vive en el entorno
const isLiteral = (value: string | undefined): value is string =>
  !!value && value.trim() !== '' && !value.includes('{{')

/** "eyJhbGciOi…" → "ey••••" (nunca devuelve el valor completo) */
export function maskSecret(value: string): string {
  const v = value.trim()
  return v.length <= 6 ? '••••' : `${v.slice(0, 2)}••••`
}

const JSON_SECRET =
  /"(password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api[-_]?key|apikey)"\s*:\s*"([^"\\]+)"/gi

/** Credenciales escritas en texto plano dentro de la auth de una petición, carpeta o colección */
export function scanAuth(auth: AuthConfig | undefined): SecretFinding[] {
  if (!auth) return []
  const out: SecretFinding[] = []
  const add = (field: string, value: string | undefined): void => {
    if (isLiteral(value)) out.push({ field: `Auth · ${field}`, preview: maskSecret(value) })
  }
  switch (auth.type) {
    case 'bearer':
      add('Bearer', auth.token)
      break
    case 'basic':
    case 'digest':
      add('contraseña', auth.password)
      break
    case 'apikey':
      add(auth.keyName ? `API Key (${auth.keyName})` : 'API Key', auth.keyValue)
      break
    case 'oauth2':
      add('client secret', auth.oauthClientSecret)
      add('contraseña OAuth', auth.oauthPassword)
      break
    case 'oauth1':
      add('Consumer Secret', auth.password)
      add('Access Token', auth.token)
      add('Token Secret', auth.oauth1TokenSecret)
      break
    case 'awsv4':
      add('Secret Key', auth.password)
      add('Session Token', auth.token)
      break
    default:
      break
  }
  return out
}

/** Headers sensibles con un valor fijo (los desactivados no cuentan: no se envían) */
export function scanHeaders(headers: KeyValueData[] | undefined): SecretFinding[] {
  return (headers ?? [])
    .filter((h) => h.enabled && SENSITIVE_HEADERS.has(h.key.trim().toLowerCase()))
    .filter((h) => isLiteral(h.value))
    .map((h) => ({ field: `Header ${h.key.trim()}`, preview: maskSecret(h.value) }))
}

export function scanRequest(r: SavedRequest): SecretFinding[] {
  const out: SecretFinding[] = [...scanAuth(r.auth), ...scanHeaders(r.headers)]

  for (const m of r.url.matchAll(SENSITIVE_QUERY)) {
    if (isLiteral(m[2]))
      out.push({ field: `URL · ${m[1].slice(1, -1)}`, preview: maskSecret(m[2]) })
  }
  const userinfo = /^https?:\/\/[^/@\s:]+:([^@/\s]+)@/i.exec(r.url)
  if (userinfo && isLiteral(userinfo[1])) {
    out.push({ field: 'URL · contraseña', preview: maskSecret(userinfo[1]) })
  }

  for (const m of r.body.matchAll(JSON_SECRET)) {
    if (isLiteral(m[2])) out.push({ field: `Body · ${m[1]}`, preview: maskSecret(m[2]) })
  }
  for (const f of r.bodyForm?.fields ?? []) {
    if (f.enabled && f.type === 'text' && isSecretField(f.key) && isLiteral(f.value)) {
      out.push({ field: `Formulario · ${f.key}`, preview: maskSecret(f.value) })
    }
  }
  return out
}
