import type { AuthConfig } from './types'

export type AuthSource = 'request' | 'folder' | 'collection' | 'none'

export interface ResolvedAuth {
  /** Auth que se aplica de verdad (null = ninguna) */
  auth: AuthConfig | null
  /** De dónde salió */
  source: AuthSource
}

export interface AuthParts {
  headers: { key: string; value: string }[]
  query: { key: string; value: string }[]
  /** Motivos por los que la auth configurada no se pudo aplicar (valores vacíos, etc.) */
  warnings: string[]
}

export const emptyAuth = (): AuthConfig => ({
  type: 'inherit',
  token: '',
  username: '',
  password: '',
  keyName: '',
  keyValue: '',
  keyIn: 'header'
})

/** Base64 de un texto UTF-8 (btoa solo acepta Latin-1) */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * Convierte la configuración de auth en el header o parámetro de query que hay que enviar.
 * `resolve` sustituye las {{variables}}; solo se resuelven los campos del tipo activo.
 * Si faltan los datos (token vacío, etc.) no se agrega nada y se reporta en `warnings`.
 */
export function buildAuth(
  auth: AuthConfig | null | undefined,
  resolve: (text: string) => string
): AuthParts {
  const parts: AuthParts = { headers: [], query: [], warnings: [] }
  if (!auth) return parts

  switch (auth.type) {
    case 'bearer': {
      // Si pegaron el valor completo ("Bearer abc"), no lo duplicamos
      const token = resolve(auth.token)
        .trim()
        .replace(/^bearer\s+/i, '')
      if (token) parts.headers.push({ key: 'Authorization', value: `Bearer ${token}` })
      else
        parts.warnings.push(
          'Auth Bearer: el token está vacío, no se envió el header Authorization.'
        )
      break
    }
    case 'basic': {
      const user = resolve(auth.username)
      const pass = resolve(auth.password)
      if (user || pass) {
        parts.headers.push({ key: 'Authorization', value: `Basic ${toBase64(`${user}:${pass}`)}` })
      } else {
        parts.warnings.push(
          'Auth Basic: usuario y contraseña están vacíos, no se envió el header Authorization.'
        )
      }
      break
    }
    case 'apikey': {
      const key = resolve(auth.keyName).trim()
      const value = resolve(auth.keyValue)
      if (key && value) {
        if (auth.keyIn === 'query') parts.query.push({ key, value })
        else parts.headers.push({ key, value })
      } else if (!key) {
        parts.warnings.push('Auth API Key: falta el nombre, no se agregó.')
      } else {
        parts.warnings.push(`Auth API Key: el valor de "${key}" está vacío, no se agregó.`)
      }
      break
    }
  }
  return parts
}

/**
 * Decide qué auth se aplica: la primera que no sea "inherit", yendo de la petición
 * a su carpeta y luego a su colección. "none" corta la herencia y no envía auth.
 */
export function resolveAuth(
  request: AuthConfig | null | undefined,
  folder: AuthConfig | null | undefined,
  collection: AuthConfig | null | undefined
): ResolvedAuth {
  const levels: [AuthSource, AuthConfig | null | undefined][] = [
    ['request', request],
    ['folder', folder],
    ['collection', collection]
  ]
  for (const [source, auth] of levels) {
    if (!auth || auth.type === 'inherit') continue
    return { auth: auth.type === 'none' ? null : auth, source }
  }
  return { auth: null, source: 'none' }
}