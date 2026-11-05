import type { CookieInput } from './types'

export interface ParsedCookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
  secure: boolean
  expiresAt: number | null
}

export type CookieParse = { ok: true; cookie: ParsedCookie } | { ok: false; error: string }

// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\s=;,"\\\x00-\x1f\x7f]/
// eslint-disable-next-line no-control-regex
const BAD_VALUE = /[;\x00-\x1f\x7f]/
const DOMAIN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/

/** Valida y normaliza una cookie escrita a mano */
export function parseCookieInput(input: CookieInput, now = Date.now()): CookieParse {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'El nombre es obligatorio' }
  if (BAD_NAME.test(name)) {
    return { ok: false, error: 'El nombre no puede tener espacios ni los caracteres = ; , "' }
  }

  const value = input.value.trim()
  if (BAD_VALUE.test(value)) {
    return { ok: false, error: 'El valor no puede tener ; ni saltos de línea' }
  }

  const rawDomain = input.domain.trim().toLowerCase()
  if (!rawDomain) return { ok: false, error: 'El dominio es obligatorio' }
  const hostOnly = !rawDomain.startsWith('.')
  const domain = rawDomain.replace(/^\./, '')
  if (!DOMAIN.test(domain)) {
    return { ok: false, error: 'Dominio inválido. Usa solo el host, ej: api.ejemplo.com' }
  }

  const path = input.path.trim() || '/'
  if (!path.startsWith('/')) return { ok: false, error: 'La ruta debe empezar con /' }

  if (input.expiresAt !== null) {
    if (!Number.isFinite(input.expiresAt))
      return { ok: false, error: 'Fecha de expiración inválida' }
    if (input.expiresAt <= now) return { ok: false, error: 'La fecha de expiración ya pasó' }
  }

  return {
    ok: true,
    cookie: {
      name,
      value,
      domain,
      hostOnly,
      path,
      secure: input.secure,
      expiresAt: input.expiresAt
    }
  }
}
