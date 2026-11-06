import type { CookieInfo, CookieInput } from './types'

export const COOKIES_FORMAT = 'sonda-cookies'

type Json = Record<string, unknown>

const isObj = (x: unknown): x is Json => !!x && typeof x === 'object' && !Array.isArray(x)

/** Cookies a JSON legible. Los valores van en texto plano: el archivo hay que tratarlo como un secreto */
export function exportCookies(cookies: CookieInfo[]): string {
  return (
    JSON.stringify(
      {
        format: COOKIES_FORMAT,
        version: 1,
        cookies: cookies.map((c) => ({
          name: c.name,
          value: c.value,
          // Con punto inicial la cookie también aplica a los subdominios
          domain: (c.hostOnly ? '' : '.') + c.domain,
          path: c.path,
          secure: c.secure,
          expiresAt: c.expiresAt
        }))
      },
      null,
      2
    ) + '\n'
  )
}

/** Fecha de expiración en ms: `expiresAt` (Sonda) o `expirationDate` en segundos (extensiones del navegador) */
function expiryOf(c: Json): number | null | undefined {
  if (c.session === true) return null
  if (c.expiresAt === null) return null
  if (typeof c.expiresAt === 'number' && Number.isFinite(c.expiresAt)) return c.expiresAt
  if (typeof c.expirationDate === 'number' && Number.isFinite(c.expirationDate)) {
    return Math.round(c.expirationDate * 1000)
  }
  // Sin ninguna fecha: se trata como cookie de sesión
  return c.expiresAt === undefined && c.expirationDate === undefined ? null : undefined
}

function toInput(raw: unknown, now: number): CookieInput | null {
  if (!isObj(raw) || typeof raw.name !== 'string' || typeof raw.domain !== 'string') return null

  let domain = raw.domain.trim().toLowerCase()
  // Las extensiones del navegador marcan hostOnly aparte; el punto inicial decide en el resto
  if (raw.hostOnly === true) domain = domain.replace(/^\./, '')
  else if (raw.hostOnly === false && !domain.startsWith('.')) domain = `.${domain}`

  const expiresAt = expiryOf(raw)
  if (expiresAt === undefined) return null
  if (expiresAt !== null && expiresAt <= now) return null // ya venció

  return {
    name: raw.name,
    value: typeof raw.value === 'string' ? raw.value : '',
    domain,
    path: typeof raw.path === 'string' && raw.path ? raw.path : '/',
    secure: raw.secure === true,
    expiresAt
  }
}

/**
 * Lee un archivo de cookies: el formato de Sonda ({ cookies: [...] }) o el arreglo JSON que
 * exportan Cookie-Editor y EditThisCookie. Lo que no se pueda leer o ya venció cuenta como omitido.
 */
export function parseCookiesImport(
  text: string,
  now = Date.now()
): { cookies: CookieInput[]; skipped: number } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }

  const list = Array.isArray(data) ? data : isObj(data) ? data.cookies : undefined
  if (!Array.isArray(list)) {
    throw new Error('El archivo no tiene una lista de cookies')
  }

  const cookies: CookieInput[] = []
  let skipped = 0
  for (const raw of list) {
    const input = toInput(raw, now)
    if (input) cookies.push(input)
    else skipped++
  }
  return { cookies, skipped }
}
